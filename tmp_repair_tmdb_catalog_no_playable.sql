with playable as (
  select movie_id, max(episode_number) as max_episode
  from (
    select movie_id, episode_number
    from public.movie_episodes
    where coalesce(link_m3u8, '') <> '' or coalesce(link_embed, '') <> ''
    union all
    select movie_id, episode_number
    from public.episodes
    where coalesce(link_m3u8, '') <> '' or coalesce(link_embed, '') <> ''
    union all
    select movie_id, null::integer as episode_number
    from public.streams
    where is_active is distinct from false
      and (coalesce(stream_url, '') <> '' or coalesce(embed_url, '') <> '')
  ) rows
  group by movie_id
),
targets as (
  select m.id
  from public.movies m
  left join playable p on p.movie_id = m.id
  where m.is_published = true
    and lower(coalesce(m.source_site, '')) = 'tmdb-catalog'
    and coalesce(p.max_episode, 0) = 0
    and (
      coalesce(m.current_episode, 0) > 0
      or coalesce(m.total_episodes, 0) > 0
      or coalesce(m.episode_current, '') ~* '(tap|tập|full|hoan|hoàn|\d)'
    )
)
update public.movies m
set
  episode_current = case
    when coalesce(m.trailer_url, '') <> '' or coalesce(m.release_at, now()::date)::date > now()::date then 'Sap chieu'
    else 'Dang cap nhat'
  end,
  current_episode = 0,
  total_episodes = 0,
  episode_total = '',
  status = case
    when coalesce(m.trailer_url, '') <> '' or coalesce(m.release_at, now()::date)::date > now()::date then 'trailer'
    else m.status
  end,
  schedule_note = case
    when coalesce(m.trailer_url, '') <> '' or coalesce(m.release_at, now()::date)::date > now()::date
      then 'Phim sap chieu, KhoPhim se cap nhat khi co nguon xem.'
    else 'Phim dang duoc cap nhat.'
  end,
  updated_at = now()
from targets t
where m.id = t.id
returning m.slug, m.name, m.episode_current, m.current_episode, m.total_episodes;
