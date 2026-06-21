with cherm_targets as (
  select id
  from public.movies
  where coalesce(source_site, '') <> 'merged'
    and (
      lower(replace(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, ''), ' ', '')) like '%chermchey%'
      or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%cherm chey%'
    )
),
cherm_episode_values(episode_number, server_name, link_embed) as (
  values
    (1, 'SV 1', 'https://blvietsub.com/xem-phim/chermchey/tap-01-sv-1'),
    (1, 'SV 2', 'https://blvietsub.com/xem-phim/chermchey/tap-01-sv-2'),
    (2, 'SV 1', 'https://blvietsub.com/xem-phim/chermchey/tap-02-sv-1'),
    (2, 'SV 2', 'https://blvietsub.com/xem-phim/chermchey/tap-02-sv-2'),
    (3, 'SV 1', 'https://blvietsub.com/xem-phim/chermchey/tap-03-sv-1'),
    (3, 'SV 2', 'https://blvietsub.com/xem-phim/chermchey/tap-03-sv-2'),
    (4, 'SV 1', 'https://blvietsub.com/xem-phim/chermchey/tap-04-sv-1'),
    (4, 'SV 2', 'https://blvietsub.com/xem-phim/chermchey/tap-04-sv-2'),
    (5, 'SV 1', 'https://blvietsub.com/xem-phim/chermchey/tap-05-sv-1'),
    (5, 'SV 2', 'https://blvietsub.com/xem-phim/chermchey/tap-05-sv-2'),
    (6, 'SV 1', 'https://blvietsub.com/xem-phim/chermchey/tap-06-sv-1'),
    (6, 'SV 2', 'https://blvietsub.com/xem-phim/chermchey/tap-06-sv-2')
),
insert_cherm as (
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
  from cherm_targets t
  cross join cherm_episode_values e
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
update_cherm as (
  update public.movies m
  set
    episode_current = 'Tập 6',
    current_episode = 6,
    total_episodes = greatest(coalesce(m.total_episodes, 0), 6),
    episode_total = case when nullif(trim(coalesce(m.episode_total, '')), '') is null then '6' else m.episode_total end,
    source_url = case when coalesce(m.source_site, '') = 'blvietsub' then 'https://blvietsub.com/phim/chermchey/' else m.source_url end,
    showtimes = case when coalesce(m.source_site, '') = 'blvietsub' then 'https://blvietsub.com/phim/chermchey/' else m.showtimes end,
    last_synced_at = now(),
    updated_at = now()
  where m.id in (select id from cherm_targets)
  returning id
),
moo_targets as (
  select id
  from public.movies
  where coalesce(source_site, '') <> 'merged'
    and (
      lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%crazy%moo%'
      or lower(coalesce(name, '') || ' ' || coalesce(origin_name, '') || ' ' || coalesce(slug, '')) like '%anh%fu%moo%'
    )
),
moo_episode_values(episode_number, server_name, link_embed) as (
  values
    (1, 'SV 1', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-01-sv-1'),
    (1, 'SV 2', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-01-sv-2'),
    (2, 'SV 1', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-02-sv-1'),
    (2, 'SV 2', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-02-sv-2'),
    (3, 'SV 1', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-03-sv-1'),
    (3, 'SV 2', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-03-sv-2'),
    (4, 'SV 1', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-04-sv-1'),
    (4, 'SV 2', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-04-sv-2'),
    (5, 'SV 1', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-05-sv-1'),
    (5, 'SV 2', 'https://blvietsub.com/xem-phim/anh-fu-thich-em-moo/tap-05-sv-2')
),
insert_moo as (
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
  from moo_targets t
  cross join moo_episode_values e
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
update_moo as (
  update public.movies m
  set
    episode_current = 'Tập 5',
    current_episode = 5,
    total_episodes = greatest(coalesce(m.total_episodes, 0), 5),
    episode_total = case when nullif(trim(coalesce(m.episode_total, '')), '') is null then '5' else m.episode_total end,
    source_url = case when coalesce(m.source_site, '') = 'blvietsub' then 'https://blvietsub.com/phim/anh-fu-thich-em-moo/' else m.source_url end,
    showtimes = case when coalesce(m.source_site, '') = 'blvietsub' then 'https://blvietsub.com/phim/anh-fu-thich-em-moo/' else m.showtimes end,
    last_synced_at = now(),
    updated_at = now()
  where m.id in (select id from moo_targets)
  returning id
)
select
  (select count(*) from cherm_targets) as cherm_movies,
  (select count(*) from insert_cherm) as cherm_episode_rows_inserted,
  (select count(*) from update_cherm) as cherm_movies_updated,
  (select count(*) from moo_targets) as moo_movies,
  (select count(*) from insert_moo) as moo_episode_rows_inserted,
  (select count(*) from update_moo) as moo_movies_updated;
