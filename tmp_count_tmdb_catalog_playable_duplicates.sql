with movie_keys as (
  select
    m.*,
    lower(regexp_replace(coalesce(m.name, ''), '[^[:alnum:]]+', '', 'g')) as key_name,
    lower(regexp_replace(coalesce(m.origin_name, ''), '[^[:alnum:]]+', '', 'g')) as key_origin,
    lower(regexp_replace(coalesce(m.title_vi, ''), '[^[:alnum:]]+', '', 'g')) as key_vi,
    lower(regexp_replace(coalesce(m.title_en, ''), '[^[:alnum:]]+', '', 'g')) as key_en
  from public.movies m
),
catalog as (
  select * from movie_keys
  where source_site = 'tmdb-catalog'
    and is_published = true
    and coalesce(current_episode, 0) = 0
    and lower(coalesce(episode_current, '')) in ('sap chieu', 'dang cap nhat', 'trailer')
),
playable as (
  select
    mk.*,
    greatest(
      coalesce(mep.max_ep, 0),
      coalesce(ep.max_ep, 0),
      coalesce(mk.current_episode, 0)
    ) as playable_max_episode
  from movie_keys mk
  left join (
    select movie_id, max(episode_number) as max_ep
    from public.movie_episodes
    group by movie_id
  ) mep on mep.movie_id = mk.id
  left join (
    select movie_id, max(episode_number) as max_ep
    from public.episodes
    group by movie_id
  ) ep on ep.movie_id = mk.id
  where source_site is distinct from 'tmdb-catalog'
),
duplicates as (
  select distinct
    c.id as catalog_id,
    c.slug as catalog_slug,
    c.name as catalog_name,
    p.slug as playable_slug,
    p.name as playable_name,
    p.playable_max_episode
  from catalog c
  join playable p on p.id <> c.id
    and p.playable_max_episode > 0
    and coalesce(p.year, 0) = coalesce(c.year, 0)
    and (
      c.key_name in (p.key_name, p.key_origin, p.key_vi, p.key_en)
      or c.key_origin in (p.key_name, p.key_origin, p.key_vi, p.key_en)
      or c.key_vi in (p.key_name, p.key_origin, p.key_vi, p.key_en)
      or c.key_en in (p.key_name, p.key_origin, p.key_vi, p.key_en)
    )
)
select
  count(*) as remaining_published_catalog_duplicates,
  coalesce(json_agg(duplicates order by catalog_slug) filter (where catalog_id is not null), '[]'::json) as samples
from duplicates;
