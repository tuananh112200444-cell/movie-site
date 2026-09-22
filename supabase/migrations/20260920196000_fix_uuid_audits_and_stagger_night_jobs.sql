-- PostgreSQL has no max(uuid). Use the final row from UUID order instead and
-- stagger the night work so a background audit never competes with viewers.
create or replace function public.seed_movie_playback_audit_queue(p_limit integer default 80)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch_limit integer := greatest(10, least(coalesce(p_limit, 80), 200));
  cursor_uuid uuid;
  next_uuid uuid;
  scanned integer := 0;
  refresh_seeded integer := 0;
begin
  if public.current_viewer_load_profile() <> 'night' then
    return jsonb_build_object('skipped', true, 'reason', 'outside_night_window');
  end if;
  insert into public.maintenance_uuid_cursors(task_key, last_uuid)
  values ('movie-playback-audit-catalog', null) on conflict (task_key) do nothing;
  select last_uuid into cursor_uuid from public.maintenance_uuid_cursors
  where task_key = 'movie-playback-audit-catalog' for update;

  insert into public.movie_playback_audit_queue as queue (movie_id, reason)
  select movie_id, 'refresh_queue_change' from public.movie_refresh_queue
  order by requested_at desc limit least(20, batch_limit)
  on conflict (movie_id) do update set requested_at = now(), next_attempt_at = least(queue.next_attempt_at, now()), reason = excluded.reason, last_error = null;
  get diagnostics refresh_seeded = row_count;

  with batch as materialized (
    select id from public.movies where cursor_uuid is null or id > cursor_uuid order by id limit batch_limit
  ), inserted as (
    insert into public.movie_playback_audit_queue as queue (movie_id, reason)
    select id, 'night_catalog_seek' from batch on conflict (movie_id) do nothing returning movie_id
  )
  select count(*)::integer, (array_agg(id order by id desc))[1] into scanned, next_uuid from batch;

  update public.maintenance_uuid_cursors
  set last_uuid = case when scanned = 0 then null else next_uuid end, updated_at = now()
  where task_key = 'movie-playback-audit-catalog';
  return jsonb_build_object('scanned', scanned, 'last_uuid', next_uuid, 'refresh_seeded', refresh_seeded);
end;
$$;

create or replace function public.scan_episode_identity_mismatches(p_batch_size integer default 80)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch_size integer := greatest(20, least(coalesce(p_batch_size, 80), 160));
  cursor_uuid uuid;
  next_uuid uuid;
  scanned integer := 0;
  detected integer := 0;
