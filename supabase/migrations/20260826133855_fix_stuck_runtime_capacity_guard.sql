-- The previous guard treated ordinary pooled traffic and cache hits as hard
-- database pressure. Once protect mode was entered it required twenty fully
-- quiet minutes to recover, which left the catalogue scheduler paused for
-- days even though there were no waiting or long-running queries.
create or replace function public.evaluate_runtime_capacity()
returns public.runtime_capacity_state
language plpgsql
security definer
set search_path = public, cron, pg_catalog, pg_temp
as $$
declare
  current_state public.runtime_capacity_state;
  result public.runtime_capacity_state;
  previous_sample public.runtime_capacity_samples;
  current_blks_read bigint := 0;
  current_blks_hit bigint := 0;
  current_temp_bytes bigint := 0;
  current_tup_returned bigint := 0;
  current_xact_count bigint := 0;
  elapsed_seconds numeric := 0;
  delta_blks_read bigint := 0;
  delta_blks_hit bigint := 0;
  delta_temp_bytes bigint := 0;
  delta_tup_returned bigint := 0;
  delta_xact_count bigint := 0;
  max_client_connections integer := 90;
  connection_pressure_limit integer := 72;
  total_client_connections integer := 0;
  active_client_queries integer := 0;
  waiting_client_queries integer := 0;
  long_client_queries integer := 0;
  recent_non_success integer := 0;
  recent_slow_batch_runs integer := 0;
  hard_pressure boolean := false;
  scan_pressure boolean := false;
  job_pressure boolean := false;
  pressure_signal boolean := false;
  next_mode text := 'normal';
  next_pressure integer := 0;
  next_healthy integer := 0;
  next_healthy_since timestamptz;
  load_profile text := public.current_viewer_load_profile();
begin
  select * into current_state
  from public.runtime_capacity_state
  where singleton = true
  for update;

  select * into previous_sample
  from public.runtime_capacity_samples
  where singleton = true
  for update;

  select blks_read, blks_hit, temp_bytes, tup_returned, xact_commit + xact_rollback
  into current_blks_read, current_blks_hit, current_temp_bytes, current_tup_returned, current_xact_count
  from pg_stat_database
  where datname = current_database();

  elapsed_seconds := greatest(1, extract(epoch from now() - previous_sample.sampled_at));
  delta_blks_read := greatest(0, current_blks_read - previous_sample.blks_read);
  delta_blks_hit := greatest(0, current_blks_hit - previous_sample.blks_hit);
  delta_temp_bytes := greatest(0, current_temp_bytes - previous_sample.temp_bytes);
  delta_tup_returned := greatest(0, current_tup_returned - previous_sample.tup_returned);
  delta_xact_count := greatest(0, current_xact_count - previous_sample.xact_count);

  update public.runtime_capacity_samples
  set sampled_at = now(), blks_read = current_blks_read, blks_hit = current_blks_hit,
      temp_bytes = current_temp_bytes, tup_returned = current_tup_returned,
      xact_count = current_xact_count
  where singleton = true;

  max_client_connections := greatest(20, current_setting('max_connections')::integer);
  connection_pressure_limit := greatest(40, floor(max_client_connections * 0.80)::integer);

  select
    count(*) filter (where backend_type = 'client backend'),
    count(*) filter (where backend_type = 'client backend' and state = 'active'),
    count(*) filter (where backend_type = 'client backend' and state = 'active' and wait_event is not null),
    count(*) filter (where backend_type = 'client backend' and state = 'active' and now() - query_start > interval '20 seconds')
  into total_client_connections, active_client_queries, waiting_client_queries, long_client_queries
  from pg_stat_activity
  where datname = current_database()
    and pid <> pg_backend_pid();

  select
    count(*) filter (where details.status <> 'succeeded'),
    count(*) filter (where coalesce(details.end_time, now()) - details.start_time > interval '45 seconds')
  into recent_non_success, recent_slow_batch_runs
  from cron.job_run_details details
  join cron.job jobs on jobs.jobid = details.jobid
  join public.runtime_capacity_managed_jobs managed on managed.job_name = jobs.jobname
  where details.start_time >= now() - interval '12 minutes';

  -- Connections or active queries alone are not a failure signal when the
  -- pool is serving them without waits. Enter hard protection for actual
  -- contention, a long query, or combined connection and execution pressure.
  hard_pressure := waiting_client_queries >= 2
    or long_client_queries >= 1
    or (
      total_client_connections >= connection_pressure_limit
      and active_client_queries >= 10
    );

  -- Cache hits are deliberately excluded: a high cache-hit rate is healthy
  -- throughput. Scans only count as pressure when concurrency is also high.
  scan_pressure := elapsed_seconds <= 600
    and (active_client_queries >= 8 or waiting_client_queries >= 1)
    and (
      (delta_blks_read * 120.0 / elapsed_seconds) >= 20000
      or (delta_tup_returned * 120.0 / elapsed_seconds) >= 30000000
      or (delta_temp_bytes * 120.0 / elapsed_seconds) >= 268435456
    );

  job_pressure := recent_non_success >= 2 or recent_slow_batch_runs >= 3;
  pressure_signal := hard_pressure or scan_pressure or job_pressure;

  if pressure_signal then
    next_pressure := current_state.consecutive_pressure + 1;
    next_healthy := 0;
    next_healthy_since := null;
    next_mode := case
      when hard_pressure or job_pressure or next_pressure >= 3 then 'protect'
      else current_state.mode
    end;
  elsif current_state.mode = 'protect' then
    next_pressure := 0;
    next_healthy := current_state.consecutive_healthy + 1;
    next_healthy_since := coalesce(current_state.healthy_since, now());
    next_mode := case
      when next_healthy >= 3
       and now() - next_healthy_since >= interval '4 minutes' then 'normal'
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
        'guard_version', 3,
        'viewer_profile', load_profile,
        'max_connections', max_client_connections,
        'connection_pressure_limit', connection_pressure_limit,
        'total_connections', total_client_connections,
        'active_queries', active_client_queries,
        'waiting_queries', waiting_client_queries,
        'long_queries', long_client_queries,
        'sample_seconds', elapsed_seconds,
        'blocks_read_delta', delta_blks_read,
        'blocks_hit_delta', delta_blks_hit,
        'rows_returned_delta', delta_tup_returned,
        'temp_bytes_delta', delta_temp_bytes,
        'transactions_delta', delta_xact_count,
        'failed_jobs_12m', recent_non_success,
        'slow_jobs_12m', recent_slow_batch_runs,
        'hard_pressure', hard_pressure,
        'scan_pressure', scan_pressure,
        'job_pressure', job_pressure
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
  'Adaptive capacity guard v3: protects on contention or combined scan pressure and self-recovers after three healthy samples.';

