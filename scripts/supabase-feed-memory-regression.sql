-- Requires the feed-memory migration to be applied. All test work is rolled back.
-- Checks exact output for both feeds, pagination, invalid modes and empty pages;
-- compares execution buffers and rejects any temporary-file writes by the new feed.
begin isolation level repeatable read;
set local statement_timeout='45s';
refresh materialized view concurrently public.catalog_feed_page_cache;
CREATE OR REPLACE FUNCTION pg_temp.incident_old_feed(p_mode text DEFAULT 'new'::text, p_limit integer DEFAULT 36, p_offset integer DEFAULT 0)
 RETURNS TABLE(item jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  normalized_mode text := lower(coalesce(p_mode, 'new'));
  sort_column text;
  eligibility text;
begin
  if normalized_mode not in ('new', 'episode_updates') then
    return;
  end if;

  if normalized_mode = 'new' then
    sort_column := 'created_at';
    eligibility := format(
      'and movie.year between %s and %s',
      extract(year from current_date)::integer - 1,
      extract(year from current_date)::integer + 1
    );
  else
    sort_column := 'last_episode_change_at';
    eligibility := format(
      'and movie.year between %s and %s
       and movie.last_episode_change_at is not null
       and (
         (coalesce(movie.current_episode, 0) > 0
           and (coalesce(movie.total_episodes, 0) = 0
             or movie.current_episode < movie.total_episodes)
           and lower(coalesce(movie.episode_current, '''')) not like ''%%hoàn tất%%''
           and lower(coalesce(movie.episode_current, '''')) not like ''%%hoan tat%%''
           and lower(coalesce(movie.episode_current, '''')) not in (''full'', ''full hd'', ''end''))
         or movie.last_episode_change_at > coalesce(movie.created_at, movie.published_at, timestamptz ''epoch'') + interval ''6 hours''
       )',
      extract(year from current_date)::integer - 1,
      extract(year from current_date)::integer + 1
    );
  end if;

  return query execute format($query$
    with filtered as materialized (
      select movie.*, movie.%1$I as feed_sort_at
      from public.movies movie
      where movie.is_published is true
        and lower(coalesce(movie.seo_catalog_status, 'published')) not in ('hidden', 'draft', 'superseded')
        and movie.superseded_by_movie_id is null
        %2$s
    ), total as (
      select count(*)::bigint as total_count from filtered
    ), candidates as (
      select *
      from filtered
      order by feed_sort_at desc nulls last, id
      limit $1 offset $2
    )
    select
      to_jsonb(candidate)
        || jsonb_build_object('id', candidate.id, 'updated_at', candidate.feed_sort_at, 'feed_sort_at', candidate.feed_sort_at),
      total.total_count
    from candidates candidate
    cross join total
    order by candidate.feed_sort_at desc nulls last, candidate.id
  $query$, sort_column, eligibility)
  using greatest(1, least(coalesce(p_limit, 36), 72)), greatest(0, coalesce(p_offset, 0));
end;
$function$;

-- Test the deployed implementation against the previous exact-output contract.
do $load$ begin
 execute replace(pg_get_functiondef('public.get_stable_catalog_feed(text,integer,integer)'::regprocedure),
 'public.get_stable_catalog_feed(', 'pg_temp.incident_new_feed(');
end; $load$;
do $verify$
declare c record; a jsonb; b jsonb;
begin
 for c in select * from (values ('new',36,0),('episode_updates',36,0),('new',72,36),('episode_updates',1,360),('invalid',36,0),('new',36,999999)) cases(mode,lim,off) loop
 select jsonb_agg(to_jsonb(r)) into a from pg_temp.incident_old_feed(c.mode,c.lim,c.off) r;
 select jsonb_agg(to_jsonb(r)) into b from pg_temp.incident_new_feed(c.mode,c.lim,c.off) r;
 if a is distinct from b then raise exception 'Feed mismatch: %',c; end if;
 end loop;
end;
$verify$;
create temp table incident_feed_benchmark(mode text, variant text, elapsed_ms numeric, temp_written_blocks bigint);
do $bench$
declare m text; variant text; plan jsonb;
begin
 foreach m in array array['new','episode_updates'] loop
 foreach variant in array array['old','new'] loop
 execute format('explain (analyze,buffers,format json) select * from pg_temp.incident_%s_feed(%L,36,0)',variant,m) into plan;
 insert into incident_feed_benchmark values(m,variant,(plan->0->>'Execution Time')::numeric,(plan->0->'Plan'->>'Temp Written Blocks')::bigint);
 end loop;
 end loop;
 if exists(select 1 from incident_feed_benchmark b where b.variant='new' and b.temp_written_blocks>0) then raise exception 'New feed spilled to disk'; end if;
end;
$bench$;
select jsonb_agg(t) benchmarks from incident_feed_benchmark t;
rollback;
