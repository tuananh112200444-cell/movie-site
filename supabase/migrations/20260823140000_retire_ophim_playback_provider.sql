-- Retire OPhim without deleting catalogue history. Public playback, scoring,
-- repair and publication decisions must treat the provider as unavailable
-- immediately; physical stream flags are drained in small off-peak batches.

begin;

create table if not exists public.retired_playback_providers (
  provider text primary key,
  retired_at timestamptz not null default now(),
  reason text not null,
  aliases text[] not null default '{}'::text[]
);

insert into public.retired_playback_providers (provider, retired_at, reason, aliases)
values (
  'ophim',
  now(),
  'Provider retired after confirmed catalogue-wide playback failure; opstream manifests are unavailable.',
  array['ophim1.com', 'opstream']::text[]
)
on conflict (provider) do update set
  retired_at = excluded.retired_at,
  reason = excluded.reason,
  aliases = excluded.aliases;

alter table public.retired_playback_providers enable row level security;
revoke all on table public.retired_playback_providers from public, anon, authenticated;
grant select on table public.retired_playback_providers to service_role;

create or replace function public.is_retired_playback_source(
  p_source text,
  p_server_name text,
  p_stream_url text,
  p_embed_url text
)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select
    lower(coalesce(p_source, '')) ~ '(^|[^a-z0-9])ophim([^a-z0-9]|$)'
    or lower(coalesce(p_server_name, '')) ~ '(^|[^a-z0-9])ophim([^a-z0-9]|$)|opstream'
    or lower(coalesce(p_stream_url, '')) ~ 'ophim1\.com|opstream'
    or lower(coalesce(p_embed_url, '')) ~ 'ophim1\.com|opstream';
$$;

