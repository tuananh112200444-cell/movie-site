-- Restore the verified KKPhim Full source for the canonical Vùng Tử Địa row.
-- The public provider manifest and its media segment were verified before this
-- migration. Publication is still delegated to reconcile_movie_release_state.

do $repair$
declare
  target_movie_id uuid;
  target_url text := 'https://a.kvp726.com/20261013/FotQCUTw/index.m3u8';
  target_embed text := 'https://player.phimapi.com/player/?url=https://a.kvp726.com/20261013/FotQCUTw/index.m3u8';
begin
  select id into target_movie_id
  from public.movies
  where slug = 'vung-tu-dia'
    and superseded_by_movie_id is null
  limit 1;

  if target_movie_id is null then
    raise exception 'Canonical Vùng Tử Địa row not found';
  end if;

  update public.episodes
  set episode_number = 1,
      episode_name = 'Full',
      link_m3u8 = target_url,
      link_embed = target_embed,
      subtitle_url = '',
      server_data = jsonb_build_object(
        'name', 'Full',
        'slug', 'full',
        'episode_number', 1,
        'link_m3u8', target_url,
        'link_embed', target_embed,
        'audio_type', 'vietsub',
        'source_provider', 'kkphim'
      )
  where movie_id = target_movie_id
    and lower(server_name) = lower('KKPhim - Vietsub')
    and episode_slug = 'full';

  if not found then
    insert into public.episodes (
      movie_id, server_name, episode_number, episode_name, episode_slug,
      link_m3u8, link_embed, subtitle_url, server_data
    ) values (
      target_movie_id, 'KKPhim - Vietsub', 1, 'Full', 'full',
      target_url, target_embed, '',
      jsonb_build_object(
        'name', 'Full',
        'slug', 'full',
        'episode_number', 1,
        'link_m3u8', target_url,
        'link_embed', target_embed,
        'audio_type', 'vietsub',
        'source_provider', 'kkphim'
      )
    );
  end if;

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
      target_movie_id, 'KKPhim - Vietsub', 'full', target_url, target_embed, '',
      'phimapi', 'kkphim', 'vietsub', 1, 470, true,
      'ok', 254, 0, now(), ''
    );
  end if;

  perform public.reconcile_movie_release_state(target_movie_id);
  delete from public.movie_api_cache where slug = 'vung-tu-dia';
  update public.home_page_cache
  set expires_at = now()
  where id in ('homepage_v3', 'search_index_v4_rows');
end;
$repair$;
