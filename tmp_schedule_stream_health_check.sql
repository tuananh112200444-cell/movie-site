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
  order by case when jobname = 'episode-backfill-guard-every-15-minutes' then 0 else 1 end, jobid desc
  limit 1;

  if cron_secret is null then
    raise exception 'Could not find existing cron secret';
  end if;

  for target_job in
    select jobid
    from cron.job
    where jobname = 'stream-health-check-every-15-minutes'
  loop
    perform cron.unschedule(target_job.jobid);
  end loop;

  perform cron.schedule(
    'stream-health-check-every-15-minutes',
    '6,21,36,51 * * * *',
    format(
      $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?limit=120&concurrency=5&deactivate_after=5&secret=%s', timeout_milliseconds := 180000);$cmd$,
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
where jobname = 'stream-health-check-every-15-minutes';
