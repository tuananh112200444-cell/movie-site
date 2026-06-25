begin;

with target as (
  select id, slug
  from public.movies
  where slug in (
    'when-oranges-fall',
    'blvietsub-6814013180402644821-cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot'
  )
),
ranked as (
  select
    me.id,
    row_number() over (
      partition by me.movie_id, me.episode_number, coalesce(nullif(trim(me.link_embed), ''), nullif(trim(me.link_m3u8), ''))
      order by
        case
          when me.server_name in ('SV 1', 'SV 2') then 0
          else 1
        end,
        me.server_name,
        me.id
    ) as rn
  from public.movie_episodes me
  join target t on t.id = me.movie_id
  where
    me.source = 'blvietsub'
    and me.episode_number = 7
    and coalesce(nullif(trim(me.link_embed), ''), nullif(trim(me.link_m3u8), '')) is not null
)
delete from public.movie_episodes me
using ranked r
where me.id = r.id and r.rn > 1;

delete from public.movie_api_cache
where slug in (
  'when-oranges-fall',
  'blvietsub-6814013180402644821-cam-o-nha-ho-nhung-cu-roi-sang-nha-minh-suot'
);

commit;

