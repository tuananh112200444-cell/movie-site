-- Denied Love was split between a two-special OPhim shell and the complete
-- 10-episode canonical record. Retire the incomplete shell without moving its
-- confirmed-dead playback URLs, and preserve its public slug as an alias.

do $$
declare
  source_id uuid := '17f31734-716c-4d25-b139-ce4cefe72750';
  target_id uuid := 'fe23a728-5920-4782-8bb6-546f1c3c6294';
  source_slug text := 'denied-love';
  target_slug text := 'khi-hanh-phuc-bi-choi-tu';
begin
  if not exists (select 1 from public.movies where id = source_id and slug = source_slug)
     or not exists (select 1 from public.movies where id = target_id and slug = target_slug) then
    raise exception 'Denied Love canonical identities no longer match the audited records';
  end if;

  insert into public.movie_slug_aliases(alias_slug, movie_id, canonical_slug, reason, updated_at)
  values(source_slug, target_id, target_slug, 'verified-title-year-completeness-merge', now())
  on conflict(alias_slug) do update
  set movie_id = excluded.movie_id,
      canonical_slug = excluded.canonical_slug,
      reason = excluded.reason,
      updated_at = now();

  update public.streams
  set is_active = false,
      health_status = 'dead',
      failure_count = greatest(coalesce(failure_count, 0), 2),
      last_error = 'Retired incomplete duplicate; canonical slug: ' || target_slug,
      last_checked_at = now(),
      updated_at = now()
  where movie_id = source_id;

  update public.movies
  set is_published = false,
      source_site = 'merged',
      source_name = 'Merged into ' || target_slug,
      tmdb_id = null,
      imdb_id = '',
      ophim_id = '',
      ophim_slug = null,
      updated_at = now()
  where id = source_id;

  update public.movies
  set title_en = case when nullif(trim(coalesce(title_en, '')), '') is null then 'Denied Love' else title_en end,
      total_episodes = greatest(coalesce(total_episodes, 0), 10),
      current_episode = greatest(coalesce(current_episode, 0), 10),
      updated_at = now()
  where id = target_id;

  delete from public.movie_api_cache where slug in (source_slug, target_slug);
  delete from public.home_page_cache where id <> '__never__';

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
      'source_episode_count', 2,
      'target_episode_count', 10,
      'moved_dead_sources', 0,
      'alias_preserved', true
    )
  );
end;
$$;
