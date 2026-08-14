-- Operational truth must catch up promptly with viewer-facing playback truth.
-- Public playback incidents are handled before lower-impact catalogue drift,
-- while the batch remains bounded to protect the database during traffic peaks.

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
  with candidates as materialized (
    select issue.issue_key
    from public.catalog_integrity_issues issue
    where issue.status in ('open', 'repairing')
      and issue.issue_type in (
        'published_without_playback',
        'episode_count_mismatch',
        'episode_sequence_gap'
      )
    order by
      case
        when issue.issue_type = 'published_without_playback'
          and exists (
            select 1
            from public.movies movie
            where movie.id = issue.movie_id
              and movie.is_published is true
          ) then 0
        when issue.issue_type = 'published_without_playback' then 1
        else 2
      end,
      issue.last_detected_at asc nulls first,
      issue.issue_key
    for update skip locked
    limit 40
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
          and (
            public.movie_has_usable_persisted_playback(issue.movie_id)
            or exists (
              select 1
              from public.movies movie
              where movie.id = issue.movie_id
                and movie.is_published is true
                and public.movie_is_preview_only(movie)
            )
          )
        )
        or (
          issue.issue_type = 'episode_count_mismatch'
          and coalesce(
            (select movie.current_episode from public.movies movie where movie.id = issue.movie_id),
            (issue.evidence->>'advertised')::integer,
            0
          ) <= public.get_movie_playable_max_episode(issue.movie_id)
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
                from public.get_movie_playable_episode_numbers(issue.movie_id) playable
                where playable.episode_number = missing.value::integer
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

  return jsonb_build_object(
    'resolved', resolved_count,
    'reopened', reopened_count,
    'batch_limit', 40,
    'priority', 'public_playback_first_v1',
    'truth', 'health_aware_v3'
  );
end;
$$;

revoke all on function public.reconcile_catalog_source_repairs()
  from public, anon, authenticated;
grant execute on function public.reconcile_catalog_source_repairs()
  to service_role;

-- Clear the bounded backlog immediately; scheduled reconciliation continues it.
select public.reconcile_catalog_source_repairs();

comment on function public.reconcile_catalog_source_repairs() is
  'Bounded health-aware issue reconciliation that prioritizes public playback incidents and closes obsolete preview alerts.';
