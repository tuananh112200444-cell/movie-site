begin;

update public.movie_episodes
set
  is_backup = false,
  server_name = 'VSMOV · Vietsub',
  updated_at = now()
where movie_id = 'fbc1045c-df6c-4021-8e61-9c75c8fcc30a'::uuid
  and episode_number = 1;

update public.movies
set
  is_published = true,
  seo_catalog_status = 'published',
  published_at = coalesce(published_at, now()),
  updated_at = now()
where id = 'fbc1045c-df6c-4021-8e61-9c75c8fcc30a'::uuid;

update public.movies
set
  is_published = false,
  seo_catalog_status = 'superseded',
  superseded_by_movie_id = 'fbc1045c-df6c-4021-8e61-9c75c8fcc30a'::uuid,
  updated_at = now()
where id = '8b96fddd-2c1d-4ecb-aaeb-22bca4742c10'::uuid;

commit;

select id, slug, is_published, seo_catalog_status, superseded_by_movie_id
from public.movies
where id in (
  'fbc1045c-df6c-4021-8e61-9c75c8fcc30a'::uuid,
  '8b96fddd-2c1d-4ecb-aaeb-22bca4742c10'::uuid
)
order by slug;
