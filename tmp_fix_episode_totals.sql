update public.movies
set
  episode_total = '6',
  total_episodes = greatest(coalesce(total_episodes, 0), 6),
  updated_at = now()
where coalesce(source_site, '') <> 'merged'
  and (
    lower(replace(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, ''), ' ', '')) like '%chermchey%'
    or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%cherm chey%'
  )
  and coalesce(current_episode, 0) >= 6;

update public.movies
set
  episode_total = '5',
  total_episodes = greatest(coalesce(total_episodes, 0), 5),
  updated_at = now()
where coalesce(source_site, '') <> 'merged'
  and (
    lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%crazy%moo%'
    or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%anh%fu%moo%'
  )
  and coalesce(current_episode, 0) >= 5;

select
  slug,
  name,
  episode_current,
  episode_total,
  current_episode,
  total_episodes
from public.movies
where coalesce(source_site, '') <> 'merged'
  and (
    lower(replace(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, ''), ' ', '')) like '%chermchey%'
    or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%cherm chey%'
    or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%crazy%moo%'
    or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%anh%fu%moo%'
  )
order by name, slug;
