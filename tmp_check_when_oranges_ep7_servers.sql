with target as (
  select id, slug, name
  from public.movies
  where slug in (
    'when-oranges-fall',
    'blvietsub-6814013180402644821-cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot'
  )
)
select
  t.slug as movie_slug,
  t.name as movie_name,
  me.id,
  me.episode_number,
  me.server_name,
  me.source,
  me.link_embed,
  me.link_m3u8,
  me.updated_at
from target t
join public.movie_episodes me on me.movie_id = t.id
where me.episode_number = 7
order by t.slug, me.server_name;

