do $$
declare
  promoted_count integer := 0;
begin
  if exists (
    select 1 from public.sync_cursors
    where key = 'viewer-telemetry-backlog-promotion-v1'
  ) then
    return;
  end if;

  with recent_events as (
    select
      event.movie_slug,
      lower(trim(event.episode_slug)) as episode_slug,
      lower(regexp_replace(trim(event.source_host), '^www\.', '')) as source_host,
      count(distinct coalesce(event.playback_session_id, event.id::text)) as affected_sessions
    from (
      select id, movie_slug, episode_slug, source_host, playback_session_id
      from public.player_error_events
      where created_at >= now() - interval '24 hours'
        and event_type in (
          'hls_fatal',
          'hls_fatal_retry',
          'stall_fatal',
          'native_hls_error',
          'embed_load_error'
        )
        and coalesce(movie_slug, '') <> ''
        and coalesce(episode_slug, '') <> ''
        and coalesce(source_host, '') <> ''
      order by created_at desc
      limit 50000
    ) event
    group by event.movie_slug, lower(trim(event.episode_slug)), lower(regexp_replace(trim(event.source_host), '^www\.', ''))
    having count(distinct coalesce(event.playback_session_id, event.id::text)) >= 2
  ),
  targets as (
    select stream.id
    from recent_events failure
    join public.movies movie on movie.slug = failure.movie_slug
    join public.streams stream on stream.movie_id = movie.id
    where stream.is_active = true
      and (
        lower(trim(stream.episode_slug)) = failure.episode_slug
        or (
          regexp_replace(stream.episode_slug, '\D', '', 'g') <> ''
          and regexp_replace(stream.episode_slug, '\D', '', 'g') = regexp_replace(failure.episode_slug, '\D', '', 'g')
        )
      )
      and (
        lower(coalesce(substring(stream.stream_url from 'https?://([^/:]+)'), '')) = failure.source_host
        or lower(coalesce(substring(stream.embed_url from 'https?://([^/:]+)'), '')) = failure.source_host
      )
      and coalesce(stream.last_error, '') not like 'Viewer telemetry:%'
    order by stream.updated_at desc
    limit 5000
  )
  update public.streams stream
  set
    priority = greatest(-2, coalesce(stream.priority, 0) - 1),
    last_error = 'Viewer telemetry: existing failure backlog; independent probe required',
    updated_at = now()
  where stream.id in (select target.id from targets target);

  get diagnostics promoted_count = row_count;

  insert into public.sync_cursors (key, page, updated_at)
  values ('viewer-telemetry-backlog-promotion-v1', greatest(promoted_count, 1), now())
  on conflict (key) do update
  set page = excluded.page, updated_at = excluded.updated_at;
end
$$;
