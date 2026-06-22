with movie_episode_stats as (
  select
    movie_id,
    max(episode_number) filter (where coalesce(source, '') <> 'hidden') as max_movie_episode
  from public.movie_episodes
  group by movie_id
),
episode_stats as (
  select movie_id, max(episode_number) as max_episode_table
  from public.episodes
  group by movie_id
),
stream_stats as (
  select
    movie_id,
    max(coalesce(nullif(substring(coalesce(episode_slug, '') from '([0-9]+)$'), '')::int, 0)) as max_stream_episode
  from public.streams
  where is_active = true
  group by movie_id
)
select
  m.slug,
  m.name,
  m.origin_name,
  m.episode_current,
  m.current_episode,
  greatest(
    coalesce(m.current_episode, 0),
    coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0)
  ) as card_episode,
  greatest(
    coalesce(me.max_movie_episode, 0),
    coalesce(ep.max_episode_table, 0),
    coalesce(st.max_stream_episode, 0)
  ) as local_playable_episode,
  m.source_site,
  m.source_name,
  m.updated_at
from public.movies m
left join movie_episode_stats me on me.movie_id = m.id
left join episode_stats ep on ep.movie_id = m.id
left join stream_stats st on st.movie_id = m.id
where m.slug ilike '%gio-thoang%'
  or m.slug ilike '%the-air%'
  or m.name ilike '%Gió thoảng%'
  or m.origin_name ilike '%the air%'
order by m.updated_at desc
limit 20;
