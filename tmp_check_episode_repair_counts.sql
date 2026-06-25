with target_movies as (
  select id, slug, name, origin_name, current_episode, episode_current, total_episodes, updated_at
  from public.movies
  where slug in (
    'dai-chua-te-3d',
    'thien-nam-tin-nu',
    'nam-nao-cung-co-ngay-nay',
    'gio-thoang-tinh-theo',
    'the-air'
  )
     or lower(name) like '%gio thoang%'
     or lower(origin_name) like '%the air%'
)
select
  tm.slug,
  tm.id,
  tm.name,
  tm.origin_name,
  tm.current_episode,
  tm.episode_current,
  tm.total_episodes,
  count(distinct me.id) as movie_episodes_rows,
  max(me.episode_number) filter (where coalesce(me.link_m3u8, me.link_embed, '') <> '') as max_movie_episode,
  count(distinct e.id) as episodes_rows,
  max(e.episode_number) filter (where coalesce(e.link_m3u8, e.link_embed, '') <> '') as max_episode,
  count(distinct s.id) filter (where s.is_active is distinct from false) as streams_rows,
  max(nullif(regexp_replace(coalesce(s.episode_slug, ''), '\D', '', 'g'), '')::int) filter (
    where s.is_active is distinct from false
      and coalesce(s.stream_url, s.embed_url, '') <> ''
      and nullif(regexp_replace(coalesce(s.episode_slug, ''), '\D', '', 'g'), '') is not null
  ) as max_stream_episode
from target_movies tm
left join public.movie_episodes me on me.movie_id = tm.id
left join public.episodes e on e.movie_id = tm.id
left join public.streams s on s.movie_id = tm.id
group by tm.slug, tm.id, tm.name, tm.origin_name, tm.current_episode, tm.episode_current, tm.total_episodes, tm.updated_at
order by tm.updated_at desc, tm.slug;
