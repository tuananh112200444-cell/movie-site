-- Capacity-aware scheduler for the current 60-connection database.
-- Viewer-facing ingestion stays frequent; historical and observability work is
-- bounded and staggered so jobs do not all request a connection at once.

create or replace function public.capture_operations_health()
returns public.operations_health_snapshots
language plpgsql
security definer
set search_path = public, cron, pg_temp
as $$
declare
  active_jobs integer;
  failed_jobs integer;
  stale_jobs integer;
  sync_failures integer;
  player_errors integer;
  unreachable_streams integer;
  seo_ok integer;
  seo_bad integer;
  calculated_score integer;
  calculated_status text;
  failed_job_names jsonb := '[]'::jsonb;
  result public.operations_health_snapshots;
begin
  with latest_runs as materialized (
    select distinct on (d.jobid)
      d.jobid,
      d.status,
      d.start_time
    from cron.job_run_details d
    where d.start_time >= now() - interval '7 days'
    order by d.jobid, d.start_time desc
  ),
  job_state as (
    select j.jobname, j.schedule, r.status, r.start_time
    from cron.job j
    left join latest_runs r on r.jobid = j.jobid
    where j.active
  )
  select
    count(*),
    count(*) filter (where status = 'failed'),
    count(*) filter (
      where schedule ~ '^(\*/[0-9]+|[0-9,]+) \* \* \* \*$'
        and start_time is not null
        and start_time < now() - interval '2 hours'
    ),
    coalesce(
      jsonb_agg(jobname order by jobname) filter (where status = 'failed'),
      '[]'::jsonb
    )
  into active_jobs, failed_jobs, stale_jobs, failed_job_names
  from job_state;

  with latest_sync as (
    select distinct on (function_name)
      function_name,
      success,
      errors
    from public.sync_logs
    where run_at >= now() - interval '6 hours'
    order by function_name, run_at desc
  )
  select count(*)
  into sync_failures
  from latest_sync
  where success is false or coalesce(errors, 0) > 0;

  select count(distinct concat_ws('|', movie_slug, episode_slug, server_name, event_type))
  into player_errors
  from public.player_error_events
  where created_at >= now() - interval '1 hour'
    and event_type in (
      'stall_fatal',
      'hls_fatal',
      'hls_fatal_retry',
      'direct_video_error',
      'native_hls_error',
      'iframe_blocked',
      'chunk_load_error',
      'app_error',
      'unhandled_rejection'
    );

  select count(distinct stream_id)
  into unreachable_streams
  from public.stream_health_logs
  where checked_at >= now() - interval '1 hour'
    and coalesce(is_reachable, false) = false
    and (http_code in (404, 410) or status = 'dead');

  select
    count(*) filter (where eligible_for_index),
    count(*) filter (where not eligible_for_index)
  into seo_ok, seo_bad
  from public.movie_seo_quality_status;

  calculated_score := greatest(
    0,
    100
      - failed_jobs * 20
      - stale_jobs * 15
      - least(sync_failures, 10) * 3
      - least(player_errors, 30)
      - least(unreachable_streams, 20)
  );
  calculated_status := case
    when failed_jobs > 0 or stale_jobs > 0 or calculated_score < 60 then 'critical'
    when sync_failures > 2
      or player_errors > 10
      or unreachable_streams > 5
      or calculated_score < 85
      then 'warning'
    else 'healthy'
  end;

  insert into public.operations_health_snapshots (
    status,
    score,
    active_cron_jobs,
    failed_cron_jobs,
    stale_cron_jobs,
    sync_failures_6h,
    player_errors_1h,
    unreachable_streams_1h,
    seo_eligible,
    seo_ineligible,
    details
  )
  values (
    calculated_status,
    calculated_score,
    active_jobs,
    failed_jobs,
    stale_jobs,
    sync_failures,
    player_errors,
    unreachable_streams,
    seo_ok,
    seo_bad,
    jsonb_build_object(
      'metric_version', 3,
      'failed_jobs', failed_job_names,
      'scheduler_profile', 'capacity_aware_60_connections'
    )
  )
  returning * into result;

  return result;
