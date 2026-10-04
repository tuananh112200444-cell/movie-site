update public.movies
set
  poster_url = 'https://blvietsub.com/wp-content/uploads/2026/07/lay-chong-nha-giau-2026-1-201x300.png',
  thumb_url = 'https://blvietsub.com/wp-content/uploads/2026/07/lay-chong-nha-giau-2026-1-201x300.png',
  updated_at = now()
where slug = 'blvietsub-blvietsub-1578-lay-chong-nha-giau'
  and is_published is true
  and length(trim(coalesce(poster_url, ''))) = 0
  and length(trim(coalesce(thumb_url, ''))) = 0;
