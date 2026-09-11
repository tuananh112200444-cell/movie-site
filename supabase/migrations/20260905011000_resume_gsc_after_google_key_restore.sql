-- The Google service-account credential has been restored and validated by a
-- manual Search Console run. Resume the bounded daily feedback loop.
do $resume_gsc$
declare
  target_job_id bigint;
begin
  select jobid into target_job_id
  from cron.job
  where jobname = 'collect-gsc-seo-feedback-daily'
  limit 1;

  if target_job_id is not null then
    perform cron.alter_job(
      job_id := target_job_id,
      schedule := '52 3 * * *',
      active := true
    );
  end if;
end;
$resume_gsc$;
