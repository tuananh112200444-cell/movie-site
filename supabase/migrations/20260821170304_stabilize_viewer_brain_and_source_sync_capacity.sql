-- Keep player telemetry cheap on the request path and bound all viewer/source
-- learning in a compact asynchronous queue.  The previous AFTER INSERT trigger
-- recomputed 24 hours of playback sessions synchronously for every heartbeat;
-- under real traffic that made telemetry inserts, search and sync all contend
-- for the same database connections.

create table if not exists public.playback_learning_queue (
  movie_slug text not null,
  episode_slug text not null,
  source_host text not null,
  queued_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  event_count integer not null default 1 check (event_count > 0),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  primary key (movie_slug, episode_slug, source_host)
);

create index if not exists playback_learning_queue_oldest_idx
  on public.playback_learning_queue (queued_at, last_event_at);

alter table public.playback_learning_queue enable row level security;
revoke all on table public.playback_learning_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.playback_learning_queue to service_role;

create or replace function public.enqueue_player_learning_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  normalized_movie text := lower(trim(coalesce(new.movie_slug, '')));
  normalized_episode text := regexp_replace(lower(trim(coalesce(new.episode_slug, ''))), '^(tap|episode)-', '');
  normalized_host text := lower(regexp_replace(trim(coalesce(new.source_host, '')), '^www\.', ''));
begin
  if new.event_type not in (
    'playback_stable', 'playback_heartbeat', 'stall_recovery', 'stall_fatal',
    'hls_fatal', 'hls_fatal_retry', 'direct_video_error', 'native_hls_error', 'iframe_blocked'
  ) or normalized_movie = '' or normalized_episode = '' or normalized_host = '' then
    return new;
  end if;

  insert into public.playback_learning_queue (
    movie_slug, episode_slug, source_host, queued_at, last_event_at, event_count, attempts, last_error
  ) values (
    normalized_movie, normalized_episode, normalized_host, now(), new.created_at, 1, 0, null
  )
  on conflict (movie_slug, episode_slug, source_host) do update
  set last_event_at = greatest(playback_learning_queue.last_event_at, excluded.last_event_at),
      event_count = least(playback_learning_queue.event_count + 1, 2147483647),
      last_error = null;

  return new;
end;
$$;

drop trigger if exists learn_from_player_event on public.player_error_events;
drop trigger if exists enqueue_player_learning_event on public.player_error_events;
do $viewer_trigger$
begin
  -- Some production lineages do not have the optional viewer-trained scoring
  -- functions. Do not enqueue work that cannot be consumed on those schemas.
  if to_regprocedure('public.refresh_exact_viewer_playback_score(text,text,text)') is not null then
    execute $ddl$
      create trigger enqueue_player_learning_event
      after insert on public.player_error_events
      for each row execute function public.enqueue_player_learning_event()
    $ddl$;
  end if;
end;
$viewer_trigger$;

revoke all on function public.enqueue_player_learning_event() from public, anon, authenticated;

create or replace function public.process_playback_learning_queue(p_limit integer default 12)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  candidate record;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 12), 40));
  processed integer := 0;
  failed integer := 0;
  affected integer := 0;
  current_affected integer := 0;
begin
  if to_regprocedure('public.refresh_exact_viewer_playback_score(text,text,text)') is null then
    return jsonb_build_object('status', 'unavailable', 'processed', 0, 'failed', 0, 'affected_streams', 0);
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('process-playback-learning-queue', 0)) then
    return jsonb_build_object('status', 'busy', 'processed', 0, 'failed', 0, 'affected_streams', 0);
  end if;

  for candidate in
    select movie_slug, episode_slug, source_host
    from public.playback_learning_queue
    where queued_at <= now()
    order by queued_at, last_event_at
    limit safe_limit
    for update skip locked
  loop
    begin
      execute 'select public.refresh_exact_viewer_playback_score($1, $2, $3)'
      into current_affected
      using candidate.movie_slug, candidate.episode_slug, candidate.source_host;
      affected := affected + coalesce(current_affected, 0);

      delete from public.playback_learning_queue
      where movie_slug = candidate.movie_slug
        and episode_slug = candidate.episode_slug
        and source_host = candidate.source_host;
      processed := processed + 1;
    exception when others then
      update public.playback_learning_queue
      set attempts = attempts + 1,
          queued_at = now() + least(attempts + 1, 15) * interval '1 minute',
          last_error = left(sqlerrm, 500)
      where movie_slug = candidate.movie_slug
        and episode_slug = candidate.episode_slug
        and source_host = candidate.source_host;
      failed := failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'processed', processed,
    'failed', failed,
    'affected_streams', affected
  );
end;
$$;

