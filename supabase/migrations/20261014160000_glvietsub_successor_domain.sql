-- Keep existing GLVietsub catalogue identities while moving only stored site links.
-- Playback URLs are deliberately untouched; they are verified separately.
update public.movies
set
  source_url = regexp_replace(source_url, '^https://(www\.)?glvietsub\.net/', 'https://www.glvietsubz.net/', 'i'),
  showtimes = regexp_replace(showtimes, '^https://(www\.)?glvietsub\.net/', 'https://www.glvietsubz.net/', 'i')
where lower(coalesce(source_site, '')) = 'glvietsub'
  and (
    source_url ~* '^https://(www\.)?glvietsub\.net/'
    or showtimes ~* '^https://(www\.)?glvietsub\.net/'
  );
