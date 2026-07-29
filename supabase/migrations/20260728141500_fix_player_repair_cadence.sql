do $$
declare
  target_job_id bigint;
begin
  select jobid
  into target_job_id
  from cron.job
  where jobname = 'auto-repair-player-issues-every-10-minutes'
  limit 1;

  if target_job_id is not null then
    perform cron.alter_job(
      target_job_id,
      schedule := '3,13,23,33,43,53 * * * *',
      active := true
    );
  end if;
end
$$;
