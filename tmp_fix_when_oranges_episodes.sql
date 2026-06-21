with targets as (
  select id
  from public.movies
  where coalesce(source_site, '') <> 'merged'
    and (
      slug = 'when-oranges-fall'
      or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(showtimes, '') || ' ' || coalesce(source_url, '')) like '%cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot%'
      or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%when%oranges%fall%'
    )
),
episode_values(episode_number, server_name, link_embed) as (
  values
    (1, 'SV 1', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-01-sv-1'),
    (1, 'SV 2', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-01-sv-2'),
    (2, 'SV 1', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-02-sv-1'),
    (2, 'SV 2', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-02-sv-2'),
    (3, 'SV 1', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-03-sv-1'),
    (3, 'SV 2', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-03-sv-2'),
    (4, 'SV 1', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-04-sv-1'),
    (4, 'SV 2', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-04-sv-2'),
    (5, 'SV 1', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-05-sv-1'),
    (5, 'SV 2', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-05-sv-2'),
    (6, 'SV 1', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-06-sv-1'),
    (6, 'SV 2', 'https://blvietsub.com/xem-phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/tap-06-sv-2')
),
inserted as (
  insert into public.movie_episodes (
    movie_id, episode_number, episode_name, slug, server_name, link_m3u8, link_embed,
    subtitle_url, thumbnail_url, duration, source, is_backup, updated_at
  )
  select
    t.id,
    e.episode_number,
    'Tập ' || e.episode_number,
    'tap-' || e.episode_number,
    e.server_name,
    '',
    e.link_embed,
    '',
    '',
    '',
    'blvietsub',
    false,
    now()
  from targets t
  cross join episode_values e
  where not exists (
    select 1
    from public.movie_episodes me
    where me.movie_id = t.id
      and me.episode_number = e.episode_number
      and trim(coalesce(me.server_name, '')) = e.server_name
      and coalesce(me.source, '') = 'blvietsub'
  )
  returning movie_id
),
updated as (
  update public.movies m
  set
    episode_current = 'Tập 6',
    current_episode = 6,
    episode_total = '6',
    total_episodes = greatest(coalesce(m.total_episodes, 0), 6),
    showtimes = 'https://blvietsub.com/phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/',
    source_url = case when coalesce(m.source_site, '') = 'blvietsub' then 'https://blvietsub.com/phim/cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot/' else m.source_url end,
    last_synced_at = now(),
    updated_at = now()
  where m.id in (select id from targets)
  returning id
)
select
  (select count(*) from targets) as target_movies,
  (select count(*) from inserted) as episode_rows_inserted,
  (select count(*) from updated) as movies_updated;