revoke all on function public.is_retired_playback_source(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.is_retired_playback_source(text,text,text,text)
  to service_role;

create or replace function public.playback_provider_key(
  p_source text,
  p_stream_url text,
  p_embed_url text
)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when public.is_retired_playback_source(p_source, '', p_stream_url, p_embed_url) then null
    when lower(concat_ws(' ', p_source, p_stream_url, p_embed_url)) ~ 'streamvsmov|vsmov' then 'vsmov'
    when lower(concat_ws(' ', p_source, p_stream_url, p_embed_url)) ~ 'streamc\.xyz|nguonc' then 'nguonc'
    when lower(concat_ws(' ', p_source, p_stream_url, p_embed_url)) ~ 'phimapi|kkphim|phim1280' then 'kkphim'
    else null
  end;
$$;

create or replace function public.stream_row_is_publicly_usable(p_stream public.streams)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    not public.is_retired_playback_source(
      coalesce(p_stream.provider_key, p_stream.source),
      p_stream.server_name,
      p_stream.stream_url,
      p_stream.embed_url
    )
    and p_stream.is_active is true
    and (
      coalesce(trim(p_stream.stream_url), '') ~* '^https?://'
      or coalesce(trim(p_stream.embed_url), '') ~* '^https?://'
    )
    and lower(trim(coalesce(p_stream.health_status, 'unchecked'))) <> 'dead'
    and coalesce(p_stream.last_error, '') not like 'Provider verification pending:%'
    and not (
      lower(trim(coalesce(p_stream.health_status, 'unchecked'))) = 'failed'
      and coalesce(p_stream.failure_count, 0) >= 3
    )
    and not (
      lower(trim(coalesce(p_stream.health_status, 'unchecked'))) = 'blocked'
      and coalesce(p_stream.embed_url, '') !~* '^https?://player\.phimapi\.com/player/'
      and coalesce(p_stream.embed_url, '') !~* '^https?://[^/]*streamc\.xyz/'
    );
$$;

create or replace function public.movie_has_usable_persisted_playback(p_movie_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with legacy_links as materialized (
    select
      lower(trim(coalesce(episode.server_name, ''))) as server_name,
      lower(trim(coalesce(episode.slug, ''))) as episode_slug,
      rtrim(replace(trim(coalesce(episode.link_m3u8, '')), '&amp;', '&'), '/') as direct_url,
      rtrim(replace(trim(coalesce(episode.link_embed, '')), '&amp;', '&'), '/') as embed_url,
      lower(trim(coalesce(episode.source, ''))) as source
    from public.movie_episodes episode
    where episode.movie_id = p_movie_id
      and lower(trim(coalesce(episode.source, ''))) <> 'hidden'
      and not public.is_retired_playback_source(episode.source, episode.server_name, episode.link_m3u8, episode.link_embed)
      and (coalesce(trim(episode.link_m3u8), '') ~* '^https?://' or coalesce(trim(episode.link_embed), '') ~* '^https?://')
    union all
    select
      lower(trim(coalesce(episode.server_name, ''))),
      lower(trim(coalesce(episode.episode_slug, ''))),
      rtrim(replace(trim(coalesce(episode.link_m3u8, '')), '&amp;', '&'), '/'),
      rtrim(replace(trim(coalesce(episode.link_embed, '')), '&amp;', '&'), '/'),
      ''
    from public.episodes episode
    where episode.movie_id = p_movie_id
      and not public.is_retired_playback_source('', episode.server_name, episode.link_m3u8, episode.link_embed)
      and (coalesce(trim(episode.link_m3u8), '') ~* '^https?://' or coalesce(trim(episode.link_embed), '') ~* '^https?://')
  ), stream_health as materialized (
    select
      stream.is_active,
      lower(trim(coalesce(stream.server_name, ''))) as server_name,
      lower(trim(coalesce(stream.episode_slug, ''))) as episode_slug,
      rtrim(replace(trim(coalesce(stream.stream_url, '')), '&amp;', '&'), '/') as direct_url,
      rtrim(replace(trim(coalesce(stream.embed_url, '')), '&amp;', '&'), '/') as embed_url,
      lower(trim(coalesce(stream.health_status, 'unchecked'))) as health_status,
      coalesce(stream.failure_count, 0) as failure_count,
      coalesce(stream.last_error, '') as last_error,
      public.is_retired_playback_source(coalesce(stream.provider_key, stream.source), stream.server_name, stream.stream_url, stream.embed_url) as retired
    from public.streams stream
    where stream.movie_id = p_movie_id
  ), usable_streams as materialized (
    select *
    from stream_health stream
    where stream.retired is false
      and stream.is_active is true
      and (stream.direct_url ~* '^https?://' or stream.embed_url ~* '^https?://')
      and stream.health_status <> 'dead'
      and stream.last_error not like 'Provider verification pending:%'
      and not (stream.health_status = 'failed' and stream.failure_count >= 3)
      and not (
        stream.health_status = 'blocked'
        and stream.embed_url !~* '^https?://player\.phimapi\.com/player/'
        and stream.embed_url !~* '^https?://[^/]*streamc\.xyz/'
      )
  )
  select
    exists (select 1 from usable_streams)
    or exists (
      select 1
      from legacy_links legacy
      where
        not exists (
          select 1 from stream_health stream
          where stream.retired is false and (
            (legacy.direct_url <> '' and legacy.direct_url in (stream.direct_url, stream.embed_url))
            or (legacy.embed_url <> '' and legacy.embed_url in (stream.direct_url, stream.embed_url))
            or (legacy.server_name <> '' and legacy.episode_slug <> '' and legacy.server_name = stream.server_name and legacy.episode_slug = stream.episode_slug)
          )
        )
        or exists (
          select 1 from usable_streams stream
          where (legacy.direct_url <> '' and legacy.direct_url in (stream.direct_url, stream.embed_url))
             or (legacy.embed_url <> '' and legacy.embed_url in (stream.direct_url, stream.embed_url))
             or (legacy.server_name <> '' and legacy.episode_slug <> '' and legacy.server_name = stream.server_name and legacy.episode_slug = stream.episode_slug)
        )
    );
$$;

revoke all on function public.movie_has_usable_persisted_playback(uuid)
  from public, anon, authenticated;
grant execute on function public.movie_has_usable_persisted_playback(uuid)
  to service_role;

update public.system_brain_tasks
set enabled = false,
    status = 'idle',
    lease_until = null,
    next_run_at = 'infinity'::timestamptz,
    last_error = 'Disabled: OPhim provider retired',
    updated_at = now()
where lower(coalesce(params->>'provider', '')) = 'ophim'
   or lower(task_key) like '%ophim%';

do $disable_ophim_cron$
declare
  job record;
begin
  if to_regnamespace('cron') is null then return; end if;
  for job in
    select jobid
    from cron.job
    where active is true
      and (
        lower(jobname) like '%auto-sync-ophim%'
        or lower(command) like '%provider=ophim%'
        or lower(command) like '%"provider":"ophim"%'
      )
  loop
    perform cron.alter_job(job.jobid, active := false);
  end loop;
end;
$disable_ophim_cron$;

create or replace function public.retire_ophim_playback_batch(
  p_stream_limit integer default 10000,
  p_movie_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  retired_streams integer := 0;
  relabeled_movies integer := 0;
  hidden_movies integer := 0;
begin
  with target as materialized (
    select stream.id
    from public.streams stream
    where stream.is_active is true
      and public.is_retired_playback_source(
        coalesce(stream.provider_key, stream.source),
        stream.server_name,
        stream.stream_url,
        stream.embed_url
      )
    order by stream.updated_at nulls first, stream.id
    limit greatest(1, least(coalesce(p_stream_limit, 10000), 20000))
    for update skip locked
  )
  update public.streams stream
  set is_active = false,
      health_status = 'blocked',
      failure_count = greatest(coalesce(stream.failure_count, 0), 3),
      priority = 0,
      playback_score = 0,
      last_failure_at = coalesce(stream.last_failure_at, now()),
      last_error = 'Provider retired: OPhim/opstream is excluded from KhoPhim playback',
      updated_at = now()
  from target
  where stream.id = target.id;
  get diagnostics retired_streams = row_count;

  with candidates as materialized (
    select movie.id, public.movie_has_usable_persisted_playback(movie.id) as has_alternative
    from public.movies movie
    where lower(coalesce(movie.source_site, '') || ' ' || coalesce(movie.source_name, '')) ~ '(^|[^a-z0-9])ophim([^a-z0-9]|$)'
    order by movie.id
    limit greatest(1, least(coalesce(p_movie_limit, 1000), 2500))
    for update skip locked
  ), changed as (
    update public.movies movie
    set source_site = case when candidate.has_alternative then 'multi-provider' else 'retired-source' end,
        source_name = case when candidate.has_alternative then 'KhoPhim Multi-Provider' else 'Nguồn đã ngừng' end,
        is_published = case when candidate.has_alternative then movie.is_published else false end,
        seo_catalog_status = case
          when candidate.has_alternative then movie.seo_catalog_status
          when lower(coalesce(movie.seo_catalog_status, '')) in ('hidden', 'draft', 'superseded') then movie.seo_catalog_status
          else 'awaiting_playback'
        end,
        updated_at = now()
    from candidates candidate
    where movie.id = candidate.id
    returning candidate.has_alternative
  )
  select
    count(*) filter (where has_alternative),
    count(*) filter (where not has_alternative)
  into relabeled_movies, hidden_movies
  from changed;

  return jsonb_build_object(
    'retired_streams', retired_streams,
    'relabeled_movies', coalesce(relabeled_movies, 0),
    'hidden_movies', coalesce(hidden_movies, 0),
    'effective_policy', 'ophim_retired'
  );
end;
$$;

revoke all on function public.retire_ophim_playback_batch(integer,integer)
  from public, anon, authenticated;
grant execute on function public.retire_ophim_playback_batch(integer,integer)
  to service_role;

do $schedule_retirement$
declare
  job record;
begin
  if to_regnamespace('cron') is null then return; end if;
  for job in
    select jobid from cron.job
    where jobname in ('retire-ophim-playback-offpeak', 'retire-ophim-playback-offpeak-tail')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
  -- UTC 17:15-22:25 = Vietnam 00:15-05:25. Ten-minute gaps keep I/O bounded.
  perform cron.schedule(
    'retire-ophim-playback-offpeak',
    '15,25,35,45,55 17-21 * * *',
    'select public.retire_ophim_playback_batch(10000, 1000);'
  );
  perform cron.schedule(
    'retire-ophim-playback-offpeak-tail',
    '5,15,25 22 * * *',
    'select public.retire_ophim_playback_batch(10000, 1000);'
  );
end;
$schedule_retirement$;

comment on table public.retired_playback_providers is
  'Authoritative deny-list for providers removed from public playback; historical identities remain private for rollback and audit.';
comment on function public.retire_ophim_playback_batch(integer,integer) is
  'Physically retires OPhim stream flags and relabels/hides affected movies in bounded off-peak batches.';

commit;
