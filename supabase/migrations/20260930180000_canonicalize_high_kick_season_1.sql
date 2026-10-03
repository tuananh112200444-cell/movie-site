begin;

-- The canonical row is backed by a complete 166-episode KKPhim HLS set.
-- Keeping the retired OPhim label caused client search to prefer the separate
-- VSMOV slug and prefetch the wrong identity before the edge redirect ran.
update public.movies
set
  source_site = 'phimapi',
  source_name = 'KKPhim · Lồng Tiếng',
  episode_current = 'Hoàn Tất (166/166)',
  episode_total = '166',
  current_episode = 166,
  total_episodes = 166,
  is_published = true,
  seo_catalog_status = 'published',
  updated_at = now()
where slug = 'gia-dinh-la-so-1-phan-1';

update public.movies duplicate
set
  is_published = false,
  seo_catalog_status = 'superseded',
  superseded_by_movie_id = canonical.id,
  updated_at = now()
from public.movies canonical
where duplicate.slug = 'gia-dinh-la-so-mot-phan-1'
  and canonical.slug = 'gia-dinh-la-so-1-phan-1';

commit;
