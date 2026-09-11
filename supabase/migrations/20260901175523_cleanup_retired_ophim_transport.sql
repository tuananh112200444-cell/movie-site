begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.ophim_cleanup_state (
  phase text primary key,
  phase_order smallint not null unique,
  cursor_uuid uuid,
  cursor_bigint bigint,
  scanned_rows bigint not null default 0,
  deleted_rows bigint not null default 0,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ophim_cleanup_state_phase_check check (
    phase in ('player_error_events', 'streams', 'movie_episodes', 'episodes')
  )
);

revoke all on table private.ophim_cleanup_state from public, anon, authenticated;

insert into private.ophim_cleanup_state (phase, phase_order)
values
  ('player_error_events', 10),
  ('streams', 20),
  ('movie_episodes', 30),
  ('episodes', 40)
on conflict (phase) do update
set phase_order = excluded.phase_order,
    updated_at = now();

create or replace function private.cleanup_retired_ophim_transport_batch(
  p_scan_limit integer default 1000
)
returns jsonb
language plpgsql
security invoker
set search_path = private, public, pg_catalog, pg_temp
as $$
declare
  selected_phase text;
  selected_uuid uuid;
  selected_bigint bigint;
  next_uuid uuid;
  next_bigint bigint;
  target_uuids uuid[] := array[]::uuid[];
  target_bigints bigint[] := array[]::bigint[];
  scanned integer := 0;
  deleted integer := 0;
  bounded_limit integer := greatest(100, least(coalesce(p_scan_limit, 1000), 5000));
  reached_end boolean := false;
  remaining boolean := false;
  cleanup_job_id bigint;
