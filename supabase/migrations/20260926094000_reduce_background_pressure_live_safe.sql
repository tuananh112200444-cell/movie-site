begin;

select pg_advisory_xact_lock(hashtext('khophim-live-safe-background-pressure-v1'));

do $$
declare
  target_streams integer;
  health_jobs integer;
  trailer_jobs integer;
begin
  select count(*) into target_streams
  from public.streams
  where is_active
    and lower(trim(coalesce(source,'')))='ophim1.com'
    and coalesce(trim(provider_key),'')='';

  select count(*) into health_jobs
  from cron.job where jobname='capture-operations-health-every-5-minutes';
  select count(*) into trailer_jobs
  from cron.job where jobname='reconcile-stale-trailer-playback';

  if target_streams <> 21 then
    raise exception 'Expected 21 active retired OPhim streams, found %',target_streams;
  end if;
  if health_jobs <> 1 or trailer_jobs <> 1 then
    raise exception 'Expected one health job and one trailer reconciliation job';
  end if;
end $$;

update public.streams
set
  is_active=false,
  last_error='Retired OPhim playback transport; metadata retained',
  updated_at=now()
where is_active
  and lower(trim(coalesce(source,'')))='ophim1.com'
  and coalesce(trim(provider_key),'')='';

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='capture-operations-health-every-5-minutes'),
  schedule := '*/15 * * * *'
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='reconcile-stale-trailer-playback'),
  schedule := '7 * * * *'
);

select public.capture_operations_health();

commit;
