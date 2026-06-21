with movie_episode_stats as (
  select
    movie_id,
    max(episode_number) filter (where coalesce(source, '') <> 'hidden') as max_movie_episode,
    count(distinct episode_number) filter (where coalesce(source, '') <> 'hidden') as distinct_movie_episodes
  from public.movie_episodes
  group by movie_id
),
episode_stats as (
  select
    movie_id,
    max(episode_number) as max_episode_table,
    count(distinct episode_number) as distinct_episode_rows
  from public.episodes
  group by movie_id
),
stream_stats as (
  select
    movie_id,
    max(coalesce(nullif(substring(coalesce(episode_slug, '') from '([0-9]+)$'), '')::int, 0)) as max_stream_episode,
    count(distinct episode_slug) filter (where is_active = true) as distinct_active_streams
  from public.streams
  where is_active = true
  group by movie_id
),
stats as (
  select
    m.id,
    m.slug,
    m.name,
    m.source_site,
    m.source_name,
    m.episode_current,
    coalesce(m.current_episode, 0) as current_episode,
    coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0) as episode_current_number,
    greatest(
      coalesce(me.max_movie_episode, 0),
      coalesce(ep.max_episode_table, 0),
      coalesce(st.max_stream_episode, 0)
    ) as playable_max_episode,
    coalesce(me.distinct_movie_episodes, 0) as distinct_movie_episodes,
    coalesce(ep.distinct_episode_rows, 0) as distinct_episode_rows,
    coalesce(st.distinct_active_streams, 0) as distinct_active_streams,
    m.updated_at
  from public.movies m
  left join movie_episode_stats me on me.movie_id = m.id
  left join episode_stats ep on ep.movie_id = m.id
  left join stream_stats st on st.movie_id = m.id
  where m.is_published = true
)
select
  count(*) as total_published,
  count(*) filter (
    where greatest(current_episode, episode_current_number) > playable_max_episode
      and playable_max_episode > 0
  ) as card_higher_than_local_playable,
  count(*) filter (
    where playable_max_episode > greatest(current_episode, episode_current_number)
  ) as card_lower_than_local_playable,
  count(*) filter (
    where lower(coalesce(source_site, '') || ' ' || coalesce(source_name, '')) like '%blvietsub%'
      and greatest(current_episode, episode_current_number) > playable_max_episode
      and playable_max_episode > 0
  ) as blvietsub_card_higher_than_local_playable
from stats;

with movie_episode_stats as (
  select movie_id, max(episode_number) filter (where coalesce(source, '') <> 'hidden') as max_movie_episode
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
),
stats as (
  select
    m.slug,
    m.name,
    m.source_site,
    m.source_name,
    m.episode_current,
    coalesce(m.current_episode, 0) as current_episode,
    coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0) as episode_current_number,
    greatest(
      coalesce(me.max_movie_episode, 0),
      coalesce(ep.max_episode_table, 0),
      coalesce(st.max_stream_episode, 0)
    ) as playable_max_episode,
    m.updated_at
  from public.movies m
  left join movie_episode_stats me on me.movie_id = m.id
  left join episode_stats ep on ep.movie_id = m.id
  left join stream_stats st on st.movie_id = m.id
  where m.is_published = true
)
select
  slug,
  name,
  source_site,
  source_name,
  episode_current,
  greatest(current_episode, episode_current_number) as card_episode,
  playable_max_episode,
  updated_at
from stats
where greatest(current_episode, episode_current_number) > playable_max_episode
  and playable_max_episode > 0
order by greatest(current_episode, episode_current_number) - playable_max_episode desc, updated_at desc nulls last
limit 30;
