-- Re-enable the two existing bounded Motchill jobs without changing their
-- off-peak schedules or touching any other provider.
do $scheduler$
begin
  perform cron.alter_job(jobid, active := true)
  from cron.job
  where jobname in (
    'sync-motchill-feed-every-10-minutes',
    'recheck-motchill-ongoing-every-10-minutes'
  );

  update public.runtime_capacity_managed_jobs
  set paused_by_capacity_guard = false,
      paused_at = null,
      updated_at = now()
  where job_name in (
    'sync-motchill-feed-every-10-minutes',
    'recheck-motchill-ongoing-every-10-minutes'
  );
end;
$scheduler$;
