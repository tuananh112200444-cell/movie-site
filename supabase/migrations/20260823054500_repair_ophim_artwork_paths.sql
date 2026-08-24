-- OPhim artwork files live under /uploads/movies/. A previous CDN-base join
-- persisted a subset of absolute URLs at the host root, where they return 404.
-- Restrict the repair to a single root-level filename on the two known OPhim
-- image hosts so valid nested paths and every other provider remain untouched.

update public.movies
set thumb_url = regexp_replace(
  thumb_url,
  '^(https://(img\.ophimimg\.com|img\.ophim\.live))/([^/?#]+)(.*)$',
  '\1/uploads/movies/\3\4',
  'i'
)
where thumb_url ~* '^https://(img\.ophimimg\.com|img\.ophim\.live)/[^/?#]+([?#].*)?$';

update public.movies
set poster_url = regexp_replace(
  poster_url,
  '^(https://(img\.ophimimg\.com|img\.ophim\.live))/([^/?#]+)(.*)$',
  '\1/uploads/movies/\3\4',
  'i'
)
where poster_url ~* '^https://(img\.ophimimg\.com|img\.ophim\.live)/[^/?#]+([?#].*)?$';
