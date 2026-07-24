-- The queue migration replaced inline SEO work, but three older triggers used
-- different names and therefore survived. Remove them explicitly so episode
-- ingestion has exactly one lightweight path into movie_refresh_queue.

drop trigger if exists movies_refresh_seo_quality on public.movies;
drop trigger if exists movie_episodes_refresh_seo_quality on public.movie_episodes;
drop trigger if exists episodes_refresh_seo_quality on public.episodes;

revoke all on function public.trigger_refresh_movie_seo_quality_from_movie()
  from public, anon, authenticated;
revoke all on function public.trigger_refresh_movie_seo_quality_from_episode()
  from public, anon, authenticated;

comment on function public.enqueue_movie_refresh_after_episode_change() is
  'The only lifecycle/SEO trigger path for episode writes; performs queue-only deduplication.';
comment on function public.enqueue_movie_refresh_after_movie_change() is
  'The only lifecycle/SEO trigger path for movie writes; performs queue-only deduplication.';
