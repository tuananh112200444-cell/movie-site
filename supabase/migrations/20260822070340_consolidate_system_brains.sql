-- Consolidate all recurring catalogue and playback work behind two durable
-- queues. Connectors remain focused adapters; only Catalog Brain and Playback
-- Brain choose what runs. Runtime capacity remains the single scheduler
-- governor.

create table if not exists public.system_brain_tasks (
  task_key text primary key,
  brain text not null check (brain in ('catalog', 'playback')),
  handler text not null,
  params jsonb not null default '{}'::jsonb,
  priority smallint not null default 3 check (priority between 1 and 5),
  interval_seconds integer not null check (interval_seconds between 60 and 604800),
  enabled boolean not null default true,
  status text not null default 'idle' check (status in ('idle', 'running')),
  next_run_at timestamptz not null default now(),
  lease_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  attempts bigint not null default 0,
  consecutive_failures integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists system_brain_tasks_due_idx
  on public.system_brain_tasks (brain, next_run_at, priority desc, task_key)
  where enabled is true;

create index if not exists movies_hidden_reconciliation_idx
  on public.movies (updated_at desc, id)
  where is_published is false
    and lower(coalesce(seo_catalog_status, '')) not in ('hidden', 'draft', 'superseded');

create index if not exists streams_problem_queue_v2_idx
  on public.streams (last_checked_at, priority desc, movie_id, id)
  where health_status in ('failed', 'dead', 'blocked')
    and (stream_url <> '' or embed_url <> '');

create index if not exists streams_problem_recent_v2_idx
  on public.streams (updated_at desc, movie_id, id)
  where health_status in ('failed', 'dead', 'blocked')
    and (stream_url <> '' or embed_url <> '');

drop index if exists public.streams_problem_queue_idx;
drop index if exists public.streams_problem_recent_idx;

create index if not exists movies_playback_recovery_idx
  on public.movies (updated_at desc, id)
  where is_published is false and seo_catalog_status = 'awaiting_playback';

alter table public.system_brain_tasks enable row level security;
revoke all on table public.system_brain_tasks from public, anon, authenticated;
grant select, insert, update, delete on table public.system_brain_tasks to service_role;

create or replace function public.claim_system_brain_tasks(
  p_brain text,
  p_limit integer default 1
)
returns table (
  task_key text,
  handler text,
  params jsonb,
  attempts bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if p_brain not in ('catalog', 'playback') then
    raise exception 'Unsupported brain: %', p_brain using errcode = '22023';
  end if;

  return query
  with candidates as materialized (
    select task.task_key
    from public.system_brain_tasks task
    where task.brain = p_brain
      and task.enabled is true
      and task.next_run_at <= now()
      and (task.lease_until is null or task.lease_until <= now())
    order by task.priority desc, task.next_run_at, task.task_key
    for update of task skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 2))
  ), claimed as (
    update public.system_brain_tasks task
    set status = 'running',
        lease_until = now() + interval '3 minutes',
        last_started_at = now(),
        attempts = task.attempts + 1,
        updated_at = now()
    from candidates candidate
    where task.task_key = candidate.task_key
    returning task.task_key, task.handler, task.params, task.attempts
  )
  select claimed.task_key, claimed.handler, claimed.params, claimed.attempts
  from claimed
  order by claimed.task_key;
end;
$$;

