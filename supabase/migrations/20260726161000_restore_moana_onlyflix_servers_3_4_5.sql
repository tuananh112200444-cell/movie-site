-- Restore only the three provider embeds after the KhoPhim player gained the
-- provider-specific Referer and iframe capability policy they require.
update public.streams
set
  is_active = true,
  health_status = 'unchecked',
  failure_count = 0,
  last_error = ''
where movie_id = (select id from public.movies where slug = 'moana-2026' limit 1)
  and source = 'onlyflix'
  and embed_url ~* '(vidfast\.(pro|vc)|moviesapi\.to)';

insert into public.streams (
  movie_id,
  server_name,
  episode_slug,
  stream_url,
  embed_url,
  source,
  quality,
  priority,
  is_active,
  health_status,
  failure_count,
  last_error,
  audio_type
)
select
  id,
  'OnlyFlix Server 4 · EN',
  'full',
  '',
  'https://multiembed.mov/?video_id=tt27419466',
  'onlyflix',
  'HD',
  10,
  true,
  'unchecked',
  0,
  '',
  null
from public.movies
where slug = 'moana-2026'
  and not exists (
    select 1
    from public.streams
    where movie_id = public.movies.id
      and source = 'onlyflix'
      and embed_url ~* 'multiembed\.mov'
  );

update public.streams
set
  is_active = true,
  health_status = 'unchecked',
  failure_count = 0,
  last_error = ''
where movie_id = (select id from public.movies where slug = 'moana-2026' limit 1)
  and source = 'onlyflix'
  and embed_url ~* 'multiembed\.mov';

update public.movie_api_cache
set expires_at = now()
where slug = 'moana-2026';
