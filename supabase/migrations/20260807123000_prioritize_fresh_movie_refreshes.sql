-- Keep new metadata and episode changes responsive without increasing the
-- daytime reconciliation budget.  Historical work is handled separately in
-- the Vietnam low-traffic window.

create or replace function public.process_movie_refresh_queue(p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  processed integer := 0;
begin
  perform set_config('app.movie_refresh_processing', '1', true);

  for item in
    select q.movie_id
    from public.movie_refresh_queue q
    where q.next_attempt_at <= now()
    order by
      (q.requested_at >= now() - interval '6 hours') desc,
      case when q.requested_at >= now() - interval '6 hours' then q.requested_at end desc nulls last,
      case when q.requested_at < now() - interval '6 hours' then q.requested_at end asc nulls last,
      q.movie_id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  loop
    begin
      perform public.reconcile_movie_release_state(item.movie_id);
      perform public.refresh_movie_seo_quality(item.movie_id);
      delete from public.movie_refresh_queue where movie_id = item.movie_id;
      processed := processed + 1;
    exception when others then
      update public.movie_refresh_queue
      set
        attempts = attempts + 1,
        last_error = left(sqlerrm, 1000),
        next_attempt_at = now() + make_interval(
          mins => least(60, greatest(1, power(2, least(attempts, 5))::integer))
        )
      where movie_id = item.movie_id;
    end;
  end loop;

  perform set_config('app.movie_refresh_processing', '0', true);
  return processed;
end;
$$;

create or replace function public.process_movie_refresh_backlog(p_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  processed integer := 0;
begin
  perform set_config('app.movie_refresh_processing', '1', true);

  for item in
    select q.movie_id
    from public.movie_refresh_queue q
    where q.next_attempt_at <= now()
      and q.requested_at < now() - interval '6 hours'
    order by q.requested_at asc, q.movie_id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 25))
  loop
    begin
      perform public.reconcile_movie_release_state(item.movie_id);
      perform public.refresh_movie_seo_quality(item.movie_id);
      delete from public.movie_refresh_queue where movie_id = item.movie_id;
      processed := processed + 1;
    exception when others then
      update public.movie_refresh_queue
      set
        attempts = attempts + 1,
        last_error = left(sqlerrm, 1000),
        next_attempt_at = now() + make_interval(
          mins => least(60, greatest(1, power(2, least(attempts, 5))::integer))
        )
      where movie_id = item.movie_id;
    end;
  end loop;

  perform set_config('app.movie_refresh_processing', '0', true);
  return processed;
end;
$$;

revoke all on function public.process_movie_refresh_backlog(integer) from public, anon, authenticated;
grant execute on function public.process_movie_refresh_backlog(integer) to service_role;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'process-movie-refresh-backlog-offpeak';

  -- pg_cron is configured in GMT.  17:02–22:57 GMT is 00:02–05:57 in Vietnam.
  perform cron.schedule(
    'process-movie-refresh-backlog-offpeak',
    '2-59/5 17-22 * * *',
    $cmd$select public.process_movie_refresh_backlog(25);$cmd$
  );
end;
$scheduler$;

comment on function public.process_movie_refresh_backlog(integer) is
  'Off-peak bounded reconciliation for stale queue items; viewer-facing refreshes remain prioritized.';
