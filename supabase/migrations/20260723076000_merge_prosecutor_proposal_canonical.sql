-- The public OPhim slug stopped at episode 8 while the verified BL/GL record
-- reached episode 10. Preserve the short public URL as an alias to the complete
-- canonical record and prevent the retired shell from reappearing in search.

do $$
declare
  source_id uuid := '0068f88d-3839-494f-af3e-dfe3c2984a00';
  target_id uuid := '573d4826-d8f4-44c4-b49b-79f8d5aee6d3';
  source_slug text := 'loi-de-nghi-cua-cong-to-vien';
  target_slug text := 'blvietsub-6585-loi-de-nghi-cua-cong-to-vien';
  source_year integer;
  target_year integer;
begin
  select year into source_year
  from public.movies
  where id = source_id and slug = source_slug;

  select year into target_year
  from public.movies
  where id = target_id and slug = target_slug;

  if source_year is null or target_year is null or source_year <> target_year
     or not exists (
       select 1
       from public.movies
       where id = target_id
         and current_episode >= 10
         and is_published is true
     ) then
    raise exception 'Prosecutor Proposal canonical identities or verified coverage changed';
  end if;

  insert into public.movie_slug_aliases(alias_slug, movie_id, canonical_slug, reason, updated_at)
  values(source_slug, target_id, target_slug, 'verified-title-year-completeness-merge', now())
  on conflict(alias_slug) do update
  set movie_id = excluded.movie_id,
      canonical_slug = excluded.canonical_slug,
      reason = excluded.reason,
      updated_at = now();

  update public.streams
  set
    is_active = false,
    health_status = 'blocked',
    last_error = 'Retired incomplete duplicate; canonical slug: ' || target_slug,
    last_checked_at = now(),
    updated_at = now()
  where movie_id = source_id;

  update public.movies
  set
    is_published = false,
    seo_catalog_status = 'superseded',
    source_site = 'merged',
    source_name = 'Merged into ' || target_slug,
    tmdb_id = null,
    imdb_id = '',
    ophim_id = '',
    ophim_slug = null,
    updated_at = now()
  where id = source_id;

  update public.movies
  set
    episode_current = 'Tập 10',
    current_episode = 10,
    total_episodes = greatest(coalesce(total_episodes, 0), 10),
    is_published = true,
    seo_catalog_status = 'published',
    updated_at = now()
  where id = target_id;

  delete from public.movie_api_cache
  where slug in (source_slug, target_slug);

  delete from public.home_page_cache
  where id <> '__never__';

  insert into public.movie_merge_audit(
    target_movie_id, target_slug, source_movie_ids, source_slugs, reason, summary
  )
  values(
    target_id,
    target_slug,
    array[source_id],
    array[source_slug],
    'verified-title-year-completeness-merge',
    jsonb_build_object(
      'source_episode_count', 8,
      'target_episode_count', 10,
      'moved_external_sources', 0,
      'alias_preserved', true
    )
  );
end;
$$;
