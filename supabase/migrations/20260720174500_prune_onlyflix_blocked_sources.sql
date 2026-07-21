update public.streams
set is_active = false,
    health_status = 'blocked',
    last_error = 'Pruned by OnlyFlix source quality gate'
where source = 'onlyflix'
  and server_name !~* '(vidapi\.xyz|moviesapi)';

delete from public.movie_episodes
where source = 'onlyflix'
  and server_name !~* '(vidapi\.xyz|moviesapi)';

delete from public.movie_api_cache
where slug in (select slug from public.movies where source_site = 'onlyflix');
