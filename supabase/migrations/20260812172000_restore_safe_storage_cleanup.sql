-- Reclaim only disposable cache and observability data before the provider
-- catalog backfill. Movies, episodes, streams, and provider coverage are not
-- touched by this cleanup.

delete from public.movie_api_cache
where expires_at < now();

delete from public.player_error_events
where created_at < now() - interval '30 days';

delete from public.stream_health_logs
where checked_at < now() - interval '14 days';

delete from public.sync_logs
where run_at < now() - interval '45 days';

delete from public.operations_health_snapshots
where checked_at < now() - interval '30 days';

do $scheduler$
declare
  cleanup_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  select jobid into cleanup_job_id
  from cron.job
  where jobname = 'cleanup-observability-logs-daily';

  if cleanup_job_id is null then
    perform cron.schedule(
      'cleanup-observability-logs-daily',
      '37 2 * * *',
      $command$
        delete from public.movie_api_cache where expires_at < now();
        delete from public.player_error_events where created_at < now() - interval '30 days';
        delete from public.stream_health_logs where checked_at < now() - interval '14 days';
        delete from public.sync_logs where run_at < now() - interval '45 days';
        delete from public.operations_health_snapshots where checked_at < now() - interval '30 days';
      $command$
    );
  else
    perform cron.alter_job(
      cleanup_job_id,
      schedule := '37 2 * * *',
      command := $command$
        delete from public.movie_api_cache where expires_at < now();
        delete from public.player_error_events where created_at < now() - interval '30 days';
        delete from public.stream_health_logs where checked_at < now() - interval '14 days';
        delete from public.sync_logs where run_at < now() - interval '45 days';
        delete from public.operations_health_snapshots where checked_at < now() - interval '30 days';
      $command$,
      active := true
    );
  end if;
end;
$scheduler$;