revoke all on function public.process_playback_learning_queue(integer) from public, anon, authenticated;
grant execute on function public.process_playback_learning_queue(integer) to service_role;

-- This one-time backfill was intentionally temporary.  Leaving it scheduled
-- every minute forces a repeated scan of the whole streams table after all rows
-- have already reached score version 2.
do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'backfill-playback-score-v2-every-minute';

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'process-playback-learning-queue';
  if to_regprocedure('public.refresh_exact_viewer_playback_score(text,text,text)') is not null then
    perform cron.schedule(
      'process-playback-learning-queue',
      '1-59/2 * * * *',
      $cmd$select public.process_playback_learning_queue(12);$cmd$
    );
  end if;
end;
$scheduler$;

-- GLVietsub's two newer cron lanes were created after the capacity guard and
-- therefore bypassed it.  BLVietsub's priority lane also remained unbounded at
-- peak.  Register every lane, keep useful small peak refreshes, and reserve
-- broad/raw scans for low-viewer windows (pg_cron schedules are UTC).
insert into public.runtime_capacity_managed_jobs (job_name)
values
  ('process-playback-learning-queue'),
  ('sync-blvietsub-feed-every-15-minutes'),
  ('sync-blvietsub-recent-peak-guard'),
  ('sync-glvietsub-recent-every-15-minutes'),
  ('sync-glvietsub-recent-peak-guard'),
  ('upgrade-glvietsub-raw-every-10-minutes')
on conflict (job_name) do nothing;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  -- Full BLVietsub latest-page ingestion outside ICT viewer peaks.
  perform cron.alter_job(
    jobid,
    schedule := '3,18,33,48 0-3,8-11,17-23 * * *'
  )
  from cron.job
  where jobname = 'sync-blvietsub-feed-every-15-minutes';

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'sync-blvietsub-recent-peak-guard';
  perform cron.schedule(
    'sync-blvietsub-recent-peak-guard',
    '3,33 4-7,12-16 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-blvietsub-feed?limit=4&offset=0&page_size=50&refresh_search=0',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 90000
      );
    $cmd$
  );

  -- A small translated GL homepage lane stays current; broad RAW upgrades do
  -- not compete with search and playback during the two ICT peak windows.
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'sync-glvietsub-recent-every-15-minutes';
  perform cron.schedule(
    'sync-glvietsub-recent-every-15-minutes',
    '7,37 0-3,8-11,17-23 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-glvietsub-feed?limit=4&recent=1',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 90000
      );
    $cmd$
  );

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'sync-glvietsub-recent-peak-guard';
  perform cron.schedule(
    'sync-glvietsub-recent-peak-guard',
    '7,37 4-7,12-16 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-glvietsub-feed?limit=1&recent=1',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 60000
      );
    $cmd$
  );

  if to_regprocedure('public.dispatch_glvietsub_raw_upgrades(integer)') is not null then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname in ('upgrade-glvietsub-raw-every-15-minutes', 'upgrade-glvietsub-raw-every-10-minutes');
    perform cron.schedule(
      'upgrade-glvietsub-raw-every-10-minutes',
      '12,42 0-3,8-11,17-23 * * *',
      $cmd$select public.dispatch_glvietsub_raw_upgrades(2);$cmd$
    );
  end if;

  -- A migration can land while the guard is already in protect mode. In that
  -- state there is no normal->protect transition to pause newly registered
  -- jobs, so apply the current state immediately.
  if exists (
    select 1 from public.runtime_capacity_state
    where singleton = true and mode = 'protect'
  ) then
    update public.runtime_capacity_managed_jobs managed
    set paused_by_capacity_guard = true,
        paused_at = coalesce(managed.paused_at, now()),
        updated_at = now()
    from cron.job job
    where managed.job_name = job.jobname
      and job.active is true;

    perform cron.alter_job(job.jobid, active := false)
    from cron.job job
    join public.runtime_capacity_managed_jobs managed on managed.job_name = job.jobname
    where managed.paused_by_capacity_guard is true
      and job.active is true;
  end if;
end;
$scheduler$;

-- Support the bounded GL RAW candidate lookup without scanning all episode
-- rows for every movie in every dispatch.
create index if not exists movie_episodes_gl_raw_lookup_idx
  on public.movie_episodes (movie_id, episode_number)
  where lower(coalesce(source, '')) = 'glvietsub'
    and lower(coalesce(audio_type, '')) = 'raw';

comment on table public.playback_learning_queue is
  'Deduplicated asynchronous work queue; player requests only enqueue and never aggregate 24 hours of telemetry inline.';
comment on function public.process_playback_learning_queue(integer) is
  'Processes a bounded set of exact source identities with an advisory lock so playback learning cannot overlap or starve visitor queries.';
