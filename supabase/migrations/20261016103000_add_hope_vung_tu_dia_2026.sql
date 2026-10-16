-- Create a distinct canonical identity for Hope (2026). The legacy
-- `vung-tu-dia` slug belongs to Into the Badlands (2015) and must not be reused.

do $hope$
declare
  target_movie_id uuid;
  target_url text := 'https://a.kvp726.com/20261013/FotQCUTw/index.m3u8';
  target_embed text := 'https://player.phimapi.com/player/?url=https://a.kvp726.com/20261013/FotQCUTw/index.m3u8';
begin
  insert into public.movies (
    slug, name, origin_name, title_vi, title_en, title_original,
    normalized_name, content, type, status, thumb_url, poster_url,
    hero_backdrop_url, hero_poster_url, quality, lang, time,
    episode_current, episode_total, current_episode, total_episodes,
    year, actor, director, category, country, source_url, source_site,
    source_name, is_published, seo_catalog_status, catalog_source,
    canonical_identity_key, published_at, last_episode_change_at, updated_at
  ) values (
    'hope-vung-tu-dia-2026',
    'Vùng Tử Địa',
    'Hope',
    'Vùng Tử Địa',
    'Hope',
    'Hope',
    'vung tu dia hope',
    'Tại Hope Harbor, một ngôi làng hẻo lánh gần khu vực phi quân sự, cảnh sát trưởng Bum-seok nhận được tin báo về một con hổ. Khi cả làng chìm trong hoảng loạn, ông phát hiện một sự thật ngoài sức tưởng tượng.',
    'single', 'completed',
    'https://phimimg.com/uploads/movies/20260919/hope-vung-tu-dia-thumb.webp',
    'https://phimimg.com/uploads/movies/20260919/hope-vung-tu-dia-poster.webp',
    'https://phimimg.com/uploads/movies/20260919/hope-vung-tu-dia-thumb.webp',
    'https://phimimg.com/uploads/movies/20260919/hope-vung-tu-dia-poster.webp',
    'FHD', 'Vietsub', '157 phút', 'Full', '1', 1, 1, 2026,
    array['Hwang Jung-min','Zo In-sung','Hoyeon','Alicia Vikander'],
    array['Na Hong-jin'],
    '[{"id":"0bcf4077916678de9b48c89221fcf8ae","name":"Khoa Học","slug":"khoa-hoc"},{"id":"68564911f00849030f9c9c144ea1b931","name":"Viễn Tưởng","slug":"vien-tuong"},{"id":"2fb53017b3aca80eaaf1a3b50a182db","name":"Bí Ẩn","slug":"bi-an"},{"id":"9822be111d2ccc29c7172c78b8af8ff5","name":"Hành Động","slug":"hanh-dong"},{"id":"a7b065b92ad356387ef2e075dee66529","name":"Tâm Lý","slug":"tam-ly"},{"id":"66c78b23908113d478d8d85390a244b4","name":"Phiêu Lưu","slug":"phieu-luu"}]'::jsonb,
    '[{"id":"05de95be5fc404da9680bbb3dd8262e6","name":"Hàn Quốc","slug":"han-quoc"}]'::jsonb,
    'https://phimapi.com/phim/vung-tu-dia',
    'phimapi', 'KKPhim', false, 'awaiting_playback', 'kkphim',
    'kkphim:hope:2026', now(), now(), now()
  )
  on conflict (slug) do update set
    name = excluded.name,
    origin_name = excluded.origin_name,
    title_vi = excluded.title_vi,
    title_en = excluded.title_en,
    title_original = excluded.title_original,
    normalized_name = excluded.normalized_name,
    content = excluded.content,
    type = excluded.type,
    status = excluded.status,
    thumb_url = excluded.thumb_url,
    poster_url = excluded.poster_url,
    hero_backdrop_url = excluded.hero_backdrop_url,
    hero_poster_url = excluded.hero_poster_url,
    quality = excluded.quality,
    lang = excluded.lang,
    time = excluded.time,
    episode_current = excluded.episode_current,
    episode_total = excluded.episode_total,
    current_episode = excluded.current_episode,
    total_episodes = excluded.total_episodes,
    year = excluded.year,
    actor = excluded.actor,
    director = excluded.director,
    category = excluded.category,
    country = excluded.country,
    source_url = excluded.source_url,
    source_site = excluded.source_site,
    source_name = excluded.source_name,
    catalog_source = excluded.catalog_source,
    canonical_identity_key = excluded.canonical_identity_key,
    updated_at = now()
  returning id into target_movie_id;

  insert into public.movie_episodes (
    movie_id, episode_number, episode_name, slug, server_name,
    link_m3u8, link_embed, source, is_backup, subtitle_url, audio_type,
    created_at, updated_at
  ) values (
    target_movie_id, 1, 'Full', 'full', 'KKPhim · Vietsub',
    target_url, target_embed, 'phimapi', false, '', 'vietsub', now(), now()
  )
  on conflict (movie_id, server_name, episode_number) do update set
    episode_name = excluded.episode_name,
    slug = excluded.slug,
    link_m3u8 = excluded.link_m3u8,
    link_embed = excluded.link_embed,
    source = excluded.source,
    is_backup = excluded.is_backup,
    subtitle_url = excluded.subtitle_url,
    audio_type = excluded.audio_type,
    updated_at = now();

  update public.streams
  set stream_url = target_url,
      embed_url = target_embed,
      subtitle_url = '',
      source = 'phimapi',
      provider_key = 'kkphim',
      audio_type = 'vietsub',
      priority = 1,
      playback_score = 470,
      is_active = true,
      health_status = 'ok',
      response_time_ms = 254,
      failure_count = 0,
      last_checked_at = now(),
      last_error = '',
      updated_at = now()
  where movie_id = target_movie_id
    and provider_key = 'kkphim'
    and episode_slug = 'full';

  if not found then
    insert into public.streams (
      movie_id, server_name, episode_slug, stream_url, embed_url, subtitle_url,
      source, provider_key, audio_type, priority, playback_score, is_active,
      health_status, response_time_ms, failure_count, last_checked_at, last_error
    ) values (
      target_movie_id, 'KKPhim · Vietsub', 'full', target_url, target_embed, '',
      'phimapi', 'kkphim', 'vietsub', 1, 470, true,
      'ok', 254, 0, now(), ''
    );
  end if;

  perform public.reconcile_movie_release_state(target_movie_id);
  delete from public.movie_api_cache where slug in ('hope-vung-tu-dia-2026', 'vung-tu-dia');
  update public.home_page_cache
  set expires_at = now()
  where id in ('homepage_v3', 'search_index_v4_rows');
end;
$hope$;
