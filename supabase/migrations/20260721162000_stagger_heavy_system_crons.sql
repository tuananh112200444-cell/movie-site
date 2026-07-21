-- Prevent a thundering herd against Postgres and upstream providers.
-- The removed CobePhim job duplicated the same connector and cursor used by
-- sync-cobephim-backup-every-10-minutes.
do $$
declare
  target_id bigint;
begin
  if exists (select 1 from cron.job where jobname = 'cobephim-smart-sync') then
    perform cron.unschedule('cobephim-smart-sync');
  end if;

  select jobid into target_id from cron.job where jobname = 'sync-cobephim-backup-every-10-minutes';
  if target_id is not null then
    perform cron.alter_job(target_id, schedule := '8,23,38,53 * * * *');
  end if;

  select jobid into target_id from cron.job where jobname = 'episode-backfill-guard-every-15-minutes';
  if target_id is not null then
    perform cron.alter_job(target_id, schedule := '13,28,43,58 * * * *');
  end if;

  select jobid into target_id from cron.job where jobname = 'warm-home-proxy-every-15-minutes';
  if target_id is not null then
    perform cron.alter_job(target_id, schedule := '5,20,35,50 * * * *');
  end if;
end $$;