end;
$$;

do $scheduler$
begin
  -- Database-local work.
  perform cron.alter_job(jobid, schedule := '* * * * *')
  from cron.job where jobname = 'process-movie-refresh-queue';
  perform cron.alter_job(jobid, schedule := '0,10,20,30,40,50 * * * *')
  from cron.job where jobname = 'backfill-audio-type-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '15,45 * * * *')
  from cron.job where jobname = 'capture-operations-health-every-5-minutes';
  perform cron.alter_job(jobid, schedule := '5,35 * * * *')
  from cron.job where jobname = 'scan-movie-episode-truth';

  -- Primary and backup catalog ingestion.
  perform cron.alter_job(jobid, schedule := '1,16,31,46 * * * *')
  from cron.job where jobname = 'sync-ophim-priority-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '6,21,36,51 * * * *')
  from cron.job where jobname = 'sync-kkphim-priority-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '3,18,33,48 * * * *')
  from cron.job where jobname = 'sync-blvietsub-feed-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '9,24,39,54 * * * *')
  from cron.job where jobname = 'sync-glvietsub-feed-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '12,42 * * * *')
  from cron.job where jobname = 'sync-motchill-feed-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '13,43 * * * *')
  from cron.job where jobname = 'sync-cobephim-backup-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '8,38 * * * *')
  from cron.job where jobname = 'sync-blvietsub-feed-backfill-every-30-minutes';
  perform cron.alter_job(jobid, schedule := '11,26,41,56 * * * *')
  from cron.job where jobname = 'repair-blvietsub-smart-every-15-minutes';

  -- Episode repair and viewer-facing source health.
  perform cron.alter_job(jobid, schedule := '14,44 * * * *')
  from cron.job where jobname = 'episode-mismatch-repair-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '23,53 * * * *')
  from cron.job where jobname = 'episode-backfill-guard-every-15-minutes';
  perform cron.alter_job(
    jobid,
    schedule := '2,17,32,47 * * * *',
    command := $command$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=problem&limit=40&concurrency=3&deactivate_after=3',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 60000
      );
    $command$
  )
  from cron.job where jobname = 'stream-health-problem-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '7,37 * * * *')
  from cron.job where jobname = 'stream-health-unchecked-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '57 * * * *')
  from cron.job where jobname = 'stream-health-stale-hourly';
  perform cron.alter_job(jobid, schedule := '22 * * * *')
  from cron.job where jobname = 'stream-health-check-every-15-minutes';
  perform cron.alter_job(
    jobid,
    schedule := '4,19,34,49 * * * *',
    command := $command$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/auto-repair-player-issues?hours=12&limit=8&threshold=2&event_limit=2000',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 60000
      );
    $command$
  )
  from cron.job where jobname = 'auto-repair-player-issues-every-10-minutes';

  -- Cache warming and notifications are useful but never compete with ingestion.
  perform cron.alter_job(jobid, schedule := '5,20,35,50 * * * *')
  from cron.job where jobname = 'warm-home-proxy-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '27,57 * * * *')
  from cron.job where jobname = 'warm-search-index-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '25,55 * * * *')
  from cron.job where jobname = 'send-operations-alerts-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '14,44 * * * *')
  from cron.job where jobname = 'schedule-email-alerts-every-5-minutes';
  perform cron.alter_job(jobid, schedule := '28,58 * * * *')
  from cron.job where jobname = 'publish-movie-feed-websub';

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'cleanup-cron-history-daily';
  perform cron.schedule(
    'cleanup-cron-history-daily',
    '47 2 * * *',
    $cleanup$
      delete from cron.job_run_details
      where start_time < now() - interval '14 days';
    $cleanup$
  );
end;
$scheduler$;

revoke all on function public.capture_operations_health() from public, anon, authenticated;
grant execute on function public.capture_operations_health() to service_role;

comment on function public.capture_operations_health() is
  'Indexed, capacity-aware operations snapshot without per-job lateral scans.';
