-- Priority-window cron plan.
-- Source ingestion and viewer recovery remain frequent. Expensive reconciliation
-- work is distributed across low-contention windows, four minutes before the
-- next canonical source sync, based on its observed maximum runtime.

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  -- Tier 1: viewer freshness and recovery. Keep the existing cadence, but
  -- assign distinct start minutes so these jobs never start together.
  perform cron.alter_job(jobid, schedule := '5,15,25,35,45,55 * * * *', active := true)
  from cron.job where jobname = 'process-movie-refresh-queue';
  perform cron.alter_job(jobid, schedule := '1,16,31,46 * * * *', active := true)
  from cron.job where jobname = 'sync-ophim-priority-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '6,21,36,51 * * * *', active := true)
  from cron.job where jobname = 'sync-kkphim-priority-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '3,18,33,48 * * * *', active := true)
  from cron.job where jobname = 'sync-blvietsub-feed-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '9,24,39,54 * * * *', active := true)
  from cron.job where jobname = 'sync-glvietsub-feed-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '11,26,41,56 * * * *', active := true)
  from cron.job where jobname = 'repair-blvietsub-smart-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '8,38 * * * *', active := true)
  from cron.job where jobname = 'sync-blvietsub-feed-backfill-every-30-minutes';
  perform cron.alter_job(jobid, schedule := '10,40 * * * *', active := true)
  from cron.job where jobname = 'stream-health-problem-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '13,43 * * * *', active := true)
  from cron.job where jobname = 'auto-repair-player-issues-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '14,44 * * * *', active := true)
  from cron.job where jobname = 'episode-mismatch-repair-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '23,53 * * * *', active := true)
  from cron.job where jobname = 'episode-backfill-guard-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '29,49 * * * *', active := true)
  from cron.job where jobname = 'sync-motchill-feed-every-10-minutes';

  -- Tier 2: bounded repair and cache maintenance. These never share a start
  -- minute with a viewer-critical task.
  perform cron.alter_job(jobid, schedule := '57 * * * *', active := true)
  from cron.job where jobname = 'dispatch-catalog-source-repairs-every-2-minutes';
  perform cron.alter_job(jobid, schedule := '47 */2 * * *', active := true)
  from cron.job where jobname = 'recheck-motchill-ongoing-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '19 */2 * * *', active := true)
  from cron.job where jobname = 'warm-home-proxy-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '50 * * * *', active := true)
  from cron.job where jobname = 'warm-search-index-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '17 */2 * * *', active := true)
  from cron.job where jobname = 'send-operations-alerts-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '30 */2 * * *', active := true)
  from cron.job where jobname = 'publish-movie-feed-websub';
  perform cron.alter_job(jobid, schedule := '2 */6 * * *', active := true)
  from cron.job where jobname = 'sync-onlyflix-feed-hourly';

  -- Tier 3: expensive maintenance. Each starts four minutes before an OPhim
  -- slot, leaving the measured worst-case runtime enough room to finish.
  perform cron.alter_job(jobid, schedule := '27 0,4,8,12,16,20 * * *', active := true)
  from cron.job where jobname = 'scan-episode-sequence-gaps-every-5-minutes';
  perform cron.alter_job(jobid, schedule := '27 1,5,9,13,17,21 * * *', active := true)
  from cron.job where jobname = 'scan-movie-episode-truth';
  perform cron.alter_job(jobid, schedule := '27 2,14 * * *', active := true)
  from cron.job where jobname = 'backfill-audio-type-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '27 3,15 * * *', active := true)
  from cron.job where jobname = 'capture-operations-health-every-5-minutes';
  perform cron.alter_job(jobid, schedule := '27 23 * * *', active := true)
  from cron.job where jobname = 'cleanup-pg-net-http-response-hourly';
  perform cron.alter_job(jobid, schedule := '58 19 * * *', active := true)
  from cron.job where jobname = 'schedule-email-alerts-every-5-minutes';
end;
$scheduler$;
