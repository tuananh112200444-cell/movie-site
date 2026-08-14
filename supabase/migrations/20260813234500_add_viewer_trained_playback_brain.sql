-- Learn source quality from real playback without trusting one viewer enough to
-- deactivate a source. Server-side probes remain the authority for hard health.

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
      -- A third-party iframe loading is not proof that its media advances.
      -- Until real stable-playback evidence exists, it cannot outrank a
      -- directly probeable HLS source.
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
    set
      viewer_success_sessions = evidence.successes,
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

revoke all on function public.refresh_exact_viewer_playback_score(text, text, text) from public, anon, authenticated;
grant execute on function public.refresh_exact_viewer_playback_score(text, text, text) to service_role;

create or replace function public.learn_from_player_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if new.event_type in (
    'playback_stable', 'playback_heartbeat', 'stall_recovery', 'stall_fatal',
    'hls_fatal', 'hls_fatal_retry', 'direct_video_error', 'native_hls_error', 'iframe_blocked'
  ) and nullif(trim(new.movie_slug), '') is not null
    and nullif(trim(new.episode_slug), '') is not null
    and nullif(trim(new.source_host), '') is not null then
    perform public.refresh_exact_viewer_playback_score(new.movie_slug, new.episode_slug, new.source_host);
  end if;
  return new;
end;
$$;

drop trigger if exists learn_from_player_event on public.player_error_events;
create trigger learn_from_player_event
after insert on public.player_error_events
for each row execute function public.learn_from_player_event();

create or replace function public.backfill_playback_score_v2(p_limit integer default 10000)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare affected integer := 0;
begin
  with batch as materialized (
    select id
    from public.streams
    where playback_score_version < 2
    order by updated_at desc nulls last, id
    limit greatest(1, least(coalesce(p_limit, 10000), 20000))
    for update skip locked
  ), updated as (
    update public.streams stream
    set playback_score = public.calculate_playback_score_v2(
      stream.health_status, stream.response_time_ms, stream.failure_count,
      stream.stream_url, stream.embed_url, stream.last_error, stream.last_checked_at,
      stream.viewer_success_sessions, stream.viewer_failure_sessions,
      stream.viewer_stall_sessions, stream.viewer_watch_seconds,
      stream.viewer_stall_seconds, stream.viewer_startup_ms
    ), playback_score_version = 2
    from batch where stream.id = batch.id
    returning stream.id
  ) select count(*) into affected from updated;
  return affected;
end;
$$;

revoke all on function public.backfill_playback_score_v2(integer) from public, anon, authenticated;
grant execute on function public.backfill_playback_score_v2(integer) to service_role;

insert into public.runtime_capacity_managed_jobs (job_name)
values ('backfill-playback-score-v2-every-minute')
on conflict (job_name) do nothing;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'backfill-playback-score-v2-every-minute';
  perform cron.schedule(
    'backfill-playback-score-v2-every-minute',
    '* * * * *',
    $cmd$select public.backfill_playback_score_v2(10000);$cmd$
  );
end;
$scheduler$;

select public.backfill_playback_score_v2(10000);

comment on function public.calculate_playback_score_v2 is
  'Ranks exact movie/episode sources using fresh independent probes plus aggregated real-viewer startup, watch and stall evidence.';
