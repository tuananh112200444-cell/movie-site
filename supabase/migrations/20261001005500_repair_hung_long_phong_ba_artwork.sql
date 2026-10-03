-- Replace dead NguonC artwork URLs (all returned HTTP 404) with the verified
-- KKPhim/phimimg artwork pair for every published season.
with artwork(slug, thumb_url, poster_url) as (
  values
    (
      'hung-long-phong-ba-phan-1',
      'https://phimimg.com/upload/vod/20240326-1/b79cdc640456a8ba8068ffa73d5ded89.jpg',
      'https://phimimg.com/upload/vod/20240326-1/d9047c849f5fb53fe278a581636a9afb.jpg'
    ),
    (
      'hung-long-phong-ba-phan-2',
      'https://phimimg.com/upload/vod/20240304-1/c68dc025f5f43230b8d1bad107036e4c.jpg',
      'https://phimimg.com/upload/vod/20240304-1/502aa1fb2315eaaaa9717919d48691b7.jpg'
    ),
    (
      'hung-long-phong-ba-phan-3',
      'https://phimimg.com/upload/vod/20240628-1/f803316aa041a1c8bf523933783ae9ca.jpg',
      'https://phimimg.com/upload/vod/20240628-1/b2340132485416417145a5cc206de3f4.jpg'
    ),
    (
      'hung-long-phong-ba-phan-4',
      'https://phimimg.com/upload/vod/20260214-1/71cec309dd4be81a09e06e470536ae1d.jpg',
      'https://phimimg.com/upload/vod/20260214-1/8bd4eba1068788972aceeae2fa924c28.jpg'
    )
)
update public.movies as movie
set
  thumb_url = artwork.thumb_url,
  poster_url = artwork.poster_url,
  hero_backdrop_url = artwork.thumb_url,
  hero_poster_url = artwork.poster_url
from artwork
where movie.slug = artwork.slug
  and movie.is_published is true
  and movie.superseded_by_movie_id is null;

do $$
declare
  repaired_count integer;
begin
  select count(*) into repaired_count
  from public.movies
  where slug in (
    'hung-long-phong-ba-phan-1',
    'hung-long-phong-ba-phan-2',
    'hung-long-phong-ba-phan-3',
    'hung-long-phong-ba-phan-4'
  )
    and is_published is true
    and superseded_by_movie_id is null
    and thumb_url like 'https://phimimg.com/%'
    and poster_url like 'https://phimimg.com/%';

  if repaired_count <> 4 then
    raise exception 'Expected 4 repaired Hùng Long Phong Bá seasons, found %', repaired_count;
  end if;
end;
$$;
