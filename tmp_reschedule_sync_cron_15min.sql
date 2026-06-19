do $$
declare
  blv_command text;
  ophim_episodes_command text;
begin
  select command
    into blv_command
  from cron.job
  where jobname in (
    'sync-blvietsub-feed-every-30-minutes',
    'sync-blvietsub-feed-every-15-minutes'
  )
  order by jobid desc
  limit 1;

  if blv_command is not null then
    perform cron.unschedule('sync-blvietsub-feed-every-30-minutes')
    where exists (
      select 1 from cron.job where jobname = 'sync-blvietsub-feed-every-30-minutes'
    );
    perform cron.unschedule('sync-blvietsub-feed-every-15-minutes')
    where exists (
      select 1 from cron.job where jobname = 'sync-blvietsub-feed-every-15-minutes'
    );
    perform cron.schedule(
      'sync-blvietsub-feed-every-15-minutes',
      '*/15 * * * *',
      blv_command
    );
  end if;

  select command
    into ophim_episodes_command
  from cron.job
  where jobname in (
    'auto-sync-ophim-episodes-every-30-minutes',
    'auto-sync-ophim-episodes-every-15-minutes'
  )
  order by jobid desc
  limit 1;

  if ophim_episodes_command is not null then
    perform cron.unschedule('auto-sync-ophim-episodes-every-30-minutes')
    where exists (
      select 1 from cron.job where jobname = 'auto-sync-ophim-episodes-every-30-minutes'
    );
    perform cron.unschedule('auto-sync-ophim-episodes-every-15-minutes')
    where exists (
      select 1 from cron.job where jobname = 'auto-sync-ophim-episodes-every-15-minutes'
    );
    perform cron.schedule(
      'auto-sync-ophim-episodes-every-15-minutes',
      '*/15 * * * *',
      ophim_episodes_command
    );
  end if;
end $$;

select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'sync-blvietsub-feed-every-15-minutes',
  'auto-sync-ophim-episodes-every-15-minutes',
  'sync-blvietsub-feed-every-30-minutes',
  'auto-sync-ophim-episodes-every-30-minutes'
)
order by jobid;
