-- Exact pagination totals can evaluate all eligibility filters from this small
-- index instead of visiting wide movie heap pages for every matching title.
create index concurrently if not exists movies_public_type_year_count_idx
  on public.movies (type, year)
  include (superseded_by_movie_id, seo_catalog_status, episode_current, current_episode, total_episodes)
  where is_published = true;
