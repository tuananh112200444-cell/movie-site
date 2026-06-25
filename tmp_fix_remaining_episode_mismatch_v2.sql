with playable as (
  select movie_id, max(ep_num) as max_playable_episode
  from (
    select movie_id, episode_number::int as ep_num
    from public.movie_episodes
    where lower(coalesce(source, '')) <> 'hidden'
      and (nullif(trim(coalesce(link_m3u8, '')), '') is not null or nullif(trim(coalesce(link_embed, '')), '') is not null)
      and episode_number is not null

    union all

    select movie_id, episode_number::int as ep_num
    from public.episodes
    where (nullif(trim(coalesce(link_m3u8, '')), '') is not null or nullif(trim(coalesce(link_embed, '')), '') is not null)
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
      and (nullif(trim(coalesce(stream_url, '')), '') is not null or nullif(trim(coalesce(embed_url, '')), '') is not null)
      and nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '') ~ '^\d{1,5}$'
  ) rows
  where ep_num > 0
  group by movie_id
),
fixed as (
  update public.movies m
  set
    current_episode = p.max_playable_episode,
    episode_current = 'Tập ' || p.max_playable_episode::text
  from playable p
  where p.movie_id = m.id
    and m.slug in ('trang-trai-clarkson-phan-1', 'pho-son-hai')
  returning m.slug, m.current_episode, m.episode_current, p.max_playable_episode
)
select * from fixed order by slug;
