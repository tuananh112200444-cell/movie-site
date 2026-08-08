-- Historical movies that predate the queue-based SEO lifecycle have no
-- quality row, so the quality-gated sitemap cannot prioritise them.  Backfill
-- only a small off-peak queue; visitor-facing changes always keep priority.

create or replace function public.seed_movie_seo_quality_backfill(p_limit integer default 30)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  queued integer := 0;
  ready_queue_depth integer := 0;
begin
  select count(*) into ready_queue_depth
  from public.movie_refresh_queue
  where next_attempt_at <= now() + interval '5 minutes';

  -- Never add historical work when normal ingestion/episode work is pending.
  if ready_queue_depth >= 100 then
    return 0;
  end if;

  insert into public.movie_refresh_queue (movie_id, requested_at, next_attempt_at, reasons)
  select candidate.id, now(), now(), array['seo_quality_backfill']
  from (
    select m.id
    from public.movies m
    left join public.movie_seo_quality_status q on q.movie_id = m.id
    where m.is_published is true
      and nullif(trim(coalesce(m.slug, '')), '') is not null
      and (
        q.movie_id is null
        or q.movie_updated_at is distinct from m.updated_at
        or (q.eligible_for_index is true and q.index_tier not in ('playable', 'ongoing', 'upcoming'))
      )
    order by
      case when m.updated_at >= now() - interval '90 days' then 0 else 1 end,
      coalesce(m.tmdb_popularity, 0) desc,
      m.updated_at desc nulls last,
      m.id
    limit greatest(1, least(coalesce(p_limit, 30), 30))
  ) candidate
  on conflict (movie_id) do nothing;

  get diagnostics queued = row_count;
  return queued;
end;
$$;

revoke all on function public.seed_movie_seo_quality_backfill(integer) from public, anon, authenticated;
grant execute on function public.seed_movie_seo_quality_backfill(integer) to service_role;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'seed-movie-seo-quality-backfill-offpeak';

  -- UTC 17:07–22:52 equals 00:07–05:52 in Vietnam, outside the observed
  -- midday and evening viewer peaks. The existing bounded queue performs the
  -- actual reconciliation and naturally pauses this seed when it is busy.
  perform cron.schedule(
    'seed-movie-seo-quality-backfill-offpeak',
    '7,22,37,52 17-22 * * *',
    'select public.seed_movie_seo_quality_backfill(30);'
  );
end;
$scheduler$;

comment on function public.seed_movie_seo_quality_backfill(integer) is
  'Seeds at most thirty stale or missing SEO quality records per off-peak run; it never changes movie metadata or playback directly.';
