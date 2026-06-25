with playable as (
  select movie_id, max(ep_num) as max_playable_episode
  from (
    select
      movie_id,
      episode_number::int as ep_num
    from public.movie_episodes
    where source is distinct from 'hidden'
      and coalesce(link_m3u8, link_embed, '') <> ''
      and episode_number is not null

    union all

    select
      movie_id,
      episode_number::int as ep_num
    from public.episodes
    where coalesce(link_m3u8, link_embed, '') <> ''
      and episode_number is not null

    union all

    select
      movie_id,
      case
        when nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '') ~ '^\d{1,5}$'
          then nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '')::int
        else null
      end as ep_num
    from public.streams
    where is_active is distinct from false
      and coalesce(stream_url, embed_url, '') <> ''
      and nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '') ~ '^\d{1,5}$'
  ) rows
  where ep_num > 0
  group by movie_id
),
advertised as (
  select
    m.id,
    m.slug,
    greatest(
      coalesce(m.current_episode, 0),
      coalesce(
        case
          when nullif(regexp_replace(coalesce(m.episode_current, ''), '\D', '', 'g'), '') ~ '^\d{1,5}$'
            then nullif(regexp_replace(coalesce(m.episode_current, ''), '\D', '', 'g'), '')::int
          else null
        end,
        0
      )
    ) as advertised_episode,
    p.max_playable_episode
  from public.movies m
  join playable p on p.movie_id = m.id
  where m.is_published = true
),
fixed as (
  update public.movies m
  set
    current_episode = a.max_playable_episode,
    episode_current = 'Tập ' || a.max_playable_episode::text
  from advertised a
  where m.id = a.id
    and a.max_playable_episode > 0
    and a.advertised_episode > a.max_playable_episode
  returning m.slug, a.advertised_episode as old_episode, a.max_playable_episode as new_episode
)
select * from fixed order by old_episode desc, slug;
