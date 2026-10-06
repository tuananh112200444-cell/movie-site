begin;

do $$
declare
  target_movie_id uuid;
  r2_hls_url text := 'https://khophim.org/hls/ph%C3%AD%20ph%C3%B4ng/%E8%A1%80%E9%AD%94%20Ph%C3%AD%20Ph%C3%B4ng%20Qu%E1%BB%B7%20M%C3%A1u%20R%E1%BB%ABng%20Thi%C3%AAng.2026.HD1080P.%E5%AE%98%E6%96%B9%E8%B6%8A%E5%8D%97%E8%AF%AD%E4%B8%AD%E5%AD%97.m3u8';
begin
  select id
  into target_movie_id
  from public.movies
  where slug = 'phi-phong-quy-mau-rung-thieng'
  limit 1;

  if target_movie_id is null then
    raise exception 'Phí Phông movie row was not found';
  end if;

  update public.streams
  set
    is_active = false,
    updated_at = now()
  where movie_id = target_movie_id
    and source is distinct from 'khophim-r2';

  insert into public.episodes (
    movie_id,
    server_name,
    server_data,
    episode_slug,
    ophim_id,
    episode_number,
    link_m3u8,
    link_embed,
    episode_name,
    subtitle_url,
    created_at
  ) values (
    target_movie_id,
    'KhoPhim R2 · Bản đẹp',
    jsonb_build_object(
      'name', 'Full',
      'slug', 'full',
      'filename', 'Phí Phông Bản Đẹp: Quỷ Máu Rừng Thiêng - FHD - Vietsub',
      'link_m3u8', r2_hls_url,
      'link_embed', '',
      'subtitle_url', '',
      'audio_type', 'vietsub',
      'source_provider', 'khophim-r2'
    ),
    'full',
    '',
    1,
    r2_hls_url,
    '',
    'Full',
    '',
    now()
  )
  on conflict (movie_id, server_name, episode_slug)
  do update set
    server_data = excluded.server_data,
    episode_number = excluded.episode_number,
    link_m3u8 = excluded.link_m3u8,
    link_embed = excluded.link_embed,
    episode_name = excluded.episode_name,
    subtitle_url = excluded.subtitle_url;

  insert into public.streams (
    movie_id,
    episode_slug,
    source,
    server_name,
    stream_url,
    embed_url,
    subtitle_url,
    quality,
    priority,
    is_active,
    health_status,
    last_checked_at,
    last_success_at,
    response_time_ms,
    failure_count,
    last_error,
    audio_type,
    provider_key,
    playback_score,
    playback_score_version,
    created_at,
    updated_at
  ) values (
    target_movie_id,
    'full',
    'khophim-r2',
    'KhoPhim R2 · Bản đẹp',
    r2_hls_url,
    '',
    '',
    'FHD',
    100,
    true,
    'healthy',
    now(),
    now(),
    0,
    0,
    '',
    'vietsub',
    'khophim-r2',
    1000,
    2,
    now(),
    now()
  )
  on conflict (movie_id, episode_slug, source, server_name)
  do update set
    stream_url = excluded.stream_url,
    embed_url = excluded.embed_url,
    subtitle_url = excluded.subtitle_url,
    quality = excluded.quality,
    priority = excluded.priority,
    is_active = excluded.is_active,
    health_status = excluded.health_status,
    last_checked_at = excluded.last_checked_at,
    last_success_at = excluded.last_success_at,
    response_time_ms = excluded.response_time_ms,
    failure_count = excluded.failure_count,
    last_error = excluded.last_error,
    audio_type = excluded.audio_type,
    provider_key = excluded.provider_key,
    playback_score = excluded.playback_score,
    playback_score_version = excluded.playback_score_version,
    updated_at = now();

  update public.movies
  set
    episode_current = 'Full',
    current_episode = 1,
    quality = 'FHD',
    updated_at = now()
  where id = target_movie_id;

  delete from public.movie_api_cache
  where slug = 'phi-phong-quy-mau-rung-thieng';
end $$;

commit;
