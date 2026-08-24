-- Adaptive viewer-first capacity profile for KhoPhim Singapore.
-- All wall-clock decisions are made in Vietnam time; pg_cron remains UTC.

create extension if not exists pg_trgm with schema extensions;

-- Filters used by public catalogue pages. The catalogue is small enough to
-- build these once, while avoiding repeated JSONB scans and broad source ILIKE.
create index if not exists movies_category_gin_published_idx
  on public.movies using gin (category jsonb_path_ops)
  where is_published is true;

create index if not exists movies_country_gin_published_idx
  on public.movies using gin (country jsonb_path_ops)
  where is_published is true;

create index if not exists movies_type_updated_published_idx
  on public.movies (type, updated_at desc, id)
  where is_published is true;

create index if not exists movies_year_updated_published_idx
  on public.movies (year desc, updated_at desc, id)
  where is_published is true;

create index if not exists movies_source_site_trgm_published_idx
  on public.movies using gin (source_site extensions.gin_trgm_ops)
  where is_published is true and source_site is not null;

create index if not exists movies_source_name_trgm_published_idx
  on public.movies using gin (source_name extensions.gin_trgm_ops)
  where is_published is true and source_name is not null;

create or replace function public.current_viewer_load_profile()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when (now() at time zone 'Asia/Ho_Chi_Minh')::time >= time '00:15'
     and (now() at time zone 'Asia/Ho_Chi_Minh')::time < time '05:30'
      then 'night'
    when ((now() at time zone 'Asia/Ho_Chi_Minh')::time >= time '10:30'
      and (now() at time zone 'Asia/Ho_Chi_Minh')::time < time '14:30')
      or (now() at time zone 'Asia/Ho_Chi_Minh')::time >= time '17:30'
      then 'peak'
    else 'shoulder'
  end;
$$;

comment on function public.current_viewer_load_profile() is
  'Vietnam viewer profile: night 00:15-05:29, peaks 10:30-14:29 and 17:30-23:59, shoulder otherwise.';

-- Persist deltas from pg_stat_database so the guard detects scan/I/O churn,
-- not only connections. This catches the observed 97% CPU state where the old
-- guard still considered 24 mostly-short connections healthy.
create table if not exists public.runtime_capacity_samples (
  singleton boolean primary key default true check (singleton),
  sampled_at timestamptz not null default now(),
  blks_read bigint not null default 0,
  blks_hit bigint not null default 0,
  temp_bytes bigint not null default 0,
  tup_returned bigint not null default 0,
  xact_count bigint not null default 0
);

alter table public.runtime_capacity_samples enable row level security;
revoke all on table public.runtime_capacity_samples from public, anon, authenticated;
grant select, insert, update on table public.runtime_capacity_samples to service_role;

alter table public.runtime_capacity_state
  add column if not exists healthy_since timestamptz;

insert into public.runtime_capacity_samples (
  singleton, sampled_at, blks_read, blks_hit, temp_bytes, tup_returned, xact_count
)
select true, now(), blks_read, blks_hit, temp_bytes, tup_returned, xact_commit + xact_rollback
from pg_stat_database
where datname = current_database()
on conflict (singleton) do nothing;

create or replace function public.evaluate_runtime_capacity()
returns public.runtime_capacity_state
language plpgsql
security definer
set search_path = public, cron, pg_catalog, pg_temp
as $$
declare
  current_state public.runtime_capacity_state;
  result public.runtime_capacity_state;
  previous_sample public.runtime_capacity_samples;
  current_blks_read bigint := 0;
  current_blks_hit bigint := 0;
  current_temp_bytes bigint := 0;
  current_tup_returned bigint := 0;
  current_xact_count bigint := 0;
  elapsed_seconds numeric := 0;
  delta_blks_read bigint := 0;
  delta_blks_hit bigint := 0;
  delta_temp_bytes bigint := 0;
  delta_tup_returned bigint := 0;
  delta_xact_count bigint := 0;
  total_client_connections integer := 0;
  active_client_queries integer := 0;
  waiting_client_queries integer := 0;
  long_client_queries integer := 0;
  recent_non_success integer := 0;
  recent_slow_batch_runs integer := 0;
  hard_pressure boolean := false;
  scan_pressure boolean := false;
  job_pressure boolean := false;
  next_mode text := 'normal';
  next_pressure integer := 0;
  next_healthy integer := 0;
  next_healthy_since timestamptz;
  load_profile text := public.current_viewer_load_profile();
