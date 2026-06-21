with repaired as (
  update public.movies
  set
    source_url = showtimes,
    updated_at = now()
  where is_published = true
    and coalesce(source_site, '') <> 'merged'
    and showtimes ilike 'https://blvietsub.com/phim/%'
    and (
      source_url is null
      or source_url = ''
      or source_url ilike '%blvietsub.top%'
    )
  returning id
)
select count(*) as repaired_source_urls
from repaired;
