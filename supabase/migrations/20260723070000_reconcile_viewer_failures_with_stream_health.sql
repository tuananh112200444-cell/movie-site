-- Convert repeated, exact viewer playback failures into stream health state.
-- Matching is scoped to movie + episode + host so one broken episode cannot
-- disable another episode or another provider.

create or replace function public.reconcile_viewer_failures_with_stream_health(
  p_hours integer default 6,
  p_threshold integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer := 0;
begin
  with failures as materialized (
    select
      lower(trim(movie_slug)) as movie_slug,
      lower(trim(episode_slug)) as episode_slug,
      lower(regexp_replace(trim(source_host), '^www\.', '')) as source_host,
      count(*)::integer as failure_events,
      max(created_at) as last_failure_at
    from public.player_error_events
    where created_at >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 6), 72)))
      and event_type in (
        'stall_fatal',
        'hls_fatal',
        'hls_fatal_retry',
        'direct_video_error',
        'native_hls_error',
        'iframe_blocked'
      )
      and nullif(trim(movie_slug), '') is not null
      and nullif(trim(episode_slug), '') is not null
      and nullif(trim(source_host), '') is not null
    group by 1, 2, 3
    having count(*) >= greatest(2, least(coalesce(p_threshold, 3), 10))
  ),
  updated as (
    update public.streams s
    set
      health_status = case when f.failure_events >= 6 then 'dead' else 'failed' end,
      failure_count = greatest(coalesce(s.failure_count, 0), least(20, f.failure_events)),
      priority = least(coalesce(s.priority, 1), 1),
      is_active = false,
      last_error = 'Viewer telemetry: repeated exact playback failure',
      last_checked_at = f.last_failure_at,
      updated_at = now()
    from failures f
    join public.movies m on lower(m.slug) = f.movie_slug
    where s.movie_id = m.id
      and lower(trim(coalesce(s.episode_slug, ''))) = f.episode_slug
      and (
        lower(coalesce(substring(s.stream_url from '^https?://([^/:?#]+)'), '')) = f.source_host
        or lower(coalesce(substring(s.embed_url from '^https?://([^/:?#]+)'), '')) = f.source_host
      )
      and (
        s.is_active
        or coalesce(s.failure_count, 0) < f.failure_events
        or coalesce(s.last_checked_at, '-infinity'::timestamptz) < f.last_failure_at
      )
    returning s.id
  )
  select count(*) into affected from updated;

  return affected;
end;
$$;

revoke all on function public.reconcile_viewer_failures_with_stream_health(integer, integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_viewer_failures_with_stream_health(integer, integer)
  to service_role;

comment on function public.reconcile_viewer_failures_with_stream_health(integer, integer) is
  'Disables only the exact movie/episode/host stream after repeated viewer-confirmed fatal playback failures.';

do $scheduler$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'reconcile-viewer-stream-failures-every-10-minutes'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'reconcile-viewer-stream-failures-every-10-minutes',
    '3,13,23,33,43,53 * * * *',
    $command$select public.reconcile_viewer_failures_with_stream_health(2, 3);$command$
  );
end;
$scheduler$;
