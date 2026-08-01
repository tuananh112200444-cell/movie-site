-- Attach the verified GLVietsub special to the public canonical Season 2 movie.
-- The source row remains authoritative; no guessed or hard-coded video URL is stored here.
insert into public.movie_episodes (
  movie_id,
  episode_number,
  episode_name,
  slug,
  server_name,
  link_m3u8,
  link_embed,
  thumbnail_url,
  duration,
  source,
  is_backup,
  ophim_id,
  subtitle_url,
  audio_type,
  created_at,
  updated_at
)
select
  target.id,
  source_episode.episode_number,
  source_episode.episode_name,
  source_episode.slug,
  source_episode.server_name,
  source_episode.link_m3u8,
  source_episode.link_embed,
  source_episode.thumbnail_url,
  source_episode.duration,
  source_episode.source,
  true,
  source_episode.ophim_id,
  source_episode.subtitle_url,
  source_episode.audio_type,
  now(),
  now()
from public.movies target
join public.movies source_movie
  on source_movie.slug = 'glvietsub-fourever-you-season-2'
join public.movie_episodes source_episode
  on source_episode.movie_id = source_movie.id
 and source_episode.episode_number = -1001
 and lower(trim(source_episode.server_name)) = 'glvietsub 1'
where target.slug = 'fourever-you-phan-2'
  and target.year = source_movie.year
  and nullif(trim(source_episode.link_embed), '') is not null
on conflict (movie_id, server_name, episode_number)
do update set
  episode_name = excluded.episode_name,
  slug = excluded.slug,
  link_m3u8 = excluded.link_m3u8,
  link_embed = excluded.link_embed,
  thumbnail_url = excluded.thumbnail_url,
  duration = excluded.duration,
  source = excluded.source,
  is_backup = excluded.is_backup,
  ophim_id = excluded.ophim_id,
  subtitle_url = excluded.subtitle_url,
  audio_type = excluded.audio_type,
  updated_at = now();
