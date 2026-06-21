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
    m.source_site,
    m.source_name,
    m.source_url,
    m.showtimes,
    m.episode_current,
    m.episode_total,
    coalesce(m.current_episode, 0) as current_episode,
    coalesce(m.total_episodes, 0) as total_episodes,
    coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0) as episode_current_number,
    coalesce(nullif(substring(coalesce(m.episode_total, '') from '([0-9]+)'), '')::int, 0) as episode_total_number,
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
select
  count(*) as total_checked,
  count(*) filter (where max_episode > greatest(current_episode, episode_current_number)) as card_lower_than_playable,
  count(*) filter (where greatest(current_episode, episode_current_number) > max_episode and max_episode > 0) as card_higher_than_playable,
  count(*) filter (where total_episodes > 0 and max_episode > total_episodes) as total_lower_than_playable,
  count(*) filter (where episode_total_number > 0 and max_episode > episode_total_number) as episode_total_lower_than_playable,
  count(*) filter (where source_url ilike '%blvietsub.top%' or showtimes ilike '%blvietsub.top%') as old_blvietsub_top_urls,
  count(*) filter (where showtimes ilike 'https://blvietsub.com/phim/%' and (source_url is null or source_url = '' or source_url ilike '%blvietsub.top%')) as can_repair_source_url_from_showtimes
from target_movies;

with episode_stats as (
  select
    movie_id,
    max(episode_number) filter (where coalesce(source, '') <> 'hidden') as max_episode,
    count(distinct episode_number) filter (where coalesce(source, '') <> 'hidden') as distinct_episodes
  from public.movie_episodes
  group by movie_id
)
select
  m.slug,
  m.name,
  m.source_site,
  m.source_name,
  m.episode_current,
  m.current_episode,
  m.total_episodes,
  coalesce(es.max_episode, 0) as max_episode,
  coalesce(es.distinct_episodes, 0) as distinct_episodes,
  m.showtimes,
  m.source_url
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
  and greatest(
    coalesce(m.current_episode, 0),
    coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0)
  ) > coalesce(es.max_episode, 0)
  and coalesce(es.max_episode, 0) > 0
order by greatest(
    coalesce(m.current_episode, 0),
    coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0)
  ) - coalesce(es.max_episode, 0) desc,
  m.updated_at desc
limit 80;
