-- Separate daily and weekly housekeeping from recurring viewer and sync jobs.
-- These jobs are short, but moving them removes the remaining exact cron
-- start collisions from the 24-hour scheduler model.

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.alter_job(jobid, schedule := '37 2 * * *', active := true)
  from cron.job where jobname = 'cleanup-observability-logs-daily';
  perform cron.alter_job(jobid, schedule := '52 2 * * *', active := true)
  from cron.job where jobname = 'cleanup-cron-history-daily';
  perform cron.alter_job(jobid, schedule := '52 3 * * *', active := true)
  from cron.job where jobname = 'collect-gsc-seo-feedback-daily';
  perform cron.alter_job(jobid, schedule := '47 3 * * 0', active := true)
  from cron.job where jobname = 'cleanup-gsc-seo-history-weekly';
end;
$scheduler$;
