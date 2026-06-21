select count(*)::int as bad_embed_count
from movie_episodes
where source = 'blvietsub'
  and link_embed ilike '%blvietsub.com%xem-phim%';
