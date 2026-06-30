select
  m.id,
  m.slug,
  m.name,
  m.origin_name,
  m.title_vi,
  m.title_en,
  m.year,
  m.type,
  m.status,
  m.episode_current,
  m.current_episode,
  m.total_episodes,
  m.source_site,
  m.source_name,
  m.ophim_slug,
  m.tmdb_id,
  m.is_published,
  m.updated_at,
  coalesce(me.cnt, 0) as movie_episode_rows,
  coalesce(e.cnt, 0) as episode_rows,
  greatest(coalesce(me.max_ep, 0), coalesce(e.max_ep, 0)) as playable_max_episode
from public.movies m
left join (
  select movie_id, count(*) as cnt, max(episode_number) as max_ep
  from public.movie_episodes
  group by movie_id
) me on me.movie_id = m.id
left join (
  select movie_id, count(*) as cnt, max(episode_number) as max_ep
  from public.episodes
  group by movie_id
) e on e.movie_id = m.id
where
  m.name ilike '%in love forever%'
  or m.origin_name ilike '%in love forever%'
  or m.title_vi ilike '%in love forever%'
  or m.title_en ilike '%in love forever%'
  or m.slug ilike '%in-love-forever%'
order by
  coalesce(m.current_episode, 0) desc,
  playable_max_episode desc,
  m.updated_at desc;