begin
  perform set_config('lock_timeout', '2s', true);
  perform set_config('statement_timeout', '25s', true);

  if not pg_try_advisory_xact_lock(hashtextextended('private.cleanup_retired_ophim_transport_batch', 0)) then
    return jsonb_build_object('status', 'busy');
  end if;

  select state.phase, state.cursor_uuid, state.cursor_bigint
  into selected_phase, selected_uuid, selected_bigint
  from private.ophim_cleanup_state state
  where state.completed is false
  order by state.phase_order
  limit 1
  for update skip locked;

  if selected_phase is null then
    select jobid into cleanup_job_id
    from cron.job
    where jobname = 'cleanup-retired-ophim-transport'
    limit 1;

    if cleanup_job_id is not null then
      perform cron.alter_job(job_id := cleanup_job_id, active := false);
    end if;

    return jsonb_build_object('status', 'complete');
  end if;

  if selected_phase = 'player_error_events' then
    select
      coalesce(array_agg(scan.id) filter (
        where lower(coalesce(scan.source_host, '')) ~ 'ophim|opstream'
      ), array[]::bigint[]),
      count(*)::integer,
      max(scan.id)
    into target_bigints, scanned, next_bigint
    from (
      select event.id, event.source_host
      from public.player_error_events event
      where selected_bigint is null or event.id > selected_bigint
      order by event.id
      limit bounded_limit
    ) scan;

    delete from public.player_error_events event
    where event.id = any(target_bigints);
    get diagnostics deleted = row_count;

  elsif selected_phase = 'streams' then
    select
      coalesce(array_agg(scan.id) filter (
        where public.is_retired_playback_source(
          coalesce(scan.provider_key, scan.source),
          scan.server_name,
          scan.stream_url,
          scan.embed_url
        )
      ), array[]::uuid[]),
      count(*)::integer,
      (array_agg(scan.id order by scan.id desc))[1]
    into target_uuids, scanned, next_uuid
    from (
      select stream.id, stream.provider_key, stream.source, stream.server_name,
             stream.stream_url, stream.embed_url
      from public.streams stream
      where selected_uuid is null or stream.id > selected_uuid
      order by stream.id
      limit bounded_limit
    ) scan;

    delete from public.streams stream
    where stream.id = any(target_uuids);
    get diagnostics deleted = row_count;

  elsif selected_phase = 'movie_episodes' then
    select
      coalesce(array_agg(scan.id::bigint) filter (
        where public.is_retired_playback_source(
          scan.source,
          scan.server_name,
          scan.link_m3u8,
          scan.link_embed
        )
      ), array[]::bigint[]),
      count(*)::integer,
      max(scan.id)::bigint
    into target_bigints, scanned, next_bigint
    from (
      select episode.id, episode.source, episode.server_name,
             episode.link_m3u8, episode.link_embed
      from public.movie_episodes episode
      where selected_bigint is null or episode.id > selected_bigint
      order by episode.id
      limit bounded_limit
    ) scan;

    delete from public.movie_episodes episode
    where episode.id::bigint = any(target_bigints);
    get diagnostics deleted = row_count;

  elsif selected_phase = 'episodes' then
    select
      coalesce(array_agg(scan.id) filter (
        where public.is_retired_playback_source(
          '',
          scan.server_name,
          scan.link_m3u8,
          scan.link_embed
        )
      ), array[]::uuid[]),
      count(*)::integer,
      (array_agg(scan.id order by scan.id desc))[1]
    into target_uuids, scanned, next_uuid
    from (
      select episode.id, episode.server_name, episode.link_m3u8, episode.link_embed
      from public.episodes episode
      where selected_uuid is null or episode.id > selected_uuid
      order by episode.id
      limit bounded_limit
    ) scan;

    delete from public.episodes episode
    where episode.id = any(target_uuids);
    get diagnostics deleted = row_count;
  end if;

  reached_end := scanned < bounded_limit;

  update private.ophim_cleanup_state state
  set cursor_uuid = case
        when selected_phase in ('streams', 'episodes') then next_uuid
        else state.cursor_uuid
      end,
      cursor_bigint = case
        when selected_phase in ('player_error_events', 'movie_episodes') then next_bigint
        else state.cursor_bigint
      end,
      scanned_rows = state.scanned_rows + scanned,
      deleted_rows = state.deleted_rows + deleted,
      updated_at = now()
  where state.phase = selected_phase;

  if reached_end then
    -- A final full-table existence check is intentionally allowed more time.
    -- It runs once per pass and catches any row inserted behind the cursor.
    perform set_config('statement_timeout', '90s', true);

    if selected_phase = 'player_error_events' then
      select exists (
        select 1 from public.player_error_events event
        where lower(coalesce(event.source_host, '')) ~ 'ophim|opstream'
      ) into remaining;
    elsif selected_phase = 'streams' then
      select exists (
        select 1 from public.streams stream
        where public.is_retired_playback_source(
          coalesce(stream.provider_key, stream.source),
          stream.server_name,
          stream.stream_url,
          stream.embed_url
        )
      ) into remaining;
    elsif selected_phase = 'movie_episodes' then
      select exists (
        select 1 from public.movie_episodes episode
        where public.is_retired_playback_source(
          episode.source,
          episode.server_name,
          episode.link_m3u8,
          episode.link_embed
        )
      ) into remaining;
    elsif selected_phase = 'episodes' then
      select exists (
        select 1 from public.episodes episode
        where public.is_retired_playback_source(
          '', episode.server_name, episode.link_m3u8, episode.link_embed
        )
      ) into remaining;
    end if;

    if remaining then
      update private.ophim_cleanup_state state
      set cursor_uuid = null,
          cursor_bigint = null,
          updated_at = now()
      where state.phase = selected_phase;
    else
      update private.ophim_cleanup_state state
      set completed = true,
          completed_at = now(),
          updated_at = now()
      where state.phase = selected_phase;
    end if;
  end if;

  return jsonb_build_object(
    'status', case when reached_end and not remaining then 'phase_complete' else 'running' end,
    'phase', selected_phase,
    'scanned', scanned,
    'deleted', deleted,
    'reached_end', reached_end,
    'remaining_after_pass', remaining
  );
end;
$$;

revoke all on function private.cleanup_retired_ophim_transport_batch(integer)
  from public, anon, authenticated;

do $disable_ophim_ingest$
declare
  target_job record;
begin
  for target_job in
    select jobid
    from cron.job
    where jobname = 'sync-ophim-priority-every-15-minutes'
       or lower(command) ~ 'provider=ophim([&'' ]|$)'
  loop
    perform cron.alter_job(job_id := target_job.jobid, active := false);
  end loop;
end;
$disable_ophim_ingest$;

select cron.schedule(
  'cleanup-retired-ophim-transport',
  '30 seconds',
  'select private.cleanup_retired_ophim_transport_batch(1000);'
);

comment on table private.ophim_cleanup_state is
  'Progress ledger for bounded removal of retired OPhim transport and OPhim-only telemetry. Canonical movie rows are never deleted.';

comment on function private.cleanup_retired_ophim_transport_batch(integer) is
  'Deletes retired OPhim transport and OPhim-specific player error telemetry in bounded, resumable batches. Keeps movies, slugs, SEO metadata, source identities, and provider coverage.';

commit;
