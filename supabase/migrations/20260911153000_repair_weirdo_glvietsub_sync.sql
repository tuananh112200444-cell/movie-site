-- Repair the split Weirdo 101 identity without discarding any playback source.
-- The GLVietsub row remains canonical because it owns the public catalogue URL;
-- BLVietsub's translated mirrors are copied over before its duplicate is retired.

do $repair_weirdo$
declare
  target_movie public.movies;
  source_movie public.movies;
begin
  select * into target_movie
  from public.movies
  where slug = 'glvietsub-weirdo-101-the-series'
  for update;

  select * into source_movie
  from public.movies
  where slug = 'blvietsub-1764-luc-hap-dan-giua-chung-ta-weirdo-101-2026'
  for update;

  if target_movie.id is null or source_movie.id is null then
    raise exception 'Verified Weirdo source or target movie is missing';
  end if;

  insert into public.movie_episodes (
    movie_id, episode_number, episode_name, slug, server_name, source,
    link_embed, link_m3u8, subtitle_url, thumbnail_url, duration,
    is_backup, audio_type
  )
  select
    target_movie.id, episode_number, episode_name, slug, server_name, source,
    link_embed, link_m3u8, subtitle_url, thumbnail_url, duration,
    true, audio_type
  from public.movie_episodes source_episode
  where source_episode.movie_id = source_movie.id
    and coalesce(source_episode.link_embed, '') <> ''
    and not exists (
      select 1
      from public.movie_episodes target_episode
      where target_episode.movie_id = target_movie.id
        and target_episode.episode_number = source_episode.episode_number
        and target_episode.server_name = source_episode.server_name
        and target_episode.source = source_episode.source
    );

  insert into public.streams (
    movie_id, episode_slug, source, provider_key, server_name,
    stream_url, embed_url, subtitle_url, quality, priority, is_active,
    health_status, response_time_ms, failure_count, last_error, audio_type,
    last_checked_at, last_success_at, updated_at
  )
  select
    target_movie.id, episode_slug, source, provider_key, server_name,
    stream_url, embed_url, subtitle_url, quality, priority, is_active,
    health_status, response_time_ms, failure_count, last_error, audio_type,
    last_checked_at, last_success_at, now()
  from public.streams source_stream
  where source_stream.movie_id = source_movie.id
  on conflict (movie_id, episode_slug, source, server_name) do update set
    provider_key = excluded.provider_key,
    stream_url = excluded.stream_url,
    embed_url = excluded.embed_url,
    subtitle_url = excluded.subtitle_url,
    quality = excluded.quality,
    priority = greatest(public.streams.priority, excluded.priority),
    is_active = excluded.is_active,
    health_status = excluded.health_status,
    response_time_ms = excluded.response_time_ms,
    failure_count = excluded.failure_count,
    last_error = excluded.last_error,
    audio_type = excluded.audio_type,
    last_checked_at = excluded.last_checked_at,
    last_success_at = excluded.last_success_at,
    updated_at = now();

  update public.movies
  set episode_current = 'Tập 4',
      current_episode = greatest(coalesce(current_episode, 0), 4),
      total_episodes = greatest(coalesce(total_episodes, 0), 10),
      episode_total = '10',
      lang = 'Vietsub',
      status = 'ongoing',
      source_url = 'https://www.glvietsubz.net/phim-bo/weirdo-101-the-series',
      showtimes = 'https://www.glvietsubz.net/phim-bo/weirdo-101-the-series',
      updated_at = now(),
      last_synced_at = now()
  where id = target_movie.id;

  insert into public.movie_slug_aliases (
    alias_slug, movie_id, canonical_slug, reason, updated_at
  ) values (
    source_movie.slug,
    target_movie.id,
    target_movie.slug,
    'verified-weirdo-bl-gl-canonical-merge',
    now()
  )
  on conflict (alias_slug) do update set
    movie_id = excluded.movie_id,
    canonical_slug = excluded.canonical_slug,
    reason = excluded.reason,
    updated_at = now();

  update public.provider_movie_identities
  set movie_id = target_movie.id, last_seen_at = now()
  where movie_id = source_movie.id;

  update public.canonical_movie_identities
  set movie_id = target_movie.id, updated_at = now()
  where movie_id = source_movie.id;

  update public.movies
  set is_published = false,
      seo_catalog_status = 'superseded',
      superseded_by_movie_id = target_movie.id,
      source_site = 'merged',
      source_name = 'Merged into ' || target_movie.slug,
      tmdb_id = null,
      imdb_id = '',
      ophim_id = '',
      ophim_slug = null,
      updated_at = now()
  where id = source_movie.id;

  update public.movie_api_cache
  set expires_at = now()
  where slug in (source_movie.slug, target_movie.slug);

  update public.home_page_cache
  set expires_at = now()
  where id in ('homepage_v3', 'search_index_v4_rows');

  perform public.refresh_movie_seo_quality(target_movie.id);
end;
$repair_weirdo$;
