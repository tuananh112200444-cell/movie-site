-- Per-stream audio metadata is additive and nullable, so older clients and
-- existing sync jobs remain compatible during rolling deployment.
create or replace function public.infer_audio_type(value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when lower(coalesce(value, '')) ~ '(thuy[eế]t[ _-]*minh|voice[ _-]*over|(^|[^a-z])tm([^a-z]|$))' then 'thuyetminh'
    when lower(coalesce(value, '')) ~ '(l[oồ]ng[ _-]*ti[eế]ng|dubbed|(^|[^a-z])dub([^a-z]|$)|(^|[^a-z])lt([^a-z]|$))' then 'longtieng'
    when lower(coalesce(value, '')) ~ '(viet[ _-]*sub|ph[uụ][ _-]*d[eề]|(^|[^a-z])sub([^a-z]|$)|(^|[^a-z])vs([^a-z]|$))' then 'vietsub'
    else null
  end
$$;

do $$
begin
  if to_regclass('public.movie_episodes') is not null then
    alter table public.movie_episodes add column if not exists audio_type text;
    alter table public.movie_episodes drop constraint if exists movie_episodes_audio_type_check;
    alter table public.movie_episodes add constraint movie_episodes_audio_type_check
      check (audio_type is null or audio_type in ('vietsub','thuyetminh','longtieng','raw')) not valid;
  end if;

  if to_regclass('public.streams') is not null then
    alter table public.streams add column if not exists audio_type text;
    alter table public.streams drop constraint if exists streams_audio_type_check;
    alter table public.streams add constraint streams_audio_type_check
      check (audio_type is null or audio_type in ('vietsub','thuyetminh','longtieng','raw')) not valid;
  end if;
end $$;

create or replace function public.backfill_audio_type_batch(p_limit integer default 300)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare changed integer := 0;
declare step_count integer := 0;
begin
  with targets as materialized (
    select e.ctid, public.infer_audio_type(concat_ws(' ', e.server_name, e.source, e.episode_name)) as inferred
    from public.movie_episodes e
    where e.audio_type is null
      and public.infer_audio_type(concat_ws(' ', e.server_name, e.source, e.episode_name)) is not null
    limit greatest(20, least(p_limit, 500))
  )
  update public.movie_episodes e set audio_type = targets.inferred
  from targets where e.ctid = targets.ctid and targets.inferred is not null;
  get diagnostics changed = row_count;

  with targets as materialized (
    select s.ctid, public.infer_audio_type(s.server_name) as inferred
    from public.streams s
    where s.audio_type is null and public.infer_audio_type(s.server_name) is not null
    limit greatest(20, least(p_limit, 500))
  )
  update public.streams s set audio_type = targets.inferred
  from targets where s.ctid = targets.ctid and targets.inferred is not null;
  get diagnostics step_count = row_count;
  return changed + step_count;
end
$$;

create or replace function public.fill_stream_audio_type()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare movie_lang text;
begin
  if new.audio_type is null and new.movie_id is not null then
    select lang into movie_lang from public.movies where id = new.movie_id;
    new.audio_type := coalesce(public.infer_audio_type(new.server_name), public.infer_audio_type(movie_lang));
  end if;
  return new;
end
$$;

do $$
begin
  if to_regclass('public.movie_episodes') is not null then
    drop trigger if exists trg_movie_episodes_audio_type on public.movie_episodes;
    create trigger trg_movie_episodes_audio_type before insert or update of server_name, audio_type, movie_id
      on public.movie_episodes for each row execute function public.fill_stream_audio_type();
  end if;
  if to_regclass('public.streams') is not null then
    drop trigger if exists trg_streams_audio_type on public.streams;
    create trigger trg_streams_audio_type before insert or update of server_name, audio_type, movie_id
      on public.streams for each row execute function public.fill_stream_audio_type();
  end if;
end $$;

-- Keep the full search index hot without placing credentials in the URL.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'warm-search-index-every-10-minutes';
    perform cron.schedule(
      'warm-search-index-every-10-minutes',
      '7,17,27,37,47,57 * * * *',
      $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/search-index-proxy?limit=5000&refresh=1',
        headers := jsonb_build_object(
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 60000
      );
      $cmd$
    );
    perform cron.unschedule(jobid) from cron.job where jobname = 'backfill-audio-type-every-10-minutes';
    perform cron.schedule(
      'backfill-audio-type-every-10-minutes',
      '4,14,24,34,44,54 * * * *',
      $cmd$select public.backfill_audio_type_batch(300);$cmd$
    );
  end if;
end $$;

revoke all on function public.infer_audio_type(text) from public;
grant execute on function public.infer_audio_type(text) to service_role;
revoke all on function public.fill_stream_audio_type() from public;
revoke all on function public.backfill_audio_type_batch(integer) from public, anon, authenticated;
grant execute on function public.backfill_audio_type_batch(integer) to service_role;
