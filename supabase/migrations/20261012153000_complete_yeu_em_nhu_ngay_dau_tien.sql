begin;

do $$
declare
  target_movie_id uuid;
begin
  select id
  into target_movie_id
  from public.movies
  where slug = 'yeu-em-nhu-ngay-dau-tien'
  limit 1;

  if target_movie_id is null then
    raise exception 'Yêu Em Như Ngày Đầu Tiên movie row was not found';
  end if;

  update public.movies
  set
    status = 'completed',
    episode_current = 'Hoàn Tất (12/12)',
    episode_total = '12',
    current_episode = 12,
    total_episodes = 12,
    last_episode_change_at = now(),
    updated_at = now()
  where id = target_movie_id;

  insert into public.movie_episodes (
    movie_id,
    episode_number,
    episode_name,
    slug,
    server_name,
    link_m3u8,
    link_embed,
    thumbnail_url,
    duration,
    source,
    is_backup,
    subtitle_url,
    audio_type,
    created_at,
    updated_at
  ) values
    (
      target_movie_id,
      10,
      'Tập 10',
      'tap-10',
      'Vietsub',
      'https://v7.kkphimplayer7.com/20260824/jdHyvFC0/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260824/jdHyvFC0/index.m3u8',
      '',
      '',
      'phimapi',
      false,
      '',
      'vietsub',
      now(),
      now()
    ),
    (
      target_movie_id,
      11,
      'Tập 11',
      'tap-11',
      'Vietsub',
      'https://v7.kkphimplayer7.com/20260827/Djms9mJ8/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260827/Djms9mJ8/index.m3u8',
      '',
      '',
      'phimapi',
      false,
      '',
      'vietsub',
      now(),
      now()
    ),
    (
      target_movie_id,
      12,
      'Tập 12',
      'tap-12',
      'Vietsub',
      'https://v7.kkphimplayer7.com/20260827/DdnymJz0/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260827/DdnymJz0/index.m3u8',
      '',
      '',
      'phimapi',
      false,
      '',
      'vietsub',
      now(),
      now()
    )
  on conflict (movie_id, server_name, episode_number)
  do update set
    episode_name = excluded.episode_name,
    slug = excluded.slug,
    link_m3u8 = excluded.link_m3u8,
    link_embed = excluded.link_embed,
    source = excluded.source,
    is_backup = excluded.is_backup,
    audio_type = excluded.audio_type,
    updated_at = now();

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
  ) values
    (
      target_movie_id,
      'Vietsub',
      jsonb_build_object(
        'name', 'Tập 10',
        'slug', 'tap-10',
        'filename', 'Yêu Em Như Ngày Đầu Tiên - Loving You Like The First Day - 2026 - 1080p - Vietsub - Tập 10',
        'link_m3u8', 'https://v7.kkphimplayer7.com/20260824/jdHyvFC0/index.m3u8',
        'link_embed', 'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260824/jdHyvFC0/index.m3u8'
      ),
      'tap-10',
      '',
      10,
      'https://v7.kkphimplayer7.com/20260824/jdHyvFC0/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260824/jdHyvFC0/index.m3u8',
      'Tập 10',
      '',
      now()
    ),
    (
      target_movie_id,
      'Vietsub',
      jsonb_build_object(
        'name', 'Tập 11',
        'slug', 'tap-11',
        'filename', 'Yêu Em Như Ngày Đầu Tiên - Loving You Like The First Day - 2026 - 1080p - Vietsub - Tập 11',
        'link_m3u8', 'https://v7.kkphimplayer7.com/20260827/Djms9mJ8/index.m3u8',
        'link_embed', 'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260827/Djms9mJ8/index.m3u8'
      ),
      'tap-11',
      '',
      11,
      'https://v7.kkphimplayer7.com/20260827/Djms9mJ8/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260827/Djms9mJ8/index.m3u8',
      'Tập 11',
      '',
      now()
    ),
    (
      target_movie_id,
      'Vietsub',
      jsonb_build_object(
        'name', 'Tập 12',
        'slug', 'tap-12',
        'filename', 'Yêu Em Như Ngày Đầu Tiên - Loving You Like The First Day - 2026 - 1080p - Vietsub - Tập 12',
        'link_m3u8', 'https://v7.kkphimplayer7.com/20260827/DdnymJz0/index.m3u8',
        'link_embed', 'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260827/DdnymJz0/index.m3u8'
      ),
      'tap-12',
      '',
      12,
      'https://v7.kkphimplayer7.com/20260827/DdnymJz0/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260827/DdnymJz0/index.m3u8',
      'Tập 12',
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
  ) values
    (
      target_movie_id,
      'tap-10',
      'phimapi',
      'Vietsub',
      'https://v7.kkphimplayer7.com/20260824/jdHyvFC0/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260824/jdHyvFC0/index.m3u8',
      '',
      'FHD',
      145,
      true,
      'ok',
      now(),
      now(),
      150,
      0,
      '',
      'vietsub',
      'kkphim',
      650,
      2,
      now(),
      now()
    ),
    (
      target_movie_id,
      'tap-11',
      'phimapi',
      'Vietsub',
      'https://v7.kkphimplayer7.com/20260827/Djms9mJ8/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260827/Djms9mJ8/index.m3u8',
      '',
      'FHD',
      145,
      true,
      'ok',
      now(),
      now(),
      150,
      0,
      '',
      'vietsub',
      'kkphim',
      650,
      2,
      now(),
      now()
    ),
    (
      target_movie_id,
      'tap-12',
      'phimapi',
      'Vietsub',
      'https://v7.kkphimplayer7.com/20260827/DdnymJz0/index.m3u8',
      'https://player.phimapi.com/player/?url=https://v7.kkphimplayer7.com/20260827/DdnymJz0/index.m3u8',
      '',
      'FHD',
      145,
      true,
      'ok',
      now(),
      now(),
      150,
      0,
      '',
      'vietsub',
      'kkphim',
      650,
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

  delete from public.movie_api_cache
  where slug = 'yeu-em-nhu-ngay-dau-tien';
end $$;

commit;
