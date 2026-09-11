begin;

create or replace function private.cleanup_retired_ophim_transport_batch(
  p_scan_limit integer default 5
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
  target_movie_uuids uuid[] := array[]::uuid[];
  target_bigints bigint[] := array[]::bigint[];
  scanned integer := 0;
  deleted integer := 0;
  bounded_limit integer := 1;
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

  bounded_limit := case
    when selected_phase = 'player_error_events'
      then greatest(100, least(coalesce(p_scan_limit, 5000), 5000))
    else greatest(1, least(coalesce(p_scan_limit, 5), 100))
  end;

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
      coalesce(array_agg(scan.movie_id), array[]::uuid[]),
      count(*)::integer,
      (array_agg(scan.movie_id order by scan.movie_id desc))[1]
    into target_movie_uuids, scanned, next_uuid
    from (
      select distinct stream.movie_id
      from public.streams stream
      where stream.movie_id is not null
        and (selected_uuid is null or stream.movie_id > selected_uuid)
        and public.is_retired_playback_source(
          coalesce(stream.provider_key, stream.source),
          stream.server_name,
          stream.stream_url,
          stream.embed_url
        )
      order by stream.movie_id
      limit bounded_limit
    ) scan;

    delete from public.streams stream
    where stream.movie_id = any(target_movie_uuids)
      and public.is_retired_playback_source(
        coalesce(stream.provider_key, stream.source),
        stream.server_name,
        stream.stream_url,
        stream.embed_url
      );
    get diagnostics deleted = row_count;

  elsif selected_phase = 'movie_episodes' then
    select
      coalesce(array_agg(scan.movie_id), array[]::uuid[]),
      count(*)::integer,
      (array_agg(scan.movie_id order by scan.movie_id desc))[1]
    into target_movie_uuids, scanned, next_uuid
    from (
      select distinct episode.movie_id
      from public.movie_episodes episode
      where episode.movie_id is not null
        and (selected_uuid is null or episode.movie_id > selected_uuid)
        and public.is_retired_playback_source(
          episode.source,
          episode.server_name,
          episode.link_m3u8,
          episode.link_embed
        )
      order by episode.movie_id
      limit bounded_limit
    ) scan;

    delete from public.movie_episodes episode
    where episode.movie_id = any(target_movie_uuids)
      and public.is_retired_playback_source(
        episode.source,
        episode.server_name,
        episode.link_m3u8,
        episode.link_embed
      );
    get diagnostics deleted = row_count;

  elsif selected_phase = 'episodes' then
    select
      coalesce(array_agg(scan.movie_id), array[]::uuid[]),
      count(*)::integer,
      (array_agg(scan.movie_id order by scan.movie_id desc))[1]
    into target_movie_uuids, scanned, next_uuid
    from (
      select distinct episode.movie_id
      from public.episodes episode
      where episode.movie_id is not null
        and (selected_uuid is null or episode.movie_id > selected_uuid)
        and public.is_retired_playback_source(
          '', episode.server_name, episode.link_m3u8, episode.link_embed
        )
      order by episode.movie_id
      limit bounded_limit
    ) scan;

    delete from public.episodes episode
    where episode.movie_id = any(target_movie_uuids)
      and public.is_retired_playback_source(
        '', episode.server_name, episode.link_m3u8, episode.link_embed
      );
    get diagnostics deleted = row_count;
  end if;

  reached_end := scanned < bounded_limit;

  update private.ophim_cleanup_state state
  set cursor_uuid = case
        when selected_phase in ('streams', 'movie_episodes', 'episodes') then next_uuid
        else state.cursor_uuid
      end,
      cursor_bigint = case
        when selected_phase = 'player_error_events' then next_bigint
        else state.cursor_bigint
      end,
      scanned_rows = state.scanned_rows + scanned,
      deleted_rows = state.deleted_rows + deleted,
      updated_at = now()
  where state.phase = selected_phase;

  if reached_end then
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
    'groups_scanned', scanned,
    'deleted', deleted,
    'reached_end', reached_end,
    'remaining_after_pass', remaining
  );
end;
$$;

revoke all on function private.cleanup_retired_ophim_transport_batch(integer)
  from public, anon, authenticated;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'cleanup-retired-ophim-transport'),
  schedule := '30 seconds',
  command := 'select private.cleanup_retired_ophim_transport_batch(5);',
  active := true
);

comment on function private.cleanup_retired_ophim_transport_batch(integer) is
  'Deletes retired OPhim transport by small movie groups so statement triggers reconcile only a bounded number of movies per transaction. Keeps canonical movie rows and metadata.';

commit;
