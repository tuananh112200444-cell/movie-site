-- Keep the existing homepage warmer close to each finished ingestion window.
-- This changes one existing job; it does not add another scheduler or cache.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'warm-home-proxy-every-15-minutes') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'warm-home-proxy-every-15-minutes'),
      schedule := '14,29,44,59 * * * *',
      active := true
    );
  end if;
end;
$$;
