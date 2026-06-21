with bl_movies as (
  select
    id,
    slug,
    name,
    episode_current,
    greatest(
      coalesce(current_episode, 0),
      coalesce(total_episodes, 0),
      coalesce((regexp_match(coalesce(episode_current, ''), '\d+'))[1]::int, 0)
    ) as expected_episode
  from movies
  where is_published = true
    and (
      source_site ilike '%blvietsub%'
      or source_name ilike '%blvietsub%'
      or showtimes ilike '%blvietsub.com%'
      or source_url ilike '%blvietsub.com%'
    )
),
episode_stats as (
  select
    movie_id,
    count(*) filter (
      where coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is not null
    ) as playable_rows,
    count(distinct episode_number) filter (
      where coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is not null
    ) as playable_episodes,
    max(episode_number) filter (
      where coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is not null
    ) as max_playable_episode
  from movie_episodes
  where source = 'blvietsub'
  group by movie_id
)
select
  count(*) filter (where coalesce(es.playable_rows, 0) = 0)::int as movies_without_any_playable,
  count(*) filter (where bm.expected_episode > 0 and coalesce(es.max_playable_episode, 0) < bm.expected_episode)::int as movies_max_playable_lower_than_expected,
  count(*)::int as checked_movies
from bl_movies bm
left join episode_stats es on es.movie_id = bm.id;

with bl_movies as (
  select
    id,
    slug,
    name,
    episode_current,
    greatest(
      coalesce(current_episode, 0),
      coalesce(total_episodes, 0),
      coalesce((regexp_match(coalesce(episode_current, ''), '\d+'))[1]::int, 0)
    ) as expected_episode
  from movies
  where is_published = true
    and (
      source_site ilike '%blvietsub%'
      or source_name ilike '%blvietsub%'
      or showtimes ilike '%blvietsub.com%'
      or source_url ilike '%blvietsub.com%'
    )
),
episode_stats as (
  select
    movie_id,
    count(*) filter (
      where coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is not null
    ) as playable_rows,
    count(distinct episode_number) filter (
      where coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is not null
    ) as playable_episodes,
    max(episode_number) filter (
      where coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is not null
    ) as max_playable_episode
  from movie_episodes
  where source = 'blvietsub'
  group by movie_id
)
select
  bm.slug,
  bm.name,
  bm.episode_current,
  bm.expected_episode,
  coalesce(es.playable_episodes, 0) as playable_episodes,
  coalesce(es.max_playable_episode, 0) as max_playable_episode,
  coalesce(es.playable_rows, 0) as playable_rows
from bl_movies bm
left join episode_stats es on es.movie_id = bm.id
where coalesce(es.playable_rows, 0) = 0
   or (bm.expected_episode > 0 and coalesce(es.max_playable_episode, 0) < bm.expected_episode)
order by bm.expected_episode desc, bm.name
limit 30;
