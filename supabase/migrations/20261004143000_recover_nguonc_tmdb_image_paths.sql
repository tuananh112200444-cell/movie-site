-- NguonC Film artwork stores the original TMDB image path as its filename.
-- Preserve that exact opaque path and move only the host/size to TMDB's CDN.
-- Named Post/* files and non-hash filenames are intentionally excluded.

update public.movies
set
  poster_url = case
    when poster_url ~ '^https://phim\.nguonc\.com/public/images/Film/[A-Za-z0-9]{20,40}\.jpg$'
      then regexp_replace(
        poster_url,
        '^https://phim\.nguonc\.com/public/images/Film/',
        'https://image.tmdb.org/t/p/w500/'
      )
    else poster_url
  end,
  thumb_url = case
    when thumb_url ~ '^https://phim\.nguonc\.com/public/images/Film/[A-Za-z0-9]{20,40}\.jpg$'
      then regexp_replace(
        thumb_url,
        '^https://phim\.nguonc\.com/public/images/Film/',
        'https://image.tmdb.org/t/p/w780/'
      )
    else thumb_url
  end,
  updated_at = now()
where is_published is true
  and superseded_by_movie_id is null
  and (
    poster_url ~ '^https://phim\.nguonc\.com/public/images/Film/[A-Za-z0-9]{20,40}\.jpg$'
    or thumb_url ~ '^https://phim\.nguonc\.com/public/images/Film/[A-Za-z0-9]{20,40}\.jpg$'
  );
