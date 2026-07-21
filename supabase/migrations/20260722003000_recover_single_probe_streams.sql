-- A single transient 404 is not enough evidence to hide every episode from a
-- movie. Clear only affected detail caches and downgrade those one-off rows so
-- the problem queue can verify them again.
delete from public.movie_api_cache c
using public.movies m
where c.slug = m.slug
  and exists (
    select 1 from public.streams s
    where s.movie_id = m.id
      and s.is_active = true
      and s.health_status = 'dead'
      and coalesce(s.failure_count, 0) < 2
  );

update public.streams
set health_status = 'failed',
    updated_at = now()
where is_active = true
  and health_status = 'dead'
  and coalesce(failure_count, 0) < 2;
