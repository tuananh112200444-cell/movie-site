-- Runtime capacity controller
--
-- This controller deliberately uses only internal-pressure signals. A bad
-- external stream must not pause recovery work merely because player telemetry
-- is high. pg_cron itself remains the executor; this function only pauses the
-- non-critical batch jobs that were explicitly registered below.

create table if not exists public.runtime_capacity_state (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'normal' check (mode in ('normal', 'protect')),
  entered_protect_at timestamptz,
  last_evaluated_at timestamptz not null default now(),
  consecutive_pressure integer not null default 0 check (consecutive_pressure >= 0),
  consecutive_healthy integer not null default 0 check (consecutive_healthy >= 0),
  last_reason jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.runtime_capacity_managed_jobs (
  job_name text primary key,
  paused_by_capacity_guard boolean not null default false,
  paused_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.runtime_capacity_state (singleton)
values (true)
on conflict (singleton) do nothing;

insert into public.runtime_capacity_managed_jobs (job_name)
values
  ('episode-backfill-guard-every-15-minutes'),
  ('stream-health-unchecked-every-15-minutes'),
  ('episode-mismatch-repair-every-15-minutes'),
  ('sync-blvietsub-feed-backfill-every-30-minutes'),
  ('repair-blvietsub-smart-every-15-minutes'),
  ('sync-glvietsub-feed-every-15-minutes'),
  ('sync-motchill-feed-every-10-minutes'),
  ('dispatch-catalog-source-repairs-every-2-minutes'),
  ('sync-provider-backups-every-30-minutes'),
  ('quarantine-exhausted-catalog-playback-hourly'),
  ('warm-search-index-every-10-minutes'),
  ('warm-home-proxy-every-15-minutes'),
  ('sync-tmdb-catalog-daily'),
  ('scan-movie-episode-truth'),
  ('scan-catalog-integrity-every-10-minutes'),
  ('scan-episode-sequence-gaps-every-5-minutes'),
  ('sync-onlyflix-feed-hourly'),
  ('recheck-motchill-ongoing-every-10-minutes'),
  ('backfill-audio-type-every-10-minutes')
on conflict (job_name) do nothing;

create or replace function public.evaluate_runtime_capacity()
returns public.runtime_capacity_state
language plpgsql
security definer
set search_path = public, cron, pg_catalog, pg_temp
as $$
declare
  current_state public.runtime_capacity_state;
  result public.runtime_capacity_state;
  active_client_queries integer := 0;
  long_client_queries integer := 0;
  recent_non_success integer := 0;
  recent_slow_batch_runs integer := 0;
  hard_pressure boolean := false;
  sustained_pressure boolean := false;
  next_mode text := 'normal';
  next_pressure integer := 0;
  next_healthy integer := 0;
begin
  select * into current_state
  from public.runtime_capacity_state
  where singleton = true
  for update;

  select
    count(*) filter (where backend_type = 'client backend' and state = 'active'),
    count(*) filter (
      where backend_type = 'client backend'
        and state = 'active'
        and now() - query_start > interval '45 seconds'
    )
  into active_client_queries, long_client_queries
  from pg_stat_activity
  where datname = current_database();

  select
    count(*) filter (where details.status <> 'succeeded'),
    count(*) filter (where coalesce(details.end_time, now()) - details.start_time > interval '45 seconds')
  into recent_non_success, recent_slow_batch_runs
  from cron.job_run_details details
  join cron.job jobs on jobs.jobid = details.jobid
  join public.runtime_capacity_managed_jobs managed on managed.job_name = jobs.jobname
  where details.start_time >= now() - interval '15 minutes';

  -- Thresholds are intentionally above the observed normal snapshot and the
  -- 24h p95 job duration (15.3s). Do not protect on one slow external call.
  hard_pressure := active_client_queries >= 20 or long_client_queries >= 4;
  sustained_pressure := recent_non_success >= 4 and recent_slow_batch_runs >= 2;

  if hard_pressure or sustained_pressure then
    next_pressure := current_state.consecutive_pressure + 1;
    next_healthy := 0;
    if hard_pressure or next_pressure >= 2 then
      next_mode := 'protect';
    else
      next_mode := current_state.mode;
    end if;
  elsif current_state.mode = 'protect' then
    next_pressure := 0;
    next_healthy := current_state.consecutive_healthy + 1;
    -- Require 15 stable minutes before re-enabling background work.
    next_mode := case when next_healthy >= 3 then 'normal' else 'protect' end;
  else
    next_pressure := 0;
    next_healthy := 0;
    next_mode := 'normal';
  end if;

  if next_mode = 'protect' and current_state.mode <> 'protect' then
    update public.runtime_capacity_managed_jobs managed
    set paused_by_capacity_guard = true,
        paused_at = now(),
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
  set
    mode = next_mode,
    entered_protect_at = case
      when next_mode = 'protect' and current_state.mode <> 'protect' then now()
      when next_mode = 'normal' then null
      else current_state.entered_protect_at
    end,
    last_evaluated_at = now(),
    consecutive_pressure = next_pressure,
    consecutive_healthy = next_healthy,
    last_reason = jsonb_build_object(
      'active_client_queries', active_client_queries,
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

alter table public.runtime_capacity_state enable row level security;
alter table public.runtime_capacity_managed_jobs enable row level security;
revoke all on table public.runtime_capacity_state from public, anon, authenticated;
revoke all on table public.runtime_capacity_managed_jobs from public, anon, authenticated;
grant select on public.runtime_capacity_state, public.runtime_capacity_managed_jobs to service_role;
revoke all on function public.evaluate_runtime_capacity() from public, anon, authenticated;
grant execute on function public.evaluate_runtime_capacity() to service_role;

do $scheduler$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'evaluate-runtime-capacity-every-5-minutes';

  perform cron.schedule(
    'evaluate-runtime-capacity-every-5-minutes',
    '0,5,10,15,20,25,30,35,40,45,50,55 * * * *',
    $cmd$select public.evaluate_runtime_capacity();$cmd$
  );
end;
$scheduler$;

comment on function public.evaluate_runtime_capacity() is
  'Pauses only registered non-critical batch jobs during verified internal database pressure; source/playback telemetry alone never activates protect mode.';
