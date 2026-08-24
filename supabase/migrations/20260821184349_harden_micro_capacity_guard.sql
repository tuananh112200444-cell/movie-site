-- The production project uses a 1 GB Micro compute. The former thresholds
-- (20 active / 4 long queries) allowed the connection pool to become
-- unreachable before protect mode activated. Detect connection/wait pressure
-- earlier and pause newly registered managed jobs even while already protected.

create or replace function public.evaluate_runtime_capacity()
returns public.runtime_capacity_state
language plpgsql
security definer
set search_path = public, cron, pg_catalog, pg_temp
as $$
declare
  current_state public.runtime_capacity_state;
  result public.runtime_capacity_state;
  total_client_connections integer := 0;
  active_client_queries integer := 0;
  waiting_client_queries integer := 0;
  long_client_queries integer := 0;
  recent_non_success integer := 0;
  recent_slow_batch_runs integer := 0;
  hard_pressure boolean := false;
  sustained_pressure boolean := false;
  next_mode text := 'normal';
  next_pressure integer := 0;
  next_healthy integer := 0;
  next_healthy_since timestamptz;
begin
  select * into current_state
  from public.runtime_capacity_state
  where singleton = true
  for update;

  select
    count(*) filter (where backend_type = 'client backend'),
    count(*) filter (where backend_type = 'client backend' and state = 'active'),
    count(*) filter (
      where backend_type = 'client backend'
        and state = 'active'
        and wait_event is not null
    ),
    count(*) filter (
      where backend_type = 'client backend'
        and state = 'active'
        and now() - query_start > interval '30 seconds'
    )
  into total_client_connections, active_client_queries, waiting_client_queries, long_client_queries
  from pg_stat_activity
  where datname = current_database();

  select
    count(*) filter (where details.status <> 'succeeded'),
    count(*) filter (where coalesce(details.end_time, now()) - details.start_time > interval '30 seconds')
  into recent_non_success, recent_slow_batch_runs
  from cron.job_run_details details
  join cron.job jobs on jobs.jobid = details.jobid
  join public.runtime_capacity_managed_jobs managed on managed.job_name = jobs.jobname
  where details.start_time >= now() - interval '15 minutes';

  hard_pressure :=
    total_client_connections >= 40
    or active_client_queries >= 8
    or waiting_client_queries >= 4
    or long_client_queries >= 2;
  sustained_pressure := recent_non_success >= 2 and recent_slow_batch_runs >= 1;

  if hard_pressure or sustained_pressure then
    next_pressure := current_state.consecutive_pressure + 1;
    next_healthy := 0;
    next_healthy_since := null;
    if hard_pressure or next_pressure >= 2 then
      next_mode := 'protect';
    else
      next_mode := current_state.mode;
    end if;
  elsif current_state.mode = 'protect' then
    next_pressure := 0;
    next_healthy := current_state.consecutive_healthy + 1;
    next_healthy_since := coalesce(current_state.healthy_since, now());
    next_mode := case
      when now() - next_healthy_since >= interval '15 minutes' then 'normal'
      else 'protect'
    end;
  else
    next_pressure := 0;
    next_healthy := 0;
    next_healthy_since := null;
    next_mode := 'normal';
  end if;

  if next_mode = 'protect' then
    update public.runtime_capacity_managed_jobs managed
    set paused_by_capacity_guard = true,
        paused_at = coalesce(managed.paused_at, now()),
        updated_at = now()
    from cron.job jobs
    where jobs.jobname = managed.job_name
      and jobs.active is true;

    perform cron.alter_job(jobs.jobid, active := false)
    from cron.job jobs
    join public.runtime_capacity_managed_jobs managed on managed.job_name = jobs.jobname
    where managed.paused_by_capacity_guard is true
      and jobs.active is true;
  elsif next_mode = 'normal' and current_state.mode = 'protect' then
    perform cron.alter_job(jobs.jobid, active := true)
    from cron.job jobs
    join public.runtime_capacity_managed_jobs managed on managed.job_name = jobs.jobname
    where managed.paused_by_capacity_guard is true
      and jobs.active is false;

    update public.runtime_capacity_managed_jobs
    set paused_by_capacity_guard = false,
        paused_at = null,
        updated_at = now()
    where paused_by_capacity_guard is true;
  end if;

  update public.runtime_capacity_state
  set mode = next_mode,
      entered_protect_at = case
        when next_mode = 'protect' and current_state.mode <> 'protect' then now()
        when next_mode = 'normal' then null
        else current_state.entered_protect_at
      end,
      last_evaluated_at = now(),
      consecutive_pressure = next_pressure,
      consecutive_healthy = next_healthy,
      healthy_since = case when next_mode = 'protect' then next_healthy_since else null end,
      last_reason = jsonb_build_object(
        'compute_profile', 'micro-1gb',
        'total_client_connections', total_client_connections,
        'active_client_queries', active_client_queries,
        'waiting_client_queries', waiting_client_queries,
        'long_client_queries', long_client_queries,
        'recent_non_success', recent_non_success,
        'recent_slow_batch_runs', recent_slow_batch_runs,
        'hard_pressure', hard_pressure,
        'sustained_pressure', sustained_pressure
      ),
      updated_at = now()
  where singleton = true
  returning * into result;

  return result;
end;
$$;

revoke all on function public.evaluate_runtime_capacity() from public, anon, authenticated;
grant execute on function public.evaluate_runtime_capacity() to service_role;

comment on function public.evaluate_runtime_capacity() is
  'Micro-compute guard: pauses all registered background jobs before connection/wait pressure makes viewer queries unavailable; resumes only after 15 real healthy minutes.';
