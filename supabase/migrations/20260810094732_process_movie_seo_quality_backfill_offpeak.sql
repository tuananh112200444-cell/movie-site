-- The shared movie-refresh queue correctly protects fresh movie and episode
-- changes, but its normal backlog can keep the historical SEO-quality seed
-- paused indefinitely. Process only the quality record here: no movie,
-- episode, stream, or playback data is changed.

create or replace function public.process_movie_seo_quality_backfill(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  processed integer := 0;
  ready_queue_depth integer := 0;
begin
  select count(*) into ready_queue_depth
  from public.movie_refresh_queue
  where next_attempt_at <= now() + interval '5 minutes';

  -- Pause this non-urgent work when ingestion/release reconciliation is under
  -- exceptional pressure. The normal queue remains the higher priority.
  if ready_queue_depth >= 5000 then
    return 0;
  end if;

  for item in
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
    limit greatest(1, least(coalesce(p_limit, 20), 20))
  loop
    begin
      perform public.refresh_movie_seo_quality(item.id);
      processed := processed + 1;
    exception when others then
      -- A single malformed historical row must not stop the bounded batch.
      null;
    end;
  end loop;

  return processed;
end;
$$;

revoke all on function public.process_movie_seo_quality_backfill(integer) from public, anon, authenticated;
grant execute on function public.process_movie_seo_quality_backfill(integer) to service_role;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'seed-movie-seo-quality-backfill-offpeak',
    'process-movie-seo-quality-backfill-offpeak'
  );

  -- UTC 17:03-22:58 equals 00:03-05:58 in Vietnam. Stagger this one
  -- minute after the normal backlog worker so the two jobs never start at
  -- the same instant.
  perform cron.schedule(
    'process-movie-seo-quality-backfill-offpeak',
    '3-58/5 17-22 * * *',
    'select public.process_movie_seo_quality_backfill(20);'
  );
end;
$scheduler$;

comment on function public.process_movie_seo_quality_backfill(integer) is
  'Repairs at most twenty missing, stale, or inconsistent movie SEO-quality rows per off-peak run without changing movie or playback data.';
