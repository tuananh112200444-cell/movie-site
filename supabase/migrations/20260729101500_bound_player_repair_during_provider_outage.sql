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
    -- Source-health failover reacts every five minutes. Catalogue mutation is
    -- intentionally slower because it fans out to several external providers.
    perform cron.alter_job(
      target_job_id,
      schedule := '13,43 * * * *',
      active := true
    );
  end if;
end
$$;
