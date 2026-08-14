-- Collapse refresh side effects during provider catalogue imports.
-- A single provider response can upsert hundreds of episode rows. Row-level
-- queue triggers rewrote the same movie_refresh_queue row hundreds of times
-- and were the main source of PostgREST/IO pressure during the full backfill.

create or replace function public.enqueue_episode_refresh_after_insert_statement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_movie_id uuid;
begin
  for target_movie_id in
    select distinct row.movie_id from new_rows row where row.movie_id is not null
  loop
    perform public.enqueue_movie_refresh(target_movie_id, 'episode_changed');
  end loop;
  return null;
end;
$$;

create or replace function public.enqueue_episode_refresh_after_update_statement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_movie_id uuid;
begin
  for target_movie_id in
    select distinct changed.movie_id
    from (
      select row.movie_id from new_rows row
      union
      select row.movie_id from old_rows row
    ) changed
    where changed.movie_id is not null
  loop
    perform public.enqueue_movie_refresh(target_movie_id, 'episode_changed');
  end loop;
  return null;
end;
$$;

create or replace function public.enqueue_episode_refresh_after_delete_statement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_movie_id uuid;
begin
  for target_movie_id in
    select distinct row.movie_id from old_rows row where row.movie_id is not null
  loop
    perform public.enqueue_movie_refresh(target_movie_id, 'episode_changed');
  end loop;
  return null;
end;
$$;

revoke all on function public.enqueue_episode_refresh_after_insert_statement() from public, anon, authenticated;
revoke all on function public.enqueue_episode_refresh_after_update_statement() from public, anon, authenticated;
revoke all on function public.enqueue_episode_refresh_after_delete_statement() from public, anon, authenticated;

do $$
declare
  episode_table text;
begin
  foreach episode_table in array array['movie_episodes', 'episodes']
  loop
    execute format('drop trigger if exists enqueue_movie_refresh_after_episode_change on public.%I', episode_table);
    execute format('drop trigger if exists enqueue_movie_refresh_after_episode_insert on public.%I', episode_table);
    execute format('drop trigger if exists enqueue_movie_refresh_after_episode_update on public.%I', episode_table);
    execute format('drop trigger if exists enqueue_movie_refresh_after_episode_delete on public.%I', episode_table);

    execute format(
      'create trigger enqueue_movie_refresh_after_episode_insert after insert on public.%I referencing new table as new_rows for each statement execute function public.enqueue_episode_refresh_after_insert_statement()',
      episode_table
    );
    execute format(
      'create trigger enqueue_movie_refresh_after_episode_update after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public.enqueue_episode_refresh_after_update_statement()',
      episode_table
    );
    execute format(
      'create trigger enqueue_movie_refresh_after_episode_delete after delete on public.%I referencing old table as old_rows for each statement execute function public.enqueue_episode_refresh_after_delete_statement()',
      episode_table
    );
  end loop;
end;
$$;

create or replace function public.refresh_movies_after_stream_insert_statement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_movie_id uuid;
begin
  delete from public.movie_api_cache cache
  using public.movies movie,
        (select distinct row.movie_id from new_rows row where row.movie_id is not null) affected
  where movie.id = affected.movie_id
    and cache.slug in (movie.slug, movie.ophim_slug);

  for target_movie_id in
    select distinct row.movie_id from new_rows row where row.movie_id is not null
  loop
    perform public.enqueue_movie_refresh(target_movie_id, 'stream_changed');
    perform public.reconcile_movie_release_state(target_movie_id);
  end loop;
  return null;
end;
$$;

create or replace function public.refresh_movies_after_stream_update_statement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_movie_id uuid;
begin
  delete from public.movie_api_cache cache
  using public.movies movie,
        (
          select row.movie_id from new_rows row where row.movie_id is not null
          union
          select row.movie_id from old_rows row where row.movie_id is not null
        ) affected
  where movie.id = affected.movie_id
    and cache.slug in (movie.slug, movie.ophim_slug);

  for target_movie_id in
    select distinct affected.movie_id
    from (
      select row.movie_id from new_rows row
      union
      select row.movie_id from old_rows row
    ) affected
    where affected.movie_id is not null
  loop
    perform public.enqueue_movie_refresh(target_movie_id, 'stream_changed');
    perform public.reconcile_movie_release_state(target_movie_id);
  end loop;
  return null;
end;
$$;

create or replace function public.refresh_movies_after_stream_delete_statement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_movie_id uuid;
begin
  delete from public.movie_api_cache cache
  using public.movies movie,
        (select distinct row.movie_id from old_rows row where row.movie_id is not null) affected
  where movie.id = affected.movie_id
    and cache.slug in (movie.slug, movie.ophim_slug);

  for target_movie_id in
    select distinct row.movie_id from old_rows row where row.movie_id is not null
  loop
    perform public.enqueue_movie_refresh(target_movie_id, 'stream_changed');
    perform public.reconcile_movie_release_state(target_movie_id);
  end loop;
  return null;
end;
$$;

revoke all on function public.refresh_movies_after_stream_insert_statement() from public, anon, authenticated;
revoke all on function public.refresh_movies_after_stream_update_statement() from public, anon, authenticated;
revoke all on function public.refresh_movies_after_stream_delete_statement() from public, anon, authenticated;

drop trigger if exists reconcile_movie_after_stream_health_change on public.streams;
drop trigger if exists refresh_movies_after_stream_insert on public.streams;
drop trigger if exists refresh_movies_after_stream_update on public.streams;
drop trigger if exists refresh_movies_after_stream_delete on public.streams;

create trigger refresh_movies_after_stream_insert
after insert on public.streams
referencing new table as new_rows
for each statement execute function public.refresh_movies_after_stream_insert_statement();

create trigger refresh_movies_after_stream_update
after update on public.streams
referencing old table as old_rows new table as new_rows
for each statement execute function public.refresh_movies_after_stream_update_statement();

create trigger refresh_movies_after_stream_delete
after delete on public.streams
referencing old table as old_rows
for each statement execute function public.refresh_movies_after_stream_delete_statement();

comment on function public.refresh_movies_after_stream_update_statement() is
  'Refreshes cache, queue and release state once per affected movie and SQL statement, not once per stream row.';
