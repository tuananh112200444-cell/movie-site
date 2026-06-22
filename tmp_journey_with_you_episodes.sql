select
  m.id as movie_id,
  m.slug,
  m.name,
  m.episode_current,
  m.current_episode,
  m.total_episodes,
  me.id as episode_row_id,
  me.episode_number,
  me.episode_name,
  me.slug as episode_slug,
  me.server_name,
  me.link_embed,
  me.link_m3u8,
  me.source
from movies m
left join movie_episodes me on me.movie_id = m.id
where m.slug = 'blvietsub-1904431244860803611-journey-with-you'
order by me.episode_number, me.server_name;