begin
  select * into current_state
  from public.runtime_capacity_state
  where singleton = true
  for update;

  select * into previous_sample
  from public.runtime_capacity_samples
  where singleton = true
  for update;

  select blks_read, blks_hit, temp_bytes, tup_returned, xact_commit + xact_rollback
  into current_blks_read, current_blks_hit, current_temp_bytes, current_tup_returned, current_xact_count
  from pg_stat_database
  where datname = current_database();

  elapsed_seconds := greatest(1, extract(epoch from now() - previous_sample.sampled_at));
  delta_blks_read := greatest(0, current_blks_read - previous_sample.blks_read);
  delta_blks_hit := greatest(0, current_blks_hit - previous_sample.blks_hit);
  delta_temp_bytes := greatest(0, current_temp_bytes - previous_sample.temp_bytes);
  delta_tup_returned := greatest(0, current_tup_returned - previous_sample.tup_returned);
  delta_xact_count := greatest(0, current_xact_count - previous_sample.xact_count);

  update public.runtime_capacity_samples
  set sampled_at = now(), blks_read = current_blks_read, blks_hit = current_blks_hit,
      temp_bytes = current_temp_bytes, tup_returned = current_tup_returned,
      xact_count = current_xact_count
  where singleton = true;

  select
    count(*) filter (where backend_type = 'client backend'),
    count(*) filter (where backend_type = 'client backend' and state = 'active'),
    count(*) filter (where backend_type = 'client backend' and state = 'active' and wait_event is not null),
    count(*) filter (where backend_type = 'client backend' and state = 'active' and now() - query_start > interval '20 seconds')
  into total_client_connections, active_client_queries, waiting_client_queries, long_client_queries
  from pg_stat_activity
  where datname = current_database();

  select
    count(*) filter (where details.status <> 'succeeded'),
    count(*) filter (where coalesce(details.end_time, now()) - details.start_time > interval '30 seconds')
  into recent_non_success, recent_slow_batch_runs
  from cron.job_run_details details
  join cron.job jobs on jobs.jobid = details.jobid
  join public.runtime_capacity_managed_jobs managed on managed.job_name = jobs.jobname
  where details.start_time >= now() - interval '12 minutes';

  hard_pressure := total_client_connections >= 30
    or active_client_queries >= 5
    or waiting_client_queries >= 2
    or long_client_queries >= 1;

  scan_pressure := elapsed_seconds <= 600 and (
    (delta_blks_read * 120.0 / elapsed_seconds) >= 8000
    or (delta_blks_hit * 120.0 / elapsed_seconds) >= 900000
    or (delta_tup_returned * 120.0 / elapsed_seconds) >= 1500000
    or (delta_temp_bytes * 120.0 / elapsed_seconds) >= 67108864
  );
  job_pressure := recent_non_success >= 1 or recent_slow_batch_runs >= 1;

  if hard_pressure or scan_pressure or job_pressure then
    next_pressure := current_state.consecutive_pressure + 1;
    next_healthy := 0;
    next_healthy_since := null;
    next_mode := case
      when hard_pressure or job_pressure or next_pressure >= 2 then 'protect'
      else current_state.mode
    end;
  elsif current_state.mode = 'protect' then
    next_pressure := 0;
    next_healthy := current_state.consecutive_healthy + 1;
    next_healthy_since := coalesce(current_state.healthy_since, now());
    next_mode := case
      when now() - next_healthy_since >= interval '20 minutes' then 'normal'
      else 'protect'
    end;
  else
    next_pressure := 0;
    next_healthy := 0;
    next_healthy_since := null;
    next_mode := 'normal';
  end if;

  if next_mode = 'protect' then
    update public.runtime_capacity_managed_jobs managed
    set paused_by_capacity_guard = true,
        paused_at = coalesce(managed.paused_at, now()), updated_at = now()
    from cron.job jobs
    where jobs.jobname = managed.job_name and jobs.active is true;

    perform cron.alter_job(jobs.jobid, active := false)
    from cron.job jobs
    join public.runtime_capacity_managed_jobs managed on managed.job_name = jobs.jobname
    where managed.paused_by_capacity_guard is true and jobs.active is true;
  elsif next_mode = 'normal' and current_state.mode = 'protect' then
    perform cron.alter_job(jobs.jobid, active := true)
    from cron.job jobs
    join public.runtime_capacity_managed_jobs managed on managed.job_name = jobs.jobname
    where managed.paused_by_capacity_guard is true and jobs.active is false;

    update public.runtime_capacity_managed_jobs
    set paused_by_capacity_guard = false, paused_at = null, updated_at = now()
    where paused_by_capacity_guard is true;
  end if;

  update public.runtime_capacity_state
  set mode = next_mode,
      entered_protect_at = case
        when next_mode = 'protect' and current_state.mode <> 'protect' then now()
        when next_mode = 'normal' then null else current_state.entered_protect_at end,
      last_evaluated_at = now(), consecutive_pressure = next_pressure,
      consecutive_healthy = next_healthy,
      healthy_since = case when next_mode = 'protect' then next_healthy_since else null end,
      last_reason = jsonb_build_object(
        'viewer_profile', load_profile,
        'total_connections', total_client_connections,
        'active_queries', active_client_queries,
        'waiting_queries', waiting_client_queries,
        'long_queries', long_client_queries,
        'sample_seconds', elapsed_seconds,
        'blocks_read_delta', delta_blks_read,
        'blocks_hit_delta', delta_blks_hit,
        'rows_returned_delta', delta_tup_returned,
        'temp_bytes_delta', delta_temp_bytes,
        'transactions_delta', delta_xact_count,
        'failed_jobs_12m', recent_non_success,
        'slow_jobs_12m', recent_slow_batch_runs,
        'hard_pressure', hard_pressure,
        'scan_pressure', scan_pressure,
        'job_pressure', job_pressure
      ),
      updated_at = now()
  where singleton = true
  returning * into result;

  return result;
