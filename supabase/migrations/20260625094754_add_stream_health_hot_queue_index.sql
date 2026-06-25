create index if not exists idx_streams_movie_health_queue
  on public.streams (movie_id, is_active, last_checked_at nulls first, priority desc)
  where is_active = true;

create index if not exists idx_movies_published_updated
  on public.movies (is_published, updated_at desc)
  where is_published = true;
