select
  id,
  slug,
  name,
  origin_name,
  source_site,
  source_name,
  source_url,
  ophim_id,
  ophim_slug,
  episode_current,
  episode_total,
  current_episode,
  total_episodes,
  last_synced_at,
  updated_at
from public.movies
where slug = 'gio-thoang-tinh-theo'
   or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '')) like '%gió thoảng%'
   or lower(coalesce(slug, '')) like '%gio-thoang-tinh%';

select
  episode_number,
  episode_name,
  slug,
  server_name,
  source,
  is_backup,
  left(coalesce(link_m3u8, ''), 120) as m3u8,
  left(coalesce(link_embed, ''), 120) as embed,
  updated_at
from public.movie_episodes
where movie_id = '22a8873e-b27b-43ae-8853-743e807b7550'
order by episode_number, server_name, source;

select
  episode_number,
  episode_name,
  episode_slug,
  left(coalesce(link_m3u8, ''), 120) as m3u8,
  left(coalesce(link_embed, ''), 120) as embed
from public.episodes
where movie_id = '22a8873e-b27b-43ae-8853-743e807b7550'
order by episode_number, episode_name;

select
  episode_slug,
  source,
  server_name,
  is_active,
  left(coalesce(stream_url, ''), 120) as stream_url,
  left(coalesce(embed_url, ''), 120) as embed_url,
  updated_at
from public.streams
where movie_id = '22a8873e-b27b-43ae-8853-743e807b7550'
order by episode_slug, source, server_name;
