-- Gradually revisit existing GLVietsub titles after Server 1 HLS support.
-- pg_cron is UTC: 17:00-22:59 UTC = 00:00-05:59 Vietnam time.
create table if not exists public.glvietsub_hls_backfill_attempts (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  attempt_count integer not null default 1,
  request_id bigint
);

alter table public.glvietsub_hls_backfill_attempts enable row level security;
revoke all on public.glvietsub_hls_backfill_attempts from public, anon, authenticated;
grant select on public.glvietsub_hls_backfill_attempts to service_role;

create or replace function public.dispatch_glvietsub_hls_backfill(p_limit integer default 2)
returns integer
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  candidate record;
  cron_secret text;
  dispatched integer := 0;
  queued_request_id bigint;
begin
  -- Also enforce the window inside the function so a manual call cannot
  -- accidentally start a broad refresh during viewer peaks.
  if extract(hour from now() at time zone 'UTC') not between 17 and 22 then
    return 0;
  end if;
  if (select mode from public.runtime_capacity_state where singleton = true) is distinct from 'normal' then
    return 0;
  end if;
  if not pg_try_advisory_xact_lock(20261014, 173000) then
    return 0;
  end if;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'CRON_SECRET'
  order by created_at desc
  limit 1;
  if coalesce(cron_secret, '') = '' then
    raise exception 'CRON_SECRET is not configured';
  end if;

  for candidate in
    select movie.id,
      substring(coalesce(nullif(movie.source_url, ''), nullif(movie.showtimes, ''), '')
        from '/(?:phim-bo|phim-le)/([^/?#]+)') as source_slug
    from public.movies movie
    left join public.glvietsub_hls_backfill_attempts attempt on attempt.movie_id = movie.id
    where lower(coalesce(movie.source_site, '')) = 'glvietsub'
      and (attempt.movie_id is null or (attempt.attempt_count < 3 and attempt.attempted_at < now() - interval '24 hours'))
      and substring(coalesce(nullif(movie.source_url, ''), nullif(movie.showtimes, ''), '')
        from '/(?:phim-bo|phim-le)/([^/?#]+)') ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and not exists (
        select 1 from public.movie_episodes episode
        where episode.movie_id = movie.id
          and episode.source = 'glvietsub'
          and episode.server_name like 'GLVietsub%HLS 1'
          and coalesce(episode.link_m3u8, '') <> ''
      )
    order by attempt.attempted_at asc nulls first, movie.last_synced_at asc nulls first
    limit greatest(1, least(coalesce(p_limit, 2), 2))
  loop
    if candidate.source_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      continue;
    end if;
    queued_request_id := net.http_get(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-glvietsub-feed?slug=' || candidate.source_slug,
      headers := jsonb_build_object('x-cron-secret', cron_secret),
      timeout_milliseconds := 120000
    );
    insert into public.glvietsub_hls_backfill_attempts (movie_id, attempted_at, attempt_count, request_id)
    values (candidate.id, now(), 1, queued_request_id)
    on conflict (movie_id) do update
      set attempted_at = excluded.attempted_at,
          attempt_count = public.glvietsub_hls_backfill_attempts.attempt_count + 1,
          request_id = excluded.request_id;
    dispatched := dispatched + 1;
  end loop;
  return dispatched;
end;
$$;

revoke all on function public.dispatch_glvietsub_hls_backfill(integer) from public, anon, authenticated;
grant execute on function public.dispatch_glvietsub_hls_backfill(integer) to service_role;

do $schedule$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'backfill-glvietsub-hls-offpeak';

  perform cron.schedule(
    'backfill-glvietsub-hls-offpeak',
    '*/5 17-22 * * *',
    $command$select public.dispatch_glvietsub_hls_backfill(2);$command$
  );
end;
$schedule$;
