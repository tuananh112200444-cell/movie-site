-- Curated BL/admin movies must not receive OPhim/KKPhim episode rows directly.
-- Preserve the rows for audit, but remove them from player source selection.

update public.streams stream
set
  is_active = false,
  health_status = 'blocked',
  last_error = 'External source isolated from curated BL/admin catalogue',
  updated_at = now()
from public.movies movie
where movie.id = stream.movie_id
  and (
    lower(coalesce(movie.source_site, '')) like '%blvietsub%'
    or lower(coalesce(movie.source_site, '')) like '%admin-queer%'
    or lower(coalesce(movie.source_name, '')) like '%blvietsub%'
    or lower(coalesce(movie.source_name, '')) like '%admin-queer%'
  )
  and lower(coalesce(stream.source, '')) in ('ophim', 'kkphim', 'phimapi')
  and stream.is_active is true;

update public.movie_episodes episode
set
  source = 'hidden',
  link_m3u8 = '',
  link_embed = '',
  updated_at = now()
from public.movies movie
where movie.id = episode.movie_id
  and (
    lower(coalesce(movie.source_site, '')) like '%blvietsub%'
    or lower(coalesce(movie.source_site, '')) like '%admin-queer%'
    or lower(coalesce(movie.source_name, '')) like '%blvietsub%'
    or lower(coalesce(movie.source_name, '')) like '%admin-queer%'
  )
  and lower(coalesce(episode.source, '')) in ('ophim', 'kkphim', 'phimapi');
