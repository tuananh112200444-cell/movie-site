-- Keep GLVietsub fresh without reintroducing broad peak-hour scans:
-- 1. a four-title homepage lane catches newly localized releases all day;
-- 2. known RAW rows are revisited four at a time every ten minutes;
-- 3. the audited split record for 4 Elements: The Fire is consolidated while
--    its old Motchill URL remains a working alias.

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'sync-glvietsub-recent-every-15-minutes';

  perform cron.schedule(
    'sync-glvietsub-recent-every-15-minutes',
    '7,22,37,52 * * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-glvietsub-feed?limit=4&recent=1',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 120000
      );
    $cmd$
  );

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'upgrade-glvietsub-raw-every-15-minutes',
    'upgrade-glvietsub-raw-every-10-minutes'
  );

  perform cron.schedule(
    'upgrade-glvietsub-raw-every-10-minutes',
    '2,12,22,32,42,52 * * * *',
    $cmd$select public.dispatch_glvietsub_raw_upgrades(4);$cmd$
  );
end;
$scheduler$;

do $merge$
declare
  source_id constant uuid := '2a2543ee-9007-4227-bb0d-f43061f00dbd';
  target_id constant uuid := '785f004f-d7c3-4b33-8ea5-bab72828c2dd';
  source_slug constant text := 'motchill-4-elements-the-fire';
  target_slug constant text := 'glvietsub-4-elements-the-fire';
  retired_slug constant text := 'merged-motchill-4-elements-the-fire-2a2543ee';
begin
  if not exists (
    select 1 from public.movies
    where id = source_id and slug in (source_slug, retired_slug)
  ) or not exists (
    select 1 from public.movies
    where id = target_id and slug = target_slug
      and lower(coalesce(source_site, '')) = 'glvietsub'
      and current_episode >= 6
  ) then
    raise exception '4 Elements canonical identities or verified GL coverage changed';
  end if;

  -- The server names are provider-qualified and do not collide with the GL
  -- rows. Mark the moved rows as audited backups so the queer-source trust
  -- filter can expose them without treating arbitrary title matches as safe.
  update public.movie_episodes
  set movie_id = target_id,
      source = 'verified-motchill',
      is_backup = true,
      updated_at = now()
  where movie_id = source_id;

  update public.streams
  set movie_id = target_id,
      source = 'verified-motchill',
      priority = least(coalesce(priority, 28), 28),
      updated_at = now()
  where movie_id = source_id;

  insert into public.movie_slug_aliases(alias_slug, movie_id, canonical_slug, reason, updated_at)
  values(source_slug, target_id, target_slug, 'verified-glvietsub-completeness-merge', now())
  on conflict(alias_slug) do update
  set movie_id = excluded.movie_id,
      canonical_slug = excluded.canonical_slug,
      reason = excluded.reason,
      updated_at = now();

  update public.movies
  set slug = retired_slug,
      is_published = false,
      seo_catalog_status = 'superseded',
      source_site = 'merged',
      source_name = 'Merged into ' || target_slug,
      source_url = '',
      showtimes = '',
      tmdb_id = null,
      imdb_id = '',
      ophim_id = '',
      ophim_slug = null,
      updated_at = now()
  where id = source_id and slug = source_slug;

  update public.movies
  set year = 2026,
      current_episode = greatest(coalesce(current_episode, 0), 6),
      episode_current = 'Tập ' || greatest(coalesce(current_episode, 0), 6),
      total_episodes = greatest(coalesce(total_episodes, 0), 8),
      episode_total = greatest(coalesce(total_episodes, 0), 8)::text,
      is_published = true,
      seo_catalog_status = 'published',
      updated_at = now()
  where id = target_id;

  delete from public.movie_api_cache
  where slug in (source_slug, target_slug, retired_slug);

  update public.home_page_cache
  set expires_at = now()
  where id in ('homepage_v3', 'search_index_v4_rows');

  insert into public.movie_merge_audit(
    target_movie_id, target_slug, source_movie_ids, source_slugs, reason, summary
  )
  select
    target_id,
    target_slug,
    array[source_id],
    array[source_slug],
    'verified-glvietsub-completeness-merge',
    jsonb_build_object(
      'target_localized_episode', 6,
      'source_localized_episode', 2,
      'moved_movie_episodes', 6,
      'moved_streams', 6,
      'alias_preserved', true
    )
  where not exists (
    select 1 from public.movie_merge_audit audit
    where audit.target_movie_id = target_id
      and audit.reason = 'verified-glvietsub-completeness-merge'
      and source_id = any(audit.source_movie_ids)
  );
end;
$merge$;

comment on function public.dispatch_glvietsub_raw_upgrades(integer) is
  'Bounded GLVietsub freshness lane; cron dispatches up to four known RAW-to-localized candidates every ten minutes.';