-- Recover immediately only when the live database is clearly below the new
-- hard limits. This avoids waiting another four minutes after deploying the
-- fix, without overriding a genuinely overloaded database.
do $$
declare
  max_client_connections integer := greatest(20, current_setting('max_connections')::integer);
  connection_pressure_limit integer;
  total_client_connections integer := 0;
  active_client_queries integer := 0;
  waiting_client_queries integer := 0;
  long_client_queries integer := 0;
begin
  connection_pressure_limit := greatest(40, floor(max_client_connections * 0.80)::integer);

  select
    count(*) filter (where backend_type = 'client backend'),
    count(*) filter (where backend_type = 'client backend' and state = 'active'),
    count(*) filter (where backend_type = 'client backend' and state = 'active' and wait_event is not null),
    count(*) filter (where backend_type = 'client backend' and state = 'active' and now() - query_start > interval '20 seconds')
  into total_client_connections, active_client_queries, waiting_client_queries, long_client_queries
  from pg_stat_activity
  where datname = current_database()
    and pid <> pg_backend_pid();

  if total_client_connections < connection_pressure_limit
     and active_client_queries < 10
     and waiting_client_queries = 0
     and long_client_queries = 0 then
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

    update public.runtime_capacity_state
    set mode = 'normal',
        entered_protect_at = null,
        consecutive_pressure = 0,
        consecutive_healthy = 0,
        healthy_since = null,
        last_evaluated_at = now(),
        last_reason = jsonb_build_object(
          'guard_version', 3,
          'recovered_by_migration', true,
          'max_connections', max_client_connections,
          'connection_pressure_limit', connection_pressure_limit,
          'total_connections', total_client_connections,
          'active_queries', active_client_queries,
          'waiting_queries', waiting_client_queries,
          'long_queries', long_client_queries
        ),
        updated_at = now()
    where singleton = true;
  end if;
end;
$$;

-- Keep every brain task comfortably below the Edge request budget. A single
-- four-title provider batch could exceed 100 seconds and lose the entire
-- cycle. Small idempotent batches finish reliably and are retried frequently.
update public.system_brain_tasks
set params = coalesce(params, '{}'::jsonb) || '{"limit":1,"_timeout_ms":55000}'::jsonb,
    next_run_at = least(next_run_at, now()),
    updated_at = now()
where task_key = 'catalog:kkphim-peak-freshness';

update public.system_brain_tasks
set params = coalesce(params, '{}'::jsonb) || '{"limit":2,"_timeout_ms":55000}'::jsonb,
    next_run_at = least(next_run_at, now()),
    updated_at = now()
where task_key in (
  'catalog:kkphim-recent',
  'catalog:vsmov-recent',
  'catalog:nguonc-recent',
  'catalog:blvietsub-recent',
  'catalog:glvietsub-recent',
  'catalog:motchill-recent',
  'catalog:onlyflix-recent',
  'catalog:cobephim-recent'
);

update public.system_brain_tasks
set params = coalesce(params, '{}'::jsonb) || '{"limit":1,"provider_budget":2,"_timeout_ms":50000}'::jsonb,
    priority = 2,
    interval_seconds = greatest(interval_seconds, 3600),
    next_run_at = greatest(next_run_at, now() + interval '30 minutes'),
    updated_at = now()
where task_key = 'catalog:provider-repair';
