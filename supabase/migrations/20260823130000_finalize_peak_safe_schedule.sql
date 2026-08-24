-- Finalize the emergency circuit-breaker transition without restoring legacy
-- full-scan jobs. Lightweight viewer health remains available during peaks;
-- routine cleanup can only run in Vietnam night/shoulder windows.

do $schedule$
declare
  is_protect boolean := true;
  guarded_jobs text[] := array[
    'catalog-brain-night',
    'catalog-brain-shoulder',
    'playback-brain-night',
    'playback-brain-shoulder',
    'playback-brain-peak-guard',
    'seed-playback-audit-night',
    'process-playback-audit-night',
    'scan-episode-identity-night-seek',
    'process-movie-refresh-night',
    'process-movie-refresh-shoulder',
    'prune-player-errors-night',
    'capture-operations-health-every-5-minutes',
    'cleanup-cron-history-daily',
    'cleanup-gsc-seo-history-weekly',
    'cleanup-observability-logs-daily',
    'cleanup-pg-net-http-response-hourly',
    'generate-sitemap-daily',
    'publish-movie-feed-websub',
    'queue-ongoing-movie-seo-quality'
  ];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    truncate public.background_job_pause_state;
    return;
  end if;

  select mode = 'protect' into is_protect
  from public.runtime_capacity_state
  where singleton = true;

  -- Viewer health: small indexed 15-minute rollup, never a full history scan.
  delete from public.runtime_capacity_managed_jobs
  where job_name = 'rollup-player-errors-viewer-health';
  perform cron.alter_job(jobid, schedule := '4,14,24,34,44,54 * * * *', active := true)
  from cron.job where jobname = 'rollup-player-errors-viewer-health';

  -- UTC schedules below map to quiet Vietnam times.
  perform cron.alter_job(jobid, schedule := '27 17,9 * * *', active := not is_protect)
  from cron.job where jobname = 'capture-operations-health-every-5-minutes';
  perform cron.alter_job(jobid, schedule := '10 18 * * *', active := not is_protect)
  from cron.job where jobname = 'cleanup-cron-history-daily';
  perform cron.alter_job(jobid, schedule := '35 18 * * 0', active := not is_protect)
  from cron.job where jobname = 'cleanup-gsc-seo-history-weekly';
  perform cron.alter_job(jobid, schedule := '40 18 * * *', active := not is_protect)
  from cron.job where jobname = 'cleanup-observability-logs-daily';
  perform cron.alter_job(jobid, schedule := '10 19 * * *', active := not is_protect)
  from cron.job where jobname = 'cleanup-pg-net-http-response-hourly';
  perform cron.alter_job(jobid, schedule := '20 20 * * *', active := not is_protect)
  from cron.job where jobname = 'generate-sitemap-daily';
  perform cron.alter_job(jobid, schedule := '25 18,23,7,10 * * *', active := not is_protect)
  from cron.job where jobname = 'publish-movie-feed-websub';
  perform cron.alter_job(jobid, schedule := '50 19 * * *', active := not is_protect)
  from cron.job where jobname = 'queue-ongoing-movie-seo-quality';

  insert into public.runtime_capacity_managed_jobs (
    job_name, paused_by_capacity_guard, paused_at, updated_at
  )
  select job_name, is_protect, case when is_protect then now() else null end, now()
  from unnest(guarded_jobs) as job_name
  on conflict (job_name) do update
  set paused_by_capacity_guard = excluded.paused_by_capacity_guard,
      paused_at = excluded.paused_at,
      updated_at = now();

  if is_protect then
    perform cron.alter_job(jobid, active := false)
    from cron.job where jobname = any(guarded_jobs);
  end if;

  -- The one-shot emergency snapshot must not later reactivate retired jobs.
  truncate public.background_job_pause_state;
end;
$schedule$;

-- Seed the compact health data now so the Edge function stops reading raw
-- player events before the next ten-minute tick.
select public.rollup_recent_player_errors(15);

comment on table public.background_job_pause_state is
  'One-shot emergency circuit state. Cleared after peak-safe schedules are installed so retired legacy jobs cannot be restored accidentally.';
