-- Keep recoverable playback backlog moving without scanning the whole catalogue
-- on a viewer request. Recent titles protect launch quality while the oldest
-- half prevents permanent starvation.

create index if not exists movies_awaiting_playback_updated_idx
  on public.movies (updated_at desc, id)
  where is_published is false
    and seo_catalog_status = 'awaiting_playback'
    and superseded_by_movie_id is null;

create or replace function public.seed_awaiting_playback_repairs(
  p_recent_limit integer default 40,
  p_oldest_limit integer default 40
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer := 0;
begin
  with recent_candidates as materialized (
    select movie.id, movie.slug, movie.source_site, movie.current_episode, movie.total_episodes
    from public.movies movie
    where movie.is_published is false
      and movie.seo_catalog_status = 'awaiting_playback'
      and movie.superseded_by_movie_id is null
      and movie.slug ~ '^[a-z0-9][a-z0-9-]{1,180}$'
    order by movie.updated_at desc nulls last, movie.id
    limit greatest(1, least(coalesce(p_recent_limit, 40), 100))
  ), oldest_candidates as materialized (
    select movie.id, movie.slug, movie.source_site, movie.current_episode, movie.total_episodes
    from public.movies movie
    where movie.is_published is false
      and movie.seo_catalog_status = 'awaiting_playback'
      and movie.superseded_by_movie_id is null
      and movie.slug ~ '^[a-z0-9][a-z0-9-]{1,180}$'
    order by movie.updated_at asc nulls first, movie.id
    limit greatest(1, least(coalesce(p_oldest_limit, 40), 100))
  ), candidates as materialized (
    select * from recent_candidates
    union
    select * from oldest_candidates
  ), seeded as (
    insert into public.catalog_integrity_issues as issue (
      issue_key,
      issue_type,
      movie_id,
      severity,
      confidence,
      status,
      evidence,
      first_detected_at,
      last_detected_at
    )
    select
      'published_without_playback:' || candidate.id::text,
      'published_without_playback',
      candidate.id,
      5,
      1,
      'open',
      jsonb_build_object(
        'detector', 'awaiting_playback_fair_queue_v1',
        'source_site', candidate.source_site,
        'advertised', greatest(coalesce(candidate.current_episode, 0), coalesce(candidate.total_episodes, 0)),
        'unified_contract', 'equal_provider_brain_v2'
      ),
      now(),
      now()
    from candidates candidate
    on conflict on constraint catalog_integrity_issues_pkey do update
    set last_detected_at = now(),
        severity = greatest(issue.severity, excluded.severity),
        evidence = issue.evidence || excluded.evidence,
        status = case when issue.status = 'resolved' then 'open' else issue.status end,
        resolved_at = case when issue.status = 'resolved' then null else issue.resolved_at end
    returning 1
  )
  select count(*) into inserted_count from seeded;

  return inserted_count;
end;
$$;

revoke all on function public.seed_awaiting_playback_repairs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.seed_awaiting_playback_repairs(integer, integer)
  to service_role;

do $schedule$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'seed-awaiting-playback-repairs-every-15-minutes';

  perform cron.schedule(
    'seed-awaiting-playback-repairs-every-15-minutes',
    '6,21,36,51 * * * *',
    'select public.seed_awaiting_playback_repairs(40, 40);'
  );
end;
$schedule$;

select public.seed_awaiting_playback_repairs(80, 80);

comment on function public.seed_awaiting_playback_repairs(integer, integer) is
  'Seeds a fair newest-and-oldest playback repair cohort; provider work remains in unified-provider-brain and never blocks viewer requests.';
