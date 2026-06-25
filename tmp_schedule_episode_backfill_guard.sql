create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  cron_secret text;
  target_job record;
begin
  select (regexp_match(command, 'secret=([^&''\s]+)'))[1]
  into cron_secret
  from cron.job
  where active = true
    and command ilike '%secret=%'
    and (
      command ilike '%sync-ophim%'
      or command ilike '%auto-sync-ophim%'
      or command ilike '%sync-blvietsub%'
    )
  order by jobid desc
  limit 1;

  if cron_secret is null then
    raise exception 'Could not find existing cron secret';
  end if;

  for target_job in
    select jobid
    from cron.job
    where jobname in (
      'auto-sync-ophim-episodes-every-15-minutes',
      'ophim-mismatch-repair-hourly',
      'sync-blvietsub-feed-every-15-minutes',
      'sync-blvietsub-full-backfill-every-15-minutes',
      'sync-kkphim-backfill-every-15-minutes',
      'sync-kkphim-episodes-every-15-minutes',
      'sync-kkphim-movies-every-15-minutes',
      'sync-ophim-movies-every-15-minutes',
      'episode-backfill-guard-every-15-minutes'
    )
  loop
    perform cron.unschedule(target_job.jobid);
  end loop;

  perform cron.schedule(
    'episode-backfill-guard-every-15-minutes',
    '2,17,32,47 * * * *',
    format(
      $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/episode-backfill-guard?latest_pages=2&latest_limit=36&backfill_pages=1&backfill_limit=24&blvietsub_latest_limit=150&blvietsub_backfill_limit=100&blvietsub_page_size=150&refresh_caches=1&secret=%s', timeout_milliseconds := 240000);$cmd$,
      cron_secret
    )
  );
end $$;

select
  jobid,
  jobname,
  schedule,
  active
from cron.job
where jobname = 'episode-backfill-guard-every-15-minutes';
