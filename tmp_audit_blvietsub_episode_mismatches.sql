with episode_stats as (
  select
    movie_id,
    max(episode_number) filter (where coalesce(source, '') <> 'hidden') as max_episode,
    count(*) filter (where coalesce(source, '') <> 'hidden') as episode_rows,
    count(distinct episode_number) filter (where coalesce(source, '') <> 'hidden') as distinct_episodes
  from public.movie_episodes
  group by movie_id
),
target_movies as (
  select
    m.id,
    m.slug,
    m.name,
    m.origin_name,
    m.source_site,
    m.source_name,
    m.source_url,
    m.showtimes,
    m.episode_current,
    m.episode_total,
    m.current_episode,
    m.total_episodes,
    m.updated_at,
    m.last_synced_at,
    coalesce(es.max_episode, 0) as max_episode,
    coalesce(es.episode_rows, 0) as episode_rows,
    coalesce(es.distinct_episodes, 0) as distinct_episodes
  from public.movies m
  left join episode_stats es on es.movie_id = m.id
  where m.is_published = true
    and coalesce(m.source_site, '') <> 'merged'
    and (
      coalesce(m.source_site, '') ilike '%blvietsub%'
      or coalesce(m.source_name, '') ilike '%blvietsub%'
      or coalesce(m.source_site, '') ilike '%admin-queer%'
      or coalesce(m.source_url, '') ilike '%blvietsub%'
      or coalesce(m.showtimes, '') ilike '%blvietsub%'
    )
)
select *
from target_movies
where
  max_episode > greatest(coalesce(current_episode, 0), coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::int, 0))
  or max_episode > coalesce(total_episodes, 0)
  or (
    max_episode > 0
    and nullif(trim(coalesce(episode_total, '')), '') is not null
    and coalesce(nullif(substring(coalesce(episode_total, '') from '([0-9]+)'), '')::int, 0) < max_episode
  )
  or source_url ilike '%blvietsub.top%'
  or showtimes ilike '%blvietsub.top%'
order by
  (max_episode - greatest(coalesce(current_episode, 0), coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::int, 0))) desc,
  updated_at desc nulls last
limit 200;
