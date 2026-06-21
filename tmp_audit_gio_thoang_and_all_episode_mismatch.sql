with movie_episode_stats as (
  select
    movie_id,
    max(episode_number) filter (where coalesce(source, '') <> 'hidden') as max_movie_episode,
    count(*) filter (where coalesce(source, '') <> 'hidden') as movie_episode_rows,
    count(distinct episode_number) filter (where coalesce(source, '') <> 'hidden') as distinct_movie_episodes
  from public.movie_episodes
  group by movie_id
),
episode_stats as (
  select
    movie_id,
    max(episode_number) as max_episode_table,
    count(*) as episode_rows,
    count(distinct episode_number) as distinct_episode_rows
  from public.episodes
  group by movie_id
),
stream_stats as (
  select
    movie_id,
    max(coalesce(nullif(substring(coalesce(episode_slug, '') from '([0-9]+)$'), '')::int, 0)) as max_stream_episode,
    count(*) filter (where is_active = true) as active_stream_rows,
    count(distinct episode_slug) filter (where is_active = true) as distinct_active_streams
  from public.streams
  group by movie_id
),
all_stats as (
  select
    m.id,
    m.slug,
    m.name,
    m.origin_name,
    m.title_vi,
    m.title_en,
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
    coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0) as episode_current_number,
    coalesce(me.max_movie_episode, 0) as max_movie_episode,
    coalesce(me.movie_episode_rows, 0) as movie_episode_rows,
    coalesce(me.distinct_movie_episodes, 0) as distinct_movie_episodes,
    coalesce(ep.max_episode_table, 0) as max_episode_table,
    coalesce(ep.episode_rows, 0) as episode_rows,
    coalesce(ep.distinct_episode_rows, 0) as distinct_episode_rows,
    coalesce(st.max_stream_episode, 0) as max_stream_episode,
    coalesce(st.active_stream_rows, 0) as active_stream_rows,
    coalesce(st.distinct_active_streams, 0) as distinct_active_streams,
    greatest(
      coalesce(me.max_movie_episode, 0),
      coalesce(ep.max_episode_table, 0),
      coalesce(st.max_stream_episode, 0)
    ) as playable_max_episode
  from public.movies m
  left join movie_episode_stats me on me.movie_id = m.id
  left join episode_stats ep on ep.movie_id = m.id
  left join stream_stats st on st.movie_id = m.id
  where m.is_published = true
)
select *
from all_stats
where
  lower(
    coalesce(name, '') || ' ' ||
    coalesce(origin_name, '') || ' ' ||
    coalesce(title_vi, '') || ' ' ||
    coalesce(title_en, '') || ' ' ||
    coalesce(slug, '')
  ) like any (array[
    '%gio thoang%',
    '%gió thoảng%',
    '%tinh theo%',
    '%tình theo%',
    '%gio%tinh%',
    '%gió%tình%'
  ])
order by updated_at desc nulls last;

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
all_stats as (
  select
    m.id,
    m.slug,
    m.name,
    m.origin_name,
    m.source_site,
    m.source_name,
    m.episode_current,
    m.current_episode,
    m.total_episodes,
    m.source_url,
    m.showtimes,
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
    and coalesce(m.source_site, '') <> 'merged'
)
select *
from all_stats
where greatest(coalesce(current_episode, 0), episode_current_number) > playable_max_episode
  and playable_max_episode > 0
order by
  greatest(coalesce(current_episode, 0), episode_current_number) - playable_max_episode desc,
  updated_at desc nulls last
limit 200;
