begin;

create or replace function private.retired_ophim_cleanup_yield_reason(
  p_now timestamptz default now()
)
returns text
language plpgsql
stable
security invoker
set search_path = private, cron, pg_catalog, pg_temp
as $$
declare
  utc_hour integer := extract(hour from p_now at time zone 'UTC')::integer;
begin
  -- catalog-brain-peak-freshness runs during these UTC hours. Reserve the
  -- whole windows for new-film ingestion and downstream catalogue refreshes.
  if utc_hour = any(array[4, 5, 6, 11, 12, 13, 14, 15, 16]) then
    return 'scheduled_sync_window';
  end if;

  if exists (
    select 1
    from cron.job_run_details run
    join cron.job job on job.jobid = run.jobid
    where run.status = 'running'
      and run.start_time >= p_now - interval '15 minutes'
      and job.jobname <> 'cleanup-retired-ophim-transport'
      and lower(job.jobname) ~ 'sync|catalog|provider'
  ) then
    return 'sync_job_running';
  end if;

  return null;
end;
$$;

create or replace function private.run_retired_ophim_cleanup_if_idle()
returns jsonb
language plpgsql
security invoker
set search_path = private, public, cron, pg_catalog, pg_temp
as $$
declare
  yield_reason text;
begin
  yield_reason := private.retired_ophim_cleanup_yield_reason(now());

  if yield_reason is not null then
    return jsonb_build_object(
      'status', 'yielded',
      'reason', yield_reason,
      'checked_at', now()
    );
  end if;

  return private.cleanup_retired_ophim_transport_batch(100);
end;
$$;

revoke all on function private.retired_ophim_cleanup_yield_reason(timestamptz)
  from public, anon, authenticated;
revoke all on function private.run_retired_ophim_cleanup_if_idle()
  from public, anon, authenticated;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'cleanup-retired-ophim-transport'),
  schedule := '10 seconds',
  command := 'select private.run_retired_ophim_cleanup_if_idle();',
  active := true
);

do $keep_catalog_sync_active$
declare
  target_job_id bigint;
begin
  select jobid into target_job_id
  from cron.job
  where jobname = 'catalog-brain-peak-freshness'
  limit 1;

  if target_job_id is not null then
    perform cron.alter_job(job_id := target_job_id, active := true);
  end if;
end;
$keep_catalog_sync_active$;

comment on function private.retired_ophim_cleanup_yield_reason(timestamptz) is
  'Returns why retired OPhim cleanup must yield so new-film provider sync and catalogue refresh work retain priority.';

comment on function private.run_retired_ophim_cleanup_if_idle() is
  'Runs one bounded retired OPhim cleanup batch only outside scheduled sync windows and while no provider sync cron is active.';

commit;
