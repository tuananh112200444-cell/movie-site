update public.streams
set
  is_active = false,
  health_status = 'failed',
  failure_count = greatest(coalesce(failure_count, 0), 3),
  last_error = 'Production telemetry: embed iframe load timed out or failed'
where movie_id = (select id from public.movies where slug = 'moana-2026' limit 1)
  and source = 'onlyflix';

update public.movies
set
  episode_current = 'Trailer',
  episode_total = '0',
  current_episode = 0,
  total_episodes = 0,
  status = 'trailer',
  last_synced_at = now()
where slug = 'moana-2026';

update public.movie_api_cache
set expires_at = '2000-01-01T00:00:00Z'
where slug = 'moana-2026';
