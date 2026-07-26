-- Reduce background IO pressure without interrupting viewer-critical flows.
-- Keep source ingestion, episode repair, and viewer-source recovery active.
-- Slow down non-critical repair, observability, and cache warming jobs that
-- were contributing to pg_cron startup timeouts and disk temp usage.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  -- Keep the viewer-facing refresh queue responsive, but do not increase it.
  perform cron.alter_job(jobid, schedule := '5,15,25,35,45,55 * * * *', active := true)
  from cron.job
  where jobname = 'process-movie-refresh-queue';

  -- Heavy background repair scanners: reduce overlap and lower frequency.
  perform cron.alter_job(jobid, schedule := '7,37 * * * *', active := true)
  from cron.job
  where jobname = 'dispatch-catalog-source-repairs-every-2-minutes';

  perform cron.alter_job(jobid, schedule := '12,42 * * * *', active := true)
  from cron.job
  where jobname = 'scan-episode-sequence-gaps-every-5-minutes';

  perform cron.alter_job(jobid, schedule := '24 * * * *', active := true)
  from cron.job
  where jobname = 'scan-movie-episode-truth';

  perform cron.alter_job(jobid, schedule := '33 * * * *', active := true)
  from cron.job
  where jobname = 'recheck-motchill-ongoing-every-10-minutes';

  -- Observability and derived metadata can run slower during IO pressure.
  perform cron.alter_job(jobid, schedule := '11 * * * *', active := true)
  from cron.job
  where jobname = 'backfill-audio-type-every-10-minutes';

  perform cron.alter_job(jobid, schedule := '17 * * * *', active := true)
  from cron.job
  where jobname = 'capture-operations-health-every-5-minutes';

  -- Cache warmers help latency but should never compete with viewers.
  perform cron.alter_job(jobid, schedule := '20 * * * *', active := true)
  from cron.job
  where jobname = 'warm-home-proxy-every-15-minutes';

  perform cron.alter_job(jobid, schedule := '50 * * * *', active := true)
  from cron.job
  where jobname = 'warm-search-index-every-10-minutes';

  -- Lower-priority outbound and backup sync jobs.
  perform cron.alter_job(jobid, schedule := '58 */2 * * *', active := true)
  from cron.job
  where jobname = 'publish-movie-feed-websub';

  perform cron.alter_job(jobid, schedule := '29 */6 * * *', active := true)
  from cron.job
  where jobname = 'sync-onlyflix-feed-hourly';
end;
$$;
