with target_movie as (
  select id
  from movies
  where slug = 'blvietsub-1904431244860803611-journey-with-you'
  limit 1
),
new_rows as (
  select
    id as movie_id,
    8 as episode_number,
    'Tập 8' as episode_name,
    'tap-8' as slug,
    'SS' as server_name,
    'https://ssplay.net/v/744320819775263.html' as link_embed,
    '' as link_m3u8,
    'blvietsub' as source
  from target_movie
  union all
  select
    id as movie_id,
    8 as episode_number,
    'Tập 8' as episode_name,
    'tap-8' as slug,
    'SV 1' as server_name,
    'https://abyssplayer.com/2riopYWcJ' as link_embed,
    '' as link_m3u8,
    'blvietsub' as source
  from target_movie
)
insert into movie_episodes (
  movie_id,
  episode_number,
  episode_name,
  slug,
  server_name,
  link_embed,
  link_m3u8,
  source
)
select
  nr.movie_id,
  nr.episode_number,
  nr.episode_name,
  nr.slug,
  nr.server_name,
  nr.link_embed,
  nr.link_m3u8,
  nr.source
from new_rows nr
where not exists (
  select 1
  from movie_episodes me
  where me.movie_id = nr.movie_id
    and me.source = nr.source
    and me.server_name = nr.server_name
    and me.episode_number = nr.episode_number
);

select
  count(*) filter (
    where source = 'blvietsub'
      and episode_number = 8
      and coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is not null
  ) as blvietsub_playable_ep8_rows
from movie_episodes
where movie_id = (
  select id from movies where slug = 'blvietsub-1904431244860803611-journey-with-you' limit 1
);
