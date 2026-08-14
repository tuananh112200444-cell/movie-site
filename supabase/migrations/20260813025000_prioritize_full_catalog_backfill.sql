-- Give the one-time four-provider catalogue import exclusive ownership of the
-- regular OPhim/KKPhim catalogue slots. The normal schedulers are restored
-- automatically after every provider reaches its finite checkpoint.
create or replace function public.manage_full_catalog_backfill_priority()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, pg_catalog, pg_temp
as $$
declare
  completed_providers integer := 0;
  job_row record;
begin
  select count(*)::integer
  into completed_providers
  from public.provider_catalog_backfill_state state
  where state.provider in ('ophim', 'phimapi', 'vsmov', 'nguonc')
    and state.status = 'complete'
    and state.total_pages > 0
    and state.next_page > state.total_pages;

  for job_row in
    select jobid, jobname, active
    from cron.job
    where jobname in (
      'ensure-playback-provider-brain-every-5-minutes',
      'sync-ophim-priority-every-15-minutes',
      'sync-kkphim-priority-every-15-minutes'
    )
  loop
    if completed_providers = 4 and job_row.active is false then
      perform cron.alter_job(job_row.jobid, active := true);
    elsif completed_providers < 4 and job_row.active is true then
      perform cron.alter_job(job_row.jobid, active := false);
    end if;
  end loop;

  if completed_providers = 4 then
    perform cron.alter_job(jobid, active := false)
    from cron.job
    where jobname = 'catalog-backfill-priority-supervisor-every-5-minutes';
  end if;

  return jsonb_build_object(
    'success', true,
    'completed_providers', completed_providers,
    'normal_catalog_jobs_active', completed_providers = 4,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.manage_full_catalog_backfill_priority() from public, anon, authenticated;
grant execute on function public.manage_full_catalog_backfill_priority() to service_role;

do $scheduler$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'catalog-backfill-priority-supervisor-every-5-minutes';

  perform cron.schedule(
    'catalog-backfill-priority-supervisor-every-5-minutes',
    '*/5 * * * *',
    $cmd$select public.manage_full_catalog_backfill_priority();$cmd$
  );
end;
$scheduler$;

select public.manage_full_catalog_backfill_priority();

comment on function public.manage_full_catalog_backfill_priority() is
  'Pauses duplicate scheduled catalogue syncs during the finite four-provider import and restores them automatically when all providers complete.';
