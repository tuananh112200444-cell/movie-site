select
  m.slug as movie_slug,
  m.name,
  m.episode_current,
  me.episode_number,
  me.server_name,
  me.link_embed,
  me.link_m3u8
from movie_episodes me
join movies m on m.id = me.movie_id
where me.source = 'blvietsub'
  and coalesce(nullif(trim(me.link_embed), ''), nullif(trim(me.link_m3u8), '')) is null
order by m.name, me.episode_number, me.server_name
limit 50;
