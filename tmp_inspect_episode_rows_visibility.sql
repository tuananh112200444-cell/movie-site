select
  m.slug,
  'movie_episodes' as table_name,
  me.episode_number::text as episode,
  me.server_name,
  me.source,
  length(coalesce(me.link_m3u8, '')) as m3u8_len,
  length(coalesce(me.link_embed, '')) as embed_len
from public.movies m
join public.movie_episodes me on me.movie_id = m.id
where m.slug in ('pho-son-hai', 'trang-trai-clarkson-phan-1', 'mac-ly', 'co-nang-dau-bep-cua-toi')

union all

select
  m.slug,
  'episodes' as table_name,
  e.episode_number::text as episode,
  e.server_name,
  null as source,
  length(coalesce(e.link_m3u8, '')) as m3u8_len,
  length(coalesce(e.link_embed, '')) as embed_len
from public.movies m
join public.episodes e on e.movie_id = m.id
where m.slug in ('pho-son-hai', 'trang-trai-clarkson-phan-1', 'mac-ly', 'co-nang-dau-bep-cua-toi')

union all

select
  m.slug,
  'streams' as table_name,
  s.episode_slug as episode,
  s.server_name,
  s.source,
  length(coalesce(s.stream_url, '')) as m3u8_len,
  length(coalesce(s.embed_url, '')) as embed_len
from public.movies m
join public.streams s on s.movie_id = m.id
where m.slug in ('pho-son-hai', 'trang-trai-clarkson-phan-1', 'mac-ly', 'co-nang-dau-bep-cua-toi')
  and s.is_active is distinct from false
order by slug, table_name, episode;
