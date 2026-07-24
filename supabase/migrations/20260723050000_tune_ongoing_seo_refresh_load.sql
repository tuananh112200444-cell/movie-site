-- Keep ongoing SEO freshness current without duplicating episode reconciliation.
-- Episode table triggers remain the immediate source of truth for episode changes.

create or replace function public.refresh_ongoing_movie_seo_quality(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  processed integer := 0;
begin
  for item in
    select m.id
    from public.movies m
    left join public.movie_seo_quality_status q on q.movie_id = m.id
    where m.is_published is true
      and (
        lower(coalesce(m.status, '')) in ('ongoing', 'returning series', 'in production')
        or (coalesce(m.current_episode, 0) > 0 and coalesce(m.total_episodes, 0) > coalesce(m.current_episode, 0))
        or m.next_episode_at >= now() - interval '14 days'
      )
    order by q.checked_at asc nulls first, m.updated_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  loop
    perform public.refresh_movie_seo_quality(item.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

revoke all on function public.refresh_ongoing_movie_seo_quality(integer) from public, anon, authenticated;
grant execute on function public.refresh_ongoing_movie_seo_quality(integer) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-ongoing-movie-seo-quality';
    perform cron.schedule(
      'refresh-ongoing-movie-seo-quality',
      '7,27,47 * * * *',
      $cmd$select public.refresh_ongoing_movie_seo_quality(200);$cmd$
    );
  end if;
end $$;
