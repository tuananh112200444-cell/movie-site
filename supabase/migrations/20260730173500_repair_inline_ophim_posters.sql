-- OPhim occasionally returned an inline base64 poster while still providing a
-- normal thumbnail filename. Keep the lightweight thumbnail and prevent those
-- large inline payloads from reaching list/home responses.
update public.movies
set
  poster_url = thumb_url,
  updated_at = now()
where is_published = true
  and coalesce(poster_url, '') ~* '^data:'
  and nullif(trim(coalesce(thumb_url, '')), '') is not null
  and coalesce(thumb_url, '') !~* '^(data:|javascript:|about:|null$|undefined$)';
