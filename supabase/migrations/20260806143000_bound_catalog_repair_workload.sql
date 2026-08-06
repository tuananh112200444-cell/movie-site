-- Keep viewer-facing database work ahead of catalog repair.  The repair
-- backlog is useful, but its old unbounded reconciliation scanned every open
-- issue and could hold the database for the full statement timeout.

begin;

create index if not exists catalog_integrity_repair_dispatch_idx
  on public.catalog_integrity_issues (severity desc, first_detected_at asc, issue_key)
  where status = 'open' and attempts < 3;

create or replace function public.reconcile_catalog_source_repairs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
  reopened_count integer := 0;
begin
  -- This predicate invokes playback checks against several large episode and
  -- stream tables.  Lock and inspect a small, deterministic batch only; a
  -- future run continues the queue without monopolising the database.
  with candidates as materialized (
    select issue_key
    from public.catalog_integrity_issues
    where status in ('open', 'repairing')
      and issue_type in (
        'published_without_playback',
        'episode_count_mismatch',
        'episode_sequence_gap'
      )
    order by last_detected_at asc nulls first, issue_key
    for update skip locked
    limit 20
  ), resolved as (
    update public.catalog_integrity_issues issue
    set
      status = 'resolved',
      resolved_at = now(),
      last_detected_at = now(),
      last_error = null
    from candidates
    where issue.issue_key = candidates.issue_key
      and (
        (
          issue.issue_type = 'published_without_playback'
          and public.movie_has_usable_persisted_playback(issue.movie_id)
        )
        or (
          issue.issue_type = 'episode_count_mismatch'
          and coalesce(
            (select movie.current_episode from public.movies movie where movie.id = issue.movie_id),
            (issue.evidence->>'advertised')::integer,
            0
          ) <= greatest(
            coalesce((
              select max(episode.episode_number)
              from public.movie_episodes episode
              where episode.movie_id = issue.movie_id
                and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
            ), 0),
            coalesce((
              select max(episode.episode_number)
              from public.episodes episode
              where episode.movie_id = issue.movie_id
                and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
            ), 0)
          )
        )
        or (
          issue.issue_type = 'episode_sequence_gap'
          and jsonb_typeof(issue.evidence->'missing') = 'array'
          and not exists (
            select 1
            from jsonb_array_elements_text(issue.evidence->'missing') missing(value)
            where missing.value ~ '^[0-9]+$'
              and not exists (
                select 1
                from public.movie_episodes episode
                where episode.movie_id = issue.movie_id
                  and episode.episode_number = missing.value::integer
                  and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
                union all
                select 1
                from public.episodes episode
                where episode.movie_id = issue.movie_id
                  and episode.episode_number = missing.value::integer
                  and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
              )
          )
        )
      )
    returning 1
  )
  select count(*) into resolved_count from resolved;

  with stale_repairing as materialized (
    select issue_key
    from public.catalog_integrity_issues
    where status = 'repairing'
      and coalesce((evidence->>'repair_dispatched_at')::timestamptz, last_detected_at)
        < now() - interval '10 minutes'
    order by last_detected_at asc nulls first, issue_key
    for update skip locked
    limit 20
  ), reopened as (
    update public.catalog_integrity_issues issue
    set
      status = 'open',
      last_error = case
        when attempts >= 3 then 'Targeted source repair exhausted; upstream detail or playable episode is unavailable'
        else 'Targeted source repair did not produce playable coverage; retry scheduled'
      end
    from stale_repairing
    where issue.issue_key = stale_repairing.issue_key
    returning 1
  )
  select count(*) into reopened_count from reopened;

  return jsonb_build_object('resolved', resolved_count, 'reopened', reopened_count, 'batch_limit', 20);
end;
$$;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  -- A repair request is asynchronous. One row per run keeps the repair queue
  -- progressing without consuming the connection budget used by visitors.
  perform cron.alter_job(
    jobid,
    schedule := '4,19,34,49 * * * *',
    command := 'select public.dispatch_catalog_source_repairs(1);',
    active := true
  )
  from cron.job
  where jobname = 'dispatch-catalog-source-repairs-every-2-minutes';

  -- Detection must not dispatch a second, larger repair batch.
  perform cron.alter_job(
    jobid,
    command := 'select public.scan_episode_sequence_gaps(600);',
    active := true
  )
  from cron.job
  where jobname = 'scan-episode-sequence-gaps-every-5-minutes';

  -- Quarantine is intentionally separate from repair and runs only once per
  -- hour. The function still requires three failed targeted repairs before a
  -- movie can be hidden.
  if exists (select 1 from cron.job where jobname = 'quarantine-exhausted-catalog-playback-hourly') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'quarantine-exhausted-catalog-playback-hourly';
  end if;

  perform cron.schedule(
    'quarantine-exhausted-catalog-playback-hourly',
    '42 * * * *',
    'select public.quarantine_exhausted_catalog_playback();'
  );
end;
$scheduler$;

comment on function public.reconcile_catalog_source_repairs() is
  'Bounded, lock-safe reconciliation of at most twenty catalog issues per run; never scans the full repair backlog in one transaction.';

commit;
