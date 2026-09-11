-- The current Supabase project has the Google service-account email but not
-- its private key. Keep the daily job paused until a newly generated key has
-- been stored and a manual run succeeds. This prevents a known failed run from
-- being written every day while the independent SEO-quality backfill remains
-- active.
do $pause_missing_google_key$
declare
  target_job_id bigint;
begin
  select jobid into target_job_id
  from cron.job
  where jobname = 'collect-gsc-seo-feedback-daily'
  limit 1;

  if target_job_id is not null then
    perform cron.alter_job(job_id := target_job_id, active := false);
  end if;
end;
$pause_missing_google_key$;
