-- Keep the small playback-provider brain alive after maintenance or a partial
-- scheduler recovery. Global operator pauses still win, and capacity-managed
-- repair jobs remain off while the runtime controller is in protect mode.

insert into public.runtime_capacity_managed_jobs (job_name)
values
  ('sync-provider-backups-every-30-minutes'),
  ('sync-gap-playback-providers-offpeak')
on conflict (job_name) do nothing;

create or replace function public.ensure_playback_provider_brain()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, pg_catalog, pg_temp
as $$
declare
  global_pause_active boolean := false;
  capacity_mode text := 'normal';
  expected record;
  target_job record;
  restored_jobs text[] := array[]::text[];
  missing_jobs text[] := array[]::text[];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return jsonb_build_object('success', false, 'reason', 'pg_cron_unavailable');
  end if;

  select exists(select 1 from public.background_job_pause_state)
  into global_pause_active;
  if global_pause_active then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'operator_global_pause');
  end if;

  select coalesce(state.mode, 'normal')
  into capacity_mode
  from public.runtime_capacity_state state
  where state.singleton = true;
  capacity_mode := coalesce(capacity_mode, 'normal');

  for expected in
    select *
    from (values
      ('evaluate-runtime-capacity-every-5-minutes', '0,5,10,15,20,25,30,35,40,45,50,55 0-3,8-11,17-23 * * *', false),
      ('evaluate-runtime-capacity-peak-every-minute', '* 4-7,12-16 * * *', false),
      ('sync-ophim-priority-every-15-minutes', '1,16,31,46 * * * *', false),
      ('sync-kkphim-priority-every-15-minutes', '6,21,36,51 * * * *', false),
      ('sync-provider-backups-every-30-minutes', '14,44 0-3,8-11,17-23 * * *', true),
      ('sync-gap-playback-providers-offpeak', '9,39 0-3,8-11,17-23 * * *', true)
    ) as jobs(job_name, expected_schedule, capacity_managed)
  loop
    select job.jobid, job.active, job.schedule
    into target_job
    from cron.job job
    where job.jobname = expected.job_name
    order by job.jobid desc
    limit 1;

    if target_job.jobid is null then
      missing_jobs := array_append(missing_jobs, expected.job_name);
      continue;
    end if;

    if expected.capacity_managed and capacity_mode = 'protect' then
      continue;
    end if;

    if expected.capacity_managed then
      update public.runtime_capacity_managed_jobs managed
      set paused_by_capacity_guard = false,
          paused_at = null,
          updated_at = now()
      where managed.job_name = expected.job_name
        and managed.paused_by_capacity_guard is true;
    end if;

    if target_job.active is false or target_job.schedule <> expected.expected_schedule then
      perform cron.alter_job(
        target_job.jobid,
        schedule := expected.expected_schedule,
        active := true
      );
      restored_jobs := array_append(restored_jobs, expected.job_name);
    end if;
  end loop;

  return jsonb_build_object(
    'success', cardinality(missing_jobs) = 0,
    'capacity_mode', capacity_mode,
    'restored_jobs', restored_jobs,
    'missing_jobs', missing_jobs,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.ensure_playback_provider_brain() from public, anon, authenticated;
grant execute on function public.ensure_playback_provider_brain() to service_role;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'ensure-playback-provider-brain-every-5-minutes';

  perform cron.schedule(
    'ensure-playback-provider-brain-every-5-minutes',
    '*/5 * * * *',
    $cmd$select public.ensure_playback_provider_brain();$cmd$
  );
end;
$scheduler$;

select public.ensure_playback_provider_brain();

comment on function public.ensure_playback_provider_brain() is
  'Restores the bounded OPhim/KKPhim and playback-repair schedulers after partial cron recovery while respecting operator pauses and capacity protect mode.';