end;
$$;

revoke all on function public.evaluate_runtime_capacity() from public, anon, authenticated;
grant execute on function public.evaluate_runtime_capacity() to service_role;

-- Changed-movie playback audit queue. Full catalogue coverage is seeded with a
-- UUID seek cursor during the night; viewer-time writes only enqueue IDs.
create table if not exists public.maintenance_uuid_cursors (
  task_key text primary key,
  last_uuid uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.movie_playback_audit_queue (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  requested_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  reason text not null default 'data_changed',
  last_error text
);

create index if not exists movie_playback_audit_queue_ready_idx
  on public.movie_playback_audit_queue (next_attempt_at, requested_at);

alter table public.maintenance_uuid_cursors enable row level security;
alter table public.movie_playback_audit_queue enable row level security;
revoke all on table public.maintenance_uuid_cursors, public.movie_playback_audit_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.maintenance_uuid_cursors, public.movie_playback_audit_queue to service_role;

create or replace function public.enqueue_movie_playback_audit(p_movie_id uuid, p_reason text default 'data_changed')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_movie_id is null then return; end if;
  insert into public.movie_playback_audit_queue as queue (
    movie_id, requested_at, next_attempt_at, attempts, reason, last_error
  ) values (
    p_movie_id, now(), now(), 0, coalesce(nullif(p_reason, ''), 'data_changed'), null
  )
  on conflict (movie_id) do update set
    requested_at = excluded.requested_at,
    next_attempt_at = least(queue.next_attempt_at, now()),
    attempts = 0,
    reason = excluded.reason,
    last_error = null;
end;
$$;

revoke all on function public.enqueue_movie_playback_audit(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_movie_playback_audit(uuid, text) to service_role;

create or replace function public.enqueue_playback_audit_from_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'movies' then
    if tg_op = 'INSERT' then
      insert into public.movie_playback_audit_queue (movie_id, reason)
      select distinct id, 'movie_inserted' from audit_new_rows where is_published is true
      on conflict (movie_id) do update set requested_at = now(), next_attempt_at = least(movie_playback_audit_queue.next_attempt_at, now()), attempts = 0, reason = excluded.reason, last_error = null;
    else
      insert into public.movie_playback_audit_queue (movie_id, reason)
      select distinct newer.id, 'movie_state_changed'
      from audit_new_rows newer join audit_old_rows older using (id)
      where newer.is_published is distinct from older.is_published
         or newer.status is distinct from older.status
         or newer.seo_catalog_status is distinct from older.seo_catalog_status
         or newer.current_episode is distinct from older.current_episode
      on conflict (movie_id) do update set requested_at = now(), next_attempt_at = least(movie_playback_audit_queue.next_attempt_at, now()), attempts = 0, reason = excluded.reason, last_error = null;
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.movie_playback_audit_queue (movie_id, reason)
    select distinct movie_id, tg_table_name || '_deleted' from audit_old_rows where movie_id is not null
    on conflict (movie_id) do update set requested_at = now(), next_attempt_at = least(movie_playback_audit_queue.next_attempt_at, now()), attempts = 0, reason = excluded.reason, last_error = null;
  else
    insert into public.movie_playback_audit_queue (movie_id, reason)
    select distinct movie_id, tg_table_name || '_changed' from audit_new_rows where movie_id is not null
    on conflict (movie_id) do update set requested_at = now(), next_attempt_at = least(movie_playback_audit_queue.next_attempt_at, now()), attempts = 0, reason = excluded.reason, last_error = null;
  end if;
  return null;
end;
$$;

do $triggers$
declare
  target text;
begin
  drop trigger if exists enqueue_playback_audit_movies_insert on public.movies;
  drop trigger if exists enqueue_playback_audit_movies_update on public.movies;
  create trigger enqueue_playback_audit_movies_insert
    after insert on public.movies referencing new table as audit_new_rows
    for each statement execute function public.enqueue_playback_audit_from_changes();
  create trigger enqueue_playback_audit_movies_update
    after update on public.movies referencing old table as audit_old_rows new table as audit_new_rows
    for each statement execute function public.enqueue_playback_audit_from_changes();

  foreach target in array array['streams', 'episodes', 'movie_episodes'] loop
    execute format('drop trigger if exists enqueue_playback_audit_%1$s_insert on public.%1$I', target);
    execute format('drop trigger if exists enqueue_playback_audit_%1$s_update on public.%1$I', target);
    execute format('drop trigger if exists enqueue_playback_audit_%1$s_delete on public.%1$I', target);
    execute format('create trigger enqueue_playback_audit_%1$s_insert after insert on public.%1$I referencing new table as audit_new_rows for each statement execute function public.enqueue_playback_audit_from_changes()', target);
    execute format('create trigger enqueue_playback_audit_%1$s_update after update on public.%1$I referencing old table as audit_old_rows new table as audit_new_rows for each statement execute function public.enqueue_playback_audit_from_changes()', target);
    execute format('create trigger enqueue_playback_audit_%1$s_delete after delete on public.%1$I referencing old table as audit_old_rows for each statement execute function public.enqueue_playback_audit_from_changes()', target);
  end loop;
end;
$triggers$;

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
  values ('movie-playback-audit-catalog', null)
  on conflict (task_key) do nothing;

  select last_uuid into cursor_uuid
  from public.maintenance_uuid_cursors
  where task_key = 'movie-playback-audit-catalog'
  for update;

  insert into public.movie_playback_audit_queue as queue (movie_id, reason)
  select movie_id, 'refresh_queue_change'
  from public.movie_refresh_queue
  order by requested_at desc
  limit least(20, batch_limit)
  on conflict (movie_id) do update set
    requested_at = now(), next_attempt_at = least(queue.next_attempt_at, now()),
    reason = excluded.reason, last_error = null;
  get diagnostics refresh_seeded = row_count;

  with batch as materialized (
    select id
    from public.movies
    where cursor_uuid is null or id > cursor_uuid
    order by id
    limit batch_limit
  ), inserted as (
    insert into public.movie_playback_audit_queue as queue (movie_id, reason)
    select id, 'night_catalog_seek' from batch
    on conflict (movie_id) do nothing
    returning movie_id
  )
  select count(*)::integer, max(id) into scanned, next_uuid from batch;

  update public.maintenance_uuid_cursors
  set last_uuid = case when scanned = 0 then null else next_uuid end,
      updated_at = now()
  where task_key = 'movie-playback-audit-catalog';

  return jsonb_build_object('scanned', scanned, 'last_uuid', next_uuid, 'refresh_seeded', refresh_seeded);
end;
$$;

create or replace function public.process_movie_playback_audit_queue(p_limit integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  batch_limit integer := greatest(1, least(coalesce(p_limit, 8), 20));
  processed integer := 0;
  quarantined integer := 0;
  usable boolean;
  preview boolean;
begin
  for item in
    select queue.movie_id, queue.attempts, movie as movie_row
    from public.movie_playback_audit_queue queue
    join public.movies movie on movie.id = queue.movie_id
    where queue.next_attempt_at <= now()
    order by queue.requested_at
    for update of queue skip locked
    limit batch_limit
  loop
    begin
      preview := public.movie_is_preview_only(item.movie_row);
      usable := public.movie_has_usable_persisted_playback(item.movie_id);

      if item.movie_row.is_published is true and not preview and not usable then
        insert into public.catalog_integrity_issues as issue (
          issue_key, issue_type, movie_id, severity, confidence, status,
          evidence, first_detected_at, last_detected_at, resolved_at, attempts, last_error
        ) values (
          'published_without_playback:' || item.movie_id,
          'published_without_playback', item.movie_id, 5, 0.9990, 'open',
          jsonb_build_object('slug', item.movie_row.slug, 'detector', 'changed_movie_queue_v1'),
          now(), now(), null, 0, 'No usable persisted playback candidate; hidden pending repair'
        )
        on conflict (issue_key) do update set
          status = 'open', severity = 5, confidence = 0.9990,
          evidence = issue.evidence || excluded.evidence,
          last_detected_at = now(), resolved_at = null, last_error = excluded.last_error;

        perform set_config('app.movie_refresh_processing', '1', true);
        update public.movies
        set is_published = false,
            seo_catalog_status = case when lower(coalesce(seo_catalog_status, '')) in ('hidden', 'draft', 'superseded') then seo_catalog_status else 'awaiting_playback' end,
            current_episode = 0, episode_current = 'Đang cập nhật', updated_at = now()
        where id = item.movie_id and is_published is true;
        quarantined := quarantined + 1;
      elsif usable then
        update public.catalog_integrity_issues
        set status = 'resolved', resolved_at = now(), last_detected_at = now(), last_error = null
        where issue_key = 'published_without_playback:' || item.movie_id
          and status in ('open', 'repairing');
      end if;

      delete from public.movie_playback_audit_queue where movie_id = item.movie_id;
      processed := processed + 1;
    exception when others then
      update public.movie_playback_audit_queue
      set attempts = attempts + 1,
          next_attempt_at = now() + make_interval(mins => least(240, 5 * (attempts + 1))),
          last_error = left(sqlerrm, 500)
      where movie_id = item.movie_id;
    end;
  end loop;

  if quarantined > 0 then
    update public.home_page_cache set expires_at = now();
  end if;
  return jsonb_build_object('processed', processed, 'quarantined', quarantined);
end;
$$;

create or replace function public.quarantine_exhausted_catalog_playback()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.process_movie_playback_audit_queue(8);
$$;

revoke all on function public.seed_movie_playback_audit_queue(integer) from public, anon, authenticated;
revoke all on function public.process_movie_playback_audit_queue(integer) from public, anon, authenticated;
revoke all on function public.quarantine_exhausted_catalog_playback() from public, anon, authenticated;
grant execute on function public.seed_movie_playback_audit_queue(integer) to service_role;
grant execute on function public.process_movie_playback_audit_queue(integer) to service_role;
grant execute on function public.quarantine_exhausted_catalog_playback() to service_role;

-- Same identity proof as the former scanner, but keyset pagination replaces
-- OFFSET. Runtime stays stable as the cursor advances through the catalogue.
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
  values ('episode-identity-integrity-seek', null)
  on conflict (task_key) do nothing;

  select last_uuid into cursor_uuid
  from public.maintenance_uuid_cursors
  where task_key = 'episode-identity-integrity-seek'
  for update;

  create temporary table identity_scan_movies on commit drop as
  select m.id, m.slug, m.name, m.origin_name, m.title_vi, m.title_en,
         m.title_original, m.year, m.source_site, m.source_name, m.is_published
  from public.movies m
  where cursor_uuid is null or m.id > cursor_uuid
  order by m.id
  limit batch_size;
  get diagnostics scanned = row_count;

  if scanned = 0 then
    update public.maintenance_uuid_cursors
    set last_uuid = null, updated_at = now()
    where task_key = 'episode-identity-integrity-seek';
    return jsonb_build_object('scanned', 0, 'wrapped', true, 'detected', 0);
  end if;

  create index on identity_scan_movies(id);

  create temporary table structured_foreign_identity on commit drop as
  select
    movie.id as movie_id,
    movie.slug,
    movie.year as movie_year,
    trim(split_part(episode.server_data->>'filename', ' - ', 1)) as foreign_name,
    trim(split_part(episode.server_data->>'filename', ' - ', 2)) as foreign_origin,
    nullif(substring(split_part(episode.server_data->>'filename', ' - ', 3) from '([12][0-9]{3})'), '')::integer as foreign_year,
    count(*)::integer as episode_rows,
    min(nullif(episode.ophim_id, '')) as foreign_source_id,
    min(episode.server_data->>'filename') as sample_filename
  from identity_scan_movies movie
  join public.episodes episode on episode.movie_id = movie.id
  where coalesce(episode.server_data->>'filename', '') like '% - % - %'
  group by movie.id, movie.slug, movie.year,
           trim(split_part(episode.server_data->>'filename', ' - ', 1)),
           trim(split_part(episode.server_data->>'filename', ' - ', 2)),
           nullif(substring(split_part(episode.server_data->>'filename', ' - ', 3) from '([12][0-9]{3})'), '')::integer;

  delete from structured_foreign_identity foreign_row
  using identity_scan_movies movie
  where movie.id = foreign_row.movie_id
    and (
      foreign_row.foreign_year is null
      or foreign_row.foreign_name = ''
      or foreign_row.foreign_origin = ''
      or lower(foreign_row.foreign_name) = any(array[
        lower(trim(coalesce(movie.name, ''))), lower(trim(coalesce(movie.origin_name, ''))),
        lower(trim(coalesce(movie.title_vi, ''))), lower(trim(coalesce(movie.title_en, ''))),
        lower(trim(coalesce(movie.title_original, '')))
      ])
      or lower(foreign_row.foreign_origin) = any(array[
        lower(trim(coalesce(movie.name, ''))), lower(trim(coalesce(movie.origin_name, ''))),
        lower(trim(coalesce(movie.title_vi, ''))), lower(trim(coalesce(movie.title_en, ''))),
        lower(trim(coalesce(movie.title_original, '')))
      ])
    );

  create temporary table detected_identity_issues on commit drop as
  select
    foreign_row.movie_id,
    (array_agg(related.id order by related.id::text))[1] as related_movie_id,
    sum(foreign_row.episode_rows)::integer as episode_rows,
    jsonb_agg(jsonb_build_object(
      'foreign_name', foreign_row.foreign_name,
      'foreign_origin', foreign_row.foreign_origin,
      'foreign_year', foreign_row.foreign_year,
      'foreign_source_id', foreign_row.foreign_source_id,
      'sample_filename', foreign_row.sample_filename,
      'episode_rows', foreign_row.episode_rows
    ) order by foreign_row.foreign_name) as signatures
  from structured_foreign_identity foreign_row
  join lateral (
    select other.id
    from public.movies other
    where other.id <> foreign_row.movie_id
      and other.year = foreign_row.foreign_year
      and (
        lower(trim(coalesce(other.name, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
        or lower(trim(coalesce(other.origin_name, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
        or lower(trim(coalesce(other.title_vi, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
        or lower(trim(coalesce(other.title_en, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
        or lower(trim(coalesce(other.title_original, ''))) in (lower(foreign_row.foreign_name), lower(foreign_row.foreign_origin))
      )
    order by other.is_published desc, coalesce(other.current_episode, 0) desc, other.id
    limit 1
  ) related on true
  group by foreign_row.movie_id;

  insert into public.catalog_integrity_issues as issue (
    issue_key, issue_type, movie_id, related_movie_id, severity, confidence, status,
    evidence, first_detected_at, last_detected_at, resolved_at, attempts, last_error
  )
  select
    'episode_identity_mismatch:' || found.movie_id,
    'episode_identity_mismatch', found.movie_id, found.related_movie_id, 5, 1, 'open',
    jsonb_build_object('episode_rows', found.episode_rows, 'signatures', found.signatures, 'scanner', 'uuid_seek_v1'),
    now(), now(), null, 0, null
  from detected_identity_issues found
  on conflict (issue_key) do update set
    related_movie_id = excluded.related_movie_id,
    severity = excluded.severity,
    confidence = excluded.confidence,
    status = case when issue.status = 'ignored' then 'ignored' else 'open' end,
    evidence = excluded.evidence,
    last_detected_at = now(), resolved_at = null,
    attempts = case when issue.status = 'resolved' then 0 else issue.attempts end,
    last_error = null;
  get diagnostics detected = row_count;

  update public.catalog_integrity_issues issue
  set status = 'resolved', resolved_at = now(), last_detected_at = now(), last_error = null
  where issue.issue_type = 'episode_identity_mismatch'
    and issue.movie_id in (select id from identity_scan_movies)
    and issue.status in ('open', 'repairing')
    and not exists (select 1 from detected_identity_issues found where found.movie_id = issue.movie_id);

  select max(id) into next_uuid from identity_scan_movies;
  update public.maintenance_uuid_cursors
  set last_uuid = next_uuid, updated_at = now()
  where task_key = 'episode-identity-integrity-seek';

  return jsonb_build_object('scanned', scanned, 'last_uuid', next_uuid, 'detected', detected, 'pagination', 'uuid_seek');
end;
$$;

revoke all on function public.scan_episode_identity_mismatches(integer) from public, anon, authenticated;
grant execute on function public.scan_episode_identity_mismatches(integer) to service_role;

-- Five-minute telemetry rollups serve source-health decisions without every
-- viewer reading thousands of raw events. Raw rows are pruned gradually at night.
create table if not exists public.player_error_rollups (
  bucket_start timestamptz not null,
  event_type text not null,
  source_host text not null default '',
  server_name text not null default '',
  player_mode text not null default '',
  event_count bigint not null default 0,
  session_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket_start, event_type, source_host, server_name, player_mode)
);

create index if not exists player_error_rollups_recent_host_idx
  on public.player_error_rollups (bucket_start desc, source_host, event_type);

alter table public.player_error_rollups enable row level security;
revoke all on table public.player_error_rollups from public, anon, authenticated;
grant select, insert, update, delete on table public.player_error_rollups to service_role;

create or replace function public.rollup_recent_player_errors(p_minutes integer default 15)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer := 0;
begin
  insert into public.player_error_rollups as rollup (
    bucket_start, event_type, source_host, server_name, player_mode,
    event_count, session_count, updated_at
  )
  select
    date_bin(interval '5 minutes', created_at, timestamptz '2000-01-01 00:00:00+00'),
    event_type, lower(coalesce(source_host, '')), coalesce(server_name, ''), coalesce(player_mode, ''),
    count(*),
    count(distinct coalesce(nullif(playback_session_id, ''),
      coalesce(movie_slug, '') || ':' || coalesce(episode_slug, '') || ':' ||
      date_bin(interval '5 minutes', created_at, timestamptz '2000-01-01 00:00:00+00')::text)),
    now()
  from public.player_error_events
  where created_at >= now() - make_interval(mins => greatest(5, least(coalesce(p_minutes, 15), 60)))
  group by 1, 2, 3, 4, 5
  on conflict (bucket_start, event_type, source_host, server_name, player_mode)
  do update set event_count = excluded.event_count,
                session_count = excluded.session_count,
                updated_at = now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.prune_player_error_events_batch(p_keep_days integer default 7, p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer := 0;
begin
  if public.current_viewer_load_profile() <> 'night' then return 0; end if;
  with doomed as (
    select ctid from public.player_error_events
    where created_at < now() - make_interval(days => greatest(3, least(coalesce(p_keep_days, 7), 30)))
    order by created_at
    limit greatest(100, least(coalesce(p_limit, 2000), 5000))
  )
  delete from public.player_error_events events
  using doomed where events.ctid = doomed.ctid;
  get diagnostics removed = row_count;

  delete from public.player_error_rollups where bucket_start < now() - interval '30 days';
  return removed;
end;
$$;

revoke all on function public.rollup_recent_player_errors(integer) from public, anon, authenticated;
revoke all on function public.prune_player_error_events_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.rollup_recent_player_errors(integer) to service_role;
grant execute on function public.prune_player_error_events_batch(integer, integer) to service_role;

-- Schedule policy. UTC mappings:
-- night 00:15-05:29 ICT = 17:15-22:29 UTC
-- morning shoulder 06:00-10:29 ICT = 23:00-03:29 UTC
-- afternoon shoulder 14:30-17:29 ICT = 07:30-10:29 UTC
-- peaks receive only capacity and playback-health work.
do $scheduler$
declare
  retired text[] := array[
    'quarantine-exhausted-catalog-playback-hourly',
    'scan-episode-identity-offpeak',
    'process-movie-refresh-queue',
    'process-movie-refresh-queue-peak-guard'
  ];
  adaptive text[] := array[
    'seed-playback-audit-night',
    'process-playback-audit-night',
    'scan-episode-identity-night-seek',
    'process-movie-refresh-night',
    'process-movie-refresh-shoulder',
    'rollup-player-errors-viewer-health',
    'prune-player-errors-night'
  ];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;

  perform cron.unschedule(jobid) from cron.job where jobname = any(retired || adaptive);

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('evaluate-runtime-capacity-every-2-minutes', 'evaluate-runtime-capacity-every-5-minutes');

  perform cron.schedule('evaluate-runtime-capacity-every-2-minutes', '*/2 * * * *',
    'select public.evaluate_runtime_capacity();');
  perform cron.schedule('seed-playback-audit-night', '12,42 17-22 * * *',
    'select public.seed_movie_playback_audit_queue(80);');
  perform cron.schedule('process-playback-audit-night', '2,17,32,47 17-22 * * *',
    'select public.process_movie_playback_audit_queue(8);');
  perform cron.schedule('scan-episode-identity-night-seek', '27 17-22 * * *',
    'select public.scan_episode_identity_mismatches(80);');
  perform cron.schedule('process-movie-refresh-night', '7,37 17-22 * * *',
    'select public.process_movie_refresh_queue(2);');
  perform cron.schedule('process-movie-refresh-shoulder', '22 23,0-3,7-10 * * *',
    'select public.process_movie_refresh_queue(1);');
  perform cron.schedule('rollup-player-errors-viewer-health', '4,14,24,34,44,54 * * * *',
    'select public.rollup_recent_player_errors(15);');
  perform cron.schedule('prune-player-errors-night', '45 17-22 * * *',
    'select public.prune_player_error_events_batch(7, 2000);');

  perform cron.alter_job(jobid, schedule := '3-53/10 17-22 * * *', active := true)
  from cron.job where jobname = 'catalog-brain-night';
  perform cron.alter_job(jobid, schedule := '8-58/10 17-22 * * *', active := true)
  from cron.job where jobname = 'playback-brain-night';
  perform cron.alter_job(jobid, schedule := '7,37 23,0-3,7-9 * * *', active := true)
  from cron.job where jobname = 'catalog-brain-shoulder';
  perform cron.alter_job(jobid, schedule := '17,47 23,0-3,7-9 * * *', active := true)
  from cron.job where jobname = 'playback-brain-shoulder';
  perform cron.alter_job(jobid, schedule := '12,42 3-7,10-16 * * *', active := true)
  from cron.job where jobname = 'playback-brain-peak-guard';

  -- Warm once immediately before each viewer peak, never repeatedly during it.
  perform cron.alter_job(jobid, schedule := '20 3,10 * * *', active := true)
  from cron.job where jobname = 'warm-home-proxy-every-15-minutes';

  delete from public.runtime_capacity_managed_jobs where job_name = any(retired);
  insert into public.runtime_capacity_managed_jobs(job_name, paused_by_capacity_guard, paused_at, updated_at)
  select unnest(adaptive), false, null, now()
  on conflict (job_name) do update set paused_by_capacity_guard = false, paused_at = null, updated_at = now();

  -- Emergency relief is immediate: new background jobs stay paused until two
  -- consecutive healthy samples let the guard safely resume their schedules.
  update public.runtime_capacity_state
  set mode = 'protect', entered_protect_at = coalesce(entered_protect_at, now()),
      last_evaluated_at = now(), consecutive_pressure = greatest(consecutive_pressure, 1),
      consecutive_healthy = 0, healthy_since = null,
      last_reason = jsonb_build_object('reason', 'adaptive_capacity_migration', 'viewer_profile', public.current_viewer_load_profile()),
      updated_at = now()
  where singleton = true;

  perform cron.alter_job(jobs.jobid, active := false)
  from cron.job jobs
  where jobs.jobname = any(adaptive);
  update public.runtime_capacity_managed_jobs
  set paused_by_capacity_guard = true, paused_at = now(), updated_at = now()
  where job_name = any(adaptive);
end;
$scheduler$;

comment on table public.movie_playback_audit_queue is
  'Changed-movie playback audit queue; replaces hourly full-catalogue quarantine scans.';
comment on table public.player_error_rollups is
  'Five-minute player telemetry windows used by source-health readers; raw telemetry is retained for seven days.';