begin
  if public.current_viewer_load_profile() <> 'night' then
    return jsonb_build_object('skipped', true, 'reason', 'outside_night_window');
  end if;
  insert into public.maintenance_uuid_cursors(task_key, last_uuid)
  values ('episode-identity-integrity-seek', null) on conflict (task_key) do nothing;
  select last_uuid into cursor_uuid from public.maintenance_uuid_cursors
  where task_key = 'episode-identity-integrity-seek' for update;

  create temporary table identity_scan_movies on commit drop as
  select m.id, m.slug, m.name, m.origin_name, m.title_vi, m.title_en, m.title_original,
         m.year, m.source_site, m.source_name, m.is_published
  from public.movies m where cursor_uuid is null or m.id > cursor_uuid order by m.id limit batch_size;
  get diagnostics scanned = row_count;
  if scanned = 0 then
    update public.maintenance_uuid_cursors set last_uuid = null, updated_at = now()
    where task_key = 'episode-identity-integrity-seek';
    return jsonb_build_object('scanned', 0, 'wrapped', true, 'detected', 0);
  end if;
  create index on identity_scan_movies(id);

  create temporary table structured_foreign_identity on commit drop as
  select movie.id as movie_id, movie.slug, movie.year as movie_year,
    trim(split_part(episode.server_data->>'filename', ' - ', 1)) as foreign_name,
    trim(split_part(episode.server_data->>'filename', ' - ', 2)) as foreign_origin,
    nullif(substring(split_part(episode.server_data->>'filename', ' - ', 3) from '([12][0-9]{3})'), '')::integer as foreign_year,
    count(*)::integer as episode_rows, min(nullif(episode.ophim_id, '')) as foreign_source_id,
    min(episode.server_data->>'filename') as sample_filename
  from identity_scan_movies movie join public.episodes episode on episode.movie_id = movie.id
  where coalesce(episode.server_data->>'filename', '') like '% - % - %'
  group by movie.id, movie.slug, movie.year,
    trim(split_part(episode.server_data->>'filename', ' - ', 1)),
    trim(split_part(episode.server_data->>'filename', ' - ', 2)),
    nullif(substring(split_part(episode.server_data->>'filename', ' - ', 3) from '([12][0-9]{3})'), '')::integer;

  delete from structured_foreign_identity foreign_row using identity_scan_movies movie
  where movie.id = foreign_row.movie_id and (
    foreign_row.foreign_year is null or foreign_row.foreign_name = '' or foreign_row.foreign_origin = ''
    or lower(foreign_row.foreign_name) = any(array[lower(trim(coalesce(movie.name, ''))), lower(trim(coalesce(movie.origin_name, ''))), lower(trim(coalesce(movie.title_vi, ''))), lower(trim(coalesce(movie.title_en, ''))), lower(trim(coalesce(movie.title_original, '')))])
    or lower(foreign_row.foreign_origin) = any(array[lower(trim(coalesce(movie.name, ''))), lower(trim(coalesce(movie.origin_name, ''))), lower(trim(coalesce(movie.title_vi, ''))), lower(trim(coalesce(movie.title_en, ''))), lower(trim(coalesce(movie.title_original, '')))])
  );

  create temporary table detected_identity_issues on commit drop as
  select foreign_row.movie_id, (array_agg(related.id order by related.id::text))[1] as related_movie_id,
    sum(foreign_row.episode_rows)::integer as episode_rows,
    jsonb_agg(jsonb_build_object('foreign_name', foreign_row.foreign_name, 'foreign_origin', foreign_row.foreign_origin,
      'foreign_year', foreign_row.foreign_year, 'foreign_source_id', foreign_row.foreign_source_id,
      'sample_filename', foreign_row.sample_filename, 'episode_rows', foreign_row.episode_rows) order by foreign_row.foreign_name) as signatures
  from structured_foreign_identity foreign_row
  join lateral (
    select other.id from public.movies other
    where other.id <> foreign_row.movie_id and other.year = foreign_row.foreign_year and (
      lower(trim(coalesce(other.name, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
      or lower(trim(coalesce(other.origin_name, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
      or lower(trim(coalesce(other.title_vi, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
      or lower(trim(coalesce(other.title_en, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
      or lower(trim(coalesce(other.title_original, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
    ) order by other.is_published desc, coalesce(other.current_episode, 0) desc, other.id limit 1
  ) related on true group by foreign_row.movie_id;

  insert into public.catalog_integrity_issues as issue (
    issue_key, issue_type, movie_id, related_movie_id, severity, confidence, status,
    evidence, first_detected_at, last_detected_at, resolved_at, attempts, last_error
  )
  select 'episode_identity_mismatch:' || found.movie_id, 'episode_identity_mismatch', found.movie_id, found.related_movie_id,
    5, 1, 'open', jsonb_build_object('episode_rows', found.episode_rows, 'signatures', found.signatures, 'scanner', 'uuid_seek_v1'),
    now(), now(), null, 0, null from detected_identity_issues found
  on conflict (issue_key) do update set related_movie_id = excluded.related_movie_id, severity = excluded.severity,
    confidence = excluded.confidence, status = case when issue.status = 'ignored' then 'ignored' else 'open' end,
    evidence = excluded.evidence, last_detected_at = now(), resolved_at = null,
    attempts = case when issue.status = 'resolved' then 0 else issue.attempts end, last_error = null;
  get diagnostics detected = row_count;

  update public.catalog_integrity_issues issue set status = 'resolved', resolved_at = now(), last_detected_at = now(), last_error = null
  where issue.issue_type = 'episode_identity_mismatch' and issue.movie_id in (select id from identity_scan_movies)
    and issue.status in ('open', 'repairing') and not exists (select 1 from detected_identity_issues found where found.movie_id = issue.movie_id);

  select id into next_uuid from identity_scan_movies order by id desc limit 1;
  update public.maintenance_uuid_cursors set last_uuid = next_uuid, updated_at = now()
  where task_key = 'episode-identity-integrity-seek';
  return jsonb_build_object('scanned', scanned, 'last_uuid', next_uuid, 'detected', detected, 'pagination', 'uuid_seek');
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'seed-playback-audit-night'), schedule := '12 17-22 * * *', active := true);
    perform cron.alter_job((select jobid from cron.job where jobname = 'scan-episode-identity-night-seek'), schedule := '32 17-22 * * *', active := true);
    perform cron.alter_job((select jobid from cron.job where jobname = 'process-playback-audit-night'), schedule := '52 17-22 * * *', active := true);
    perform cron.alter_job((select jobid from cron.job where jobname = 'repair-blvietsub-smart-every-15-minutes'), schedule := '11 1,9,17 * * *', active := true);
  end if;
end $$;