create or replace function public.complete_system_brain_task(
  p_task_key text,
  p_success boolean,
  p_error text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed integer := 0;
begin
  update public.system_brain_tasks task
  set status = 'idle',
      lease_until = null,
      last_finished_at = now(),
      consecutive_failures = case when p_success then 0 else task.consecutive_failures + 1 end,
      last_error = case when p_success then null else nullif(left(coalesce(p_error, ''), 2000), '') end,
      next_run_at = now() + make_interval(secs => case
        when p_success then task.interval_seconds
        else least(21600, task.interval_seconds * (1 << least(task.consecutive_failures + 1, 5)))
      end),
      metadata = task.metadata || jsonb_build_object(
        'last_result', coalesce(p_metadata, '{}'::jsonb),
        'last_success', p_success,
        'last_completed_at', now()
      ),
      updated_at = now()
  where task.task_key = p_task_key;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_system_brain_tasks(text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_system_brain_task(text, boolean, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_system_brain_tasks(text, integer) to service_role;
grant execute on function public.complete_system_brain_task(text, boolean, text, jsonb) to service_role;

comment on table public.system_brain_tasks is
  'Private durable queue. Catalog/Playback brains own policy; handlers are idempotent connector workers.';

-- Restore the viewer-trained scoring function before the Playback Brain owns
-- its queue. A previous capacity migration guarded the consumer when this
-- optional function was missing, leaving real viewer evidence unprocessed.
alter table public.player_error_events
  add column if not exists startup_ms numeric,
  add column if not exists watched_seconds numeric,
  add column if not exists stall_count numeric,
  add column if not exists stall_seconds numeric;

alter table public.streams
  add column if not exists viewer_success_sessions integer not null default 0,
  add column if not exists viewer_failure_sessions integer not null default 0,
  add column if not exists viewer_stall_sessions integer not null default 0,
  add column if not exists viewer_watch_seconds numeric not null default 0,
  add column if not exists viewer_stall_seconds numeric not null default 0,
  add column if not exists viewer_startup_ms integer,
  add column if not exists viewer_last_success_at timestamptz,
  add column if not exists viewer_last_failure_at timestamptz,
  add column if not exists playback_score_version smallint not null default 1;

create index if not exists player_error_events_exact_source_learning_idx
  on public.player_error_events (
    lower(trim(movie_slug)),
    regexp_replace(lower(trim(episode_slug)), '^(tap|episode)-', ''),
    lower(regexp_replace(trim(source_host), '^www\.', '')),
    created_at desc
  )
  where movie_slug is not null and episode_slug is not null and source_host is not null;

create or replace function public.calculate_playback_score_v2(
  p_health_status text,
  p_response_time_ms integer,
  p_failure_count integer,
  p_stream_url text,
  p_embed_url text,
  p_last_error text,
  p_last_checked_at timestamptz,
  p_viewer_success_sessions integer,
  p_viewer_failure_sessions integer,
  p_viewer_stall_sessions integer,
  p_viewer_watch_seconds numeric,
  p_viewer_stall_seconds numeric,
  p_viewer_startup_ms integer
)
returns integer
language sql
stable
parallel safe
as $$
  with input as (
    select
      lower(coalesce(p_health_status, 'unchecked')) as health,
      nullif(trim(coalesce(p_stream_url, '')), '') is not null as has_direct,
      nullif(trim(coalesce(p_embed_url, '')), '') is not null as has_embed,
      p_last_checked_at is not null and p_last_checked_at >= now() - interval '24 hours' as fresh,
      greatest(0, coalesce(p_viewer_success_sessions, 0)) as successes,
      greatest(0, coalesce(p_viewer_failure_sessions, 0)) as failures,
      greatest(0, coalesce(p_viewer_stall_sessions, 0)) as stalls,
      greatest(0, coalesce(p_viewer_watch_seconds, 0)) as watched,
      greatest(0, coalesce(p_viewer_stall_seconds, 0)) as stalled_seconds
  ), scored as (
    select
      case health
        when 'ok' then case when fresh then 600 else 380 end
        when 'healthy' then case when fresh then 600 else 380 end
        when 'degraded' then case when fresh then 350 else 250 end
        when 'unchecked' then 300
        when 'blocked' then 100
        when 'failed' then 60
        when 'dead' then 0
        else 220
      end
      + case when has_direct then 120 when has_embed then 30 else -1000 end
      + case
          when coalesce(p_response_time_ms, 0) <= 0 then 0
          when p_response_time_ms <= 800 then 120
          when p_response_time_ms <= 1500 then 90
          when p_response_time_ms <= 3000 then 45
          when p_response_time_ms <= 5000 then 10
          when p_response_time_ms <= 8000 then -40
          else -100
        end
      - least(450, greatest(0, coalesce(p_failure_count, 0)) * 85)
      - case
          when coalesce(p_last_error, '') like 'Viewer telemetry:%' then 140
          when coalesce(p_last_error, '') like 'Provider verification pending:%' then 40
          else 0
        end
      + least(260, successes * 55)
      + least(120, floor(watched / 12))::integer
      - least(500, failures * 110)
      - least(260, stalls * 45)
      - least(160, floor(stalled_seconds * 3))::integer
      - case
          when coalesce(p_viewer_startup_ms, 0) <= 0 then 0
          when p_viewer_startup_ms <= 2500 then 0
          when p_viewer_startup_ms <= 5000 then 35
          when p_viewer_startup_ms <= 8000 then 90
          else 170
        end as raw_score,
      has_direct,
      successes
    from input
  )
  select greatest(0, least(
    1000,
    case
      when not has_direct and successes = 0 then least(raw_score, 420)
      else raw_score
    end
  ))::integer
  from scored
$$;

create or replace function public.set_stream_playback_brain_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  new.provider_key := public.playback_provider_key(new.source, new.stream_url, new.embed_url);
  new.playback_score := public.calculate_playback_score_v2(
    new.health_status,
    new.response_time_ms,
    new.failure_count,
    new.stream_url,
    new.embed_url,
    new.last_error,
    new.last_checked_at,
    new.viewer_success_sessions,
    new.viewer_failure_sessions,
    new.viewer_stall_sessions,
    new.viewer_watch_seconds,
    new.viewer_stall_seconds,
    new.viewer_startup_ms
  );
  new.playback_score_version := 2;
  return new;
end;
$$;

drop trigger if exists set_stream_playback_brain_fields on public.streams;
create trigger set_stream_playback_brain_fields
before insert or update of
  source, stream_url, embed_url, health_status, response_time_ms, failure_count,
  last_error, last_checked_at, viewer_success_sessions, viewer_failure_sessions,
  viewer_stall_sessions, viewer_watch_seconds, viewer_stall_seconds, viewer_startup_ms
on public.streams
for each row execute function public.set_stream_playback_brain_fields();

create or replace function public.refresh_exact_viewer_playback_score(
  p_movie_slug text,
  p_episode_slug text,
  p_source_host text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  affected integer := 0;
begin
  with normalized as materialized (
    select
      lower(trim(p_movie_slug)) as movie_slug,
      regexp_replace(lower(trim(p_episode_slug)), '^(tap|episode)-', '') as episode_slug,
      lower(regexp_replace(trim(p_source_host), '^www\.', '')) as source_host
  ), session_evidence as materialized (
    select
      playback_session_id,
      bool_or(event_type = 'playback_stable') as succeeded,
      bool_or(event_type in (
        'stall_fatal', 'hls_fatal', 'hls_fatal_retry', 'direct_video_error',
        'native_hls_error', 'iframe_blocked'
      )) as failed,
      bool_or(event_type in ('stall_recovery', 'stall_fatal')) as stalled,
      max(coalesce(watched_seconds, 0)) as watched_seconds,
      max(coalesce(stall_seconds, 0)) as stall_seconds,
      max(startup_ms) as startup_ms,
      max(created_at) filter (where event_type in ('playback_stable', 'playback_heartbeat')) as last_success_at,
      max(created_at) filter (where event_type in (
        'stall_fatal', 'hls_fatal', 'hls_fatal_retry', 'direct_video_error',
        'native_hls_error', 'iframe_blocked'
      )) as last_failure_at
    from public.player_error_events event
    cross join normalized target
    where event.created_at >= now() - interval '24 hours'
      and lower(trim(coalesce(event.movie_slug, ''))) = target.movie_slug
      and regexp_replace(lower(trim(coalesce(event.episode_slug, ''))), '^(tap|episode)-', '') = target.episode_slug
      and lower(regexp_replace(trim(coalesce(event.source_host, '')), '^www\.', '')) = target.source_host
      and playback_session_id is not null
    group by playback_session_id
  ), evidence as materialized (
    select
      count(*) filter (where succeeded)::integer as successes,
      count(*) filter (where failed)::integer as failures,
      count(*) filter (where stalled)::integer as stalls,
      coalesce(sum(watched_seconds), 0) as watched_seconds,
      coalesce(sum(stall_seconds), 0) as stall_seconds,
      avg(startup_ms)::integer as startup_ms,
      max(last_success_at) as last_success_at,
      max(last_failure_at) as last_failure_at
    from session_evidence
  ), updated as (
    update public.streams stream
    set viewer_success_sessions = evidence.successes,
        viewer_failure_sessions = evidence.failures,
        viewer_stall_sessions = evidence.stalls,
        viewer_watch_seconds = evidence.watched_seconds,
        viewer_stall_seconds = evidence.stall_seconds,
        viewer_startup_ms = evidence.startup_ms,
        viewer_last_success_at = evidence.last_success_at,
        viewer_last_failure_at = evidence.last_failure_at,
        updated_at = now()
    from public.movies movie, normalized target, evidence
    where movie.id = stream.movie_id
      and lower(trim(movie.slug)) = target.movie_slug
      and regexp_replace(lower(trim(coalesce(stream.episode_slug, ''))), '^(tap|episode)-', '') = target.episode_slug
      and (
        lower(regexp_replace(coalesce(substring(stream.stream_url from '^https?://([^/:?#]+)'), ''), '^www\.', '')) = target.source_host
        or lower(regexp_replace(coalesce(substring(stream.embed_url from '^https?://([^/:?#]+)'), ''), '^www\.', '')) = target.source_host
      )
    returning stream.id
  )
  select count(*) into affected from updated;

  return affected;
end;
$$;

revoke all on function public.refresh_exact_viewer_playback_score(text, text, text)
  from public, anon, authenticated;
grant execute on function public.refresh_exact_viewer_playback_score(text, text, text) to service_role;

create or replace function public.enqueue_player_learning_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  normalized_movie text := lower(trim(coalesce(new.movie_slug, '')));
  normalized_episode text := regexp_replace(lower(trim(coalesce(new.episode_slug, ''))), '^(tap|episode)-', '');
  normalized_host text := lower(regexp_replace(trim(coalesce(new.source_host, '')), '^www\.', ''));
begin
  if new.event_type not in (
    'playback_stable', 'playback_heartbeat', 'stall_recovery', 'stall_fatal',
    'hls_fatal', 'hls_fatal_retry', 'direct_video_error', 'native_hls_error', 'iframe_blocked'
  ) or normalized_movie = '' or normalized_episode = '' or normalized_host = '' then
    return new;
  end if;

  insert into public.playback_learning_queue (
    movie_slug, episode_slug, source_host, queued_at, last_event_at, event_count, attempts, last_error
  ) values (
    normalized_movie, normalized_episode, normalized_host, now(), new.created_at, 1, 0, null
  )
  on conflict (movie_slug, episode_slug, source_host) do update
  set last_event_at = greatest(playback_learning_queue.last_event_at, excluded.last_event_at),
      event_count = least(playback_learning_queue.event_count + 1, 2147483647),
      last_error = null;

  return new;
end;
$$;

drop trigger if exists learn_from_player_event on public.player_error_events;
drop trigger if exists enqueue_player_learning_event on public.player_error_events;
create trigger enqueue_player_learning_event
after insert on public.player_error_events
for each row execute function public.enqueue_player_learning_event();

revoke all on function public.enqueue_player_learning_event() from public, anon, authenticated;

create or replace function public.reconcile_hidden_usable_movies(p_limit integer default 80)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  scanned integer := 0;
  republished integer := 0;
begin
  for item in
    select movie.id
    from public.movies movie
    where movie.is_published is false
      and lower(coalesce(movie.seo_catalog_status, '')) not in ('hidden', 'draft', 'superseded')
      and (
        exists (
          select 1 from public.streams stream
          where stream.movie_id = movie.id
            and stream.is_active is true
            and (coalesce(stream.stream_url, '') <> '' or coalesce(stream.embed_url, '') <> '')
        )
        or exists (
          select 1 from public.movie_episodes episode
          where episode.movie_id = movie.id
            and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
        )
      )
    order by movie.updated_at desc nulls last, movie.id
    for update of movie skip locked
    limit greatest(1, least(coalesce(p_limit, 80), 200))
  loop
    scanned := scanned + 1;
    perform public.reconcile_movie_release_state(item.id);
    if exists (select 1 from public.movies movie where movie.id = item.id and movie.is_published is true) then
      republished := republished + 1;
    end if;
  end loop;

  return jsonb_build_object('success', true, 'scanned', scanned, 'republished', republished, 'checked_at', now());
end;
$$;

revoke all on function public.reconcile_hidden_usable_movies(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_hidden_usable_movies(integer) to service_role;

insert into public.system_brain_tasks (
  task_key, brain, handler, params, priority, interval_seconds, next_run_at
)
values
  ('catalog:ophim-recent', 'catalog', 'sync-ophim-movies', '{"provider":"ophim","pages":1,"limit":4,"episodes":1,"_timeout_ms":100000}'::jsonb, 5, 900, now()),
  ('catalog:kkphim-recent', 'catalog', 'sync-ophim-movies', '{"provider":"kkphim","pages":1,"limit":4,"episodes":1,"_timeout_ms":100000}'::jsonb, 5, 900, now() + interval '1 minute'),
  ('catalog:vsmov-recent', 'catalog', 'sync-ophim-movies', '{"provider":"vsmov","pages":1,"limit":4,"episodes":1,"_timeout_ms":100000}'::jsonb, 4, 1800, now() + interval '2 minutes'),
  ('catalog:nguonc-recent', 'catalog', 'sync-ophim-movies', '{"provider":"nguonc","pages":1,"limit":4,"episodes":1,"_timeout_ms":100000}'::jsonb, 4, 1800, now() + interval '3 minutes'),
  ('catalog:blvietsub-recent', 'catalog', 'sync-blvietsub-feed', '{"limit":4,"offset":0,"page_size":60,"refresh_search":0,"_timeout_ms":100000}'::jsonb, 4, 900, now() + interval '4 minutes'),
  ('catalog:glvietsub-recent', 'catalog', 'sync-glvietsub-feed', '{"limit":2,"recent":1,"_timeout_ms":100000}'::jsonb, 4, 900, now() + interval '5 minutes'),
  ('catalog:motchill-recent', 'catalog', 'sync-motchill-feed', '{"limit":3,"_timeout_ms":100000}'::jsonb, 3, 1800, now() + interval '6 minutes'),
  ('catalog:provider-repair', 'catalog', 'unified-provider-brain', '{"limit":1,"provider_budget":1,"_timeout_ms":100000}'::jsonb, 5, 900, now() + interval '7 minutes'),
  ('catalog:glvietsub-raw-upgrade', 'catalog', 'rpc:dispatch_glvietsub_raw_upgrades', '{"p_limit":2}'::jsonb, 3, 1200, now() + interval '8 minutes'),
  ('catalog:tmdb-enrichment', 'catalog', 'enrich-tmdb-metadata', '{"limit":12}'::jsonb, 2, 3600, now() + interval '9 minutes'),
  ('playback:problem', 'playback', 'stream-health-check', '{"queue":"problem","limit":4,"concurrency":2,"deactivate_after":3,"_timeout_ms":100000}'::jsonb, 5, 900, now()),
  ('playback:newest', 'playback', 'stream-health-check', '{"queue":"newest","limit":8,"movie_limit":20,"concurrency":2,"deactivate_after":3,"_timeout_ms":100000}'::jsonb, 4, 900, now() + interval '4 minutes'),
  ('playback:unchecked', 'playback', 'stream-health-check', '{"queue":"unchecked","limit":8,"concurrency":2,"deactivate_after":4,"_timeout_ms":100000}'::jsonb, 3, 1800, now() + interval '6 minutes'),
  ('playback:stale', 'playback', 'stream-health-check', '{"queue":"stale","limit":8,"concurrency":2,"deactivate_after":4,"_timeout_ms":100000}'::jsonb, 2, 3600, now() + interval '8 minutes'),
  ('playback:telemetry-repair', 'playback', 'auto-repair-player-issues', '{"hours":12,"limit":1,"threshold":3,"event_limit":300,"_timeout_ms":100000}'::jsonb, 4, 900, now() + interval '10 minutes'),
  ('playback:learning', 'playback', 'rpc:process_playback_learning_queue', '{"p_limit":2}'::jsonb, 5, 60, now() + interval '1 minute')
on conflict (task_key) do update
set brain = excluded.brain,
    handler = excluded.handler,
    params = excluded.params,
    priority = excluded.priority,
    interval_seconds = excluded.interval_seconds,
    enabled = true,
    consecutive_failures = case
      when public.system_brain_tasks.params is distinct from excluded.params then 0
      else public.system_brain_tasks.consecutive_failures
    end,
    last_error = case
      when public.system_brain_tasks.params is distinct from excluded.params then null
      else public.system_brain_tasks.last_error
    end,
    next_run_at = case
      when public.system_brain_tasks.params is distinct from excluded.params then least(public.system_brain_tasks.next_run_at, now() + interval '1 minute')
      else public.system_brain_tasks.next_run_at
    end,
    updated_at = now();

update public.system_brain_tasks
set enabled = false,
    status = 'idle',
    lease_until = null,
    consecutive_failures = 0,
    last_error = 'One-time hidden/playable backlog reconciled; future writes use release-state triggers',
    updated_at = now()
where task_key = 'catalog:release-reconciliation';

update public.system_brain_tasks
set enabled = false,
    status = 'idle',
    lease_until = null,
    consecutive_failures = 0,
    last_error = 'Retired: problem queue covers the same failed/dead/blocked stream population',
    updated_at = now()
where task_key = 'playback:recovery';

-- The statement-level triggers below already enqueue each affected movie once
-- per SQL statement. This leftover row trigger repeated the same queue write
-- for every movie_episodes row in large provider imports.
do $trigger_cleanup$
begin
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.movie_episodes'::regclass
      and tgname = 'enqueue_movie_refresh_after_episode_insert'
      and not tgisinternal
  ) and exists (
    select 1 from pg_trigger
    where tgrelid = 'public.movie_episodes'::regclass
      and tgname = 'enqueue_movie_refresh_after_episode_update'
      and not tgisinternal
  ) and exists (
    select 1 from pg_trigger
    where tgrelid = 'public.movie_episodes'::regclass
      and tgname = 'enqueue_movie_refresh_after_episode_delete'
      and not tgisinternal
  ) then
    drop trigger if exists enqueue_movie_refresh_after_movie_episode_change on public.movie_episodes;
  end if;
end;
$trigger_cleanup$;

insert into public.runtime_capacity_managed_jobs (job_name)
values
  ('catalog-brain-every-2-minutes'),
  ('playback-brain-every-3-minutes')
on conflict (job_name) do update
set paused_by_capacity_guard = false,
    paused_at = null,
    updated_at = now();

do $scheduler$
declare
  retired_jobs text[] := array[
    'backfill-stream-playback-brain-offpeak',
    'catalog-backfill-priority-supervisor-every-5-minutes',
    'evaluate-runtime-capacity-every-5-minutes',
    'evaluate-runtime-capacity-peak-every-minute',
    'recheck-motchill-ongoing-every-10-minutes',
    'refresh-playback-provider-coverage-every-10-minutes',
    'sync-blvietsub-feed-every-15-minutes',
    'sync-blvietsub-recent-peak-guard',
    'sync-glvietsub-feed-every-15-minutes',
    'sync-glvietsub-recent-every-15-minutes',
    'sync-glvietsub-recent-peak-guard',
    'sync-motchill-feed-every-10-minutes',
    'sync-ophim-priority-every-15-minutes',
    'sync-kkphim-priority-every-15-minutes',
    'sync-provider-backups-every-30-minutes',
    'unified-provider-brain-every-30-minutes',
    'upgrade-glvietsub-raw-every-10-minutes'
  ];
  current_mode text := 'normal';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.alter_job(jobid, active := false)
  from cron.job
  where jobname = any(retired_jobs);

  update public.runtime_capacity_managed_jobs
  set paused_by_capacity_guard = false,
      paused_at = null,
      updated_at = now()
  where job_name not in ('catalog-brain-every-2-minutes', 'playback-brain-every-3-minutes');

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'evaluate-runtime-capacity-every-2-minutes',
    'catalog-brain-every-2-minutes',
    'playback-brain-every-3-minutes'
  );

  perform cron.schedule(
    'evaluate-runtime-capacity-every-2-minutes',
    '*/2 * * * *',
    $cmd$select public.evaluate_runtime_capacity();$cmd$
  );

  perform cron.schedule(
    'catalog-brain-every-2-minutes',
    '*/2 * * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/catalog-brain?limit=1',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 120000
      );
    $cmd$
  );

  perform cron.schedule(
    'playback-brain-every-3-minutes',
    '1-59/3 * * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/playback-brain?limit=1',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 120000
      );
    $cmd$
  );

  insert into public.runtime_capacity_managed_jobs (job_name)
  values
    ('catalog-brain-every-2-minutes'),
    ('playback-brain-every-3-minutes')
  on conflict (job_name) do update
  set paused_by_capacity_guard = false,
      paused_at = null,
      updated_at = now();

  select mode into current_mode
  from public.runtime_capacity_state
  where singleton = true;

  if current_mode = 'protect' then
    update public.runtime_capacity_managed_jobs
    set paused_by_capacity_guard = true,
        paused_at = now(),
        updated_at = now()
    where job_name in ('catalog-brain-every-2-minutes', 'playback-brain-every-3-minutes');

    perform cron.alter_job(jobid, active := false)
    from cron.job
    where jobname in ('catalog-brain-every-2-minutes', 'playback-brain-every-3-minutes');
  end if;
end;
$scheduler$;
