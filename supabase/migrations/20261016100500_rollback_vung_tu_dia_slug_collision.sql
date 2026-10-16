-- Roll back the attempted 2026 Hope playback repair. The existing
-- `vung-tu-dia` canonical row is Into the Badlands (2015), so attaching the
-- 2026 Hope stream to that identity is unsafe.

do $rollback$
declare
  target_movie_id uuid;
  target_url text := 'https://a.kvp726.com/20261013/FotQCUTw/index.m3u8';
begin
  select id into target_movie_id
  from public.movies
  where slug = 'vung-tu-dia'
    and year = 2015
    and lower(coalesce(origin_name, '')) = lower('Into The Badlands')
  limit 1;

  if target_movie_id is null then
    raise exception 'Into the Badlands canonical row not found';
  end if;

  delete from public.streams
  where movie_id = target_movie_id
    and episode_slug = 'full'
    and stream_url = target_url
    and provider_key = 'kkphim';

  delete from public.episodes
  where movie_id = target_movie_id
    and episode_slug = 'full'
    and link_m3u8 = target_url;

  perform set_config('app.movie_refresh_processing', '1', true);
  update public.movies
  set is_published = false,
      seo_catalog_status = 'awaiting_playback',
      current_episode = 0,
      episode_current = 'Đang cập nhật',
      updated_at = now()
  where id = target_movie_id;

  delete from public.movie_api_cache where slug = 'vung-tu-dia';
  update public.home_page_cache
  set expires_at = now()
  where id in ('homepage_v3', 'search_index_v4_rows');
end;
$rollback$;
