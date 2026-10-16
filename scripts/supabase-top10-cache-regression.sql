-- Verify the deployed snapshot has the original ranking, counts and full items.
-- Snapshot refreshes and any data changes in this check are rolled back.
begin isolation level repeatable read;
set local lock_timeout='3s';
set local statement_timeout='25s';
select public.refresh_top10_today_cache();
do $check$
declare expected jsonb; actual jsonb;
begin
  select jsonb_agg(to_jsonb(r) order by r.rank) into expected
  from public.compute_top10_movies_today(10) r;
  select jsonb_agg(to_jsonb(r) order by r.rank) into actual
  from public.get_top10_movies_today(10) r;
  if expected is distinct from actual then
    raise exception 'Cached Top 10 changed the original ranking or payload';
  end if;
  if has_function_privilege('anon','public.compute_top10_movies_today(integer)','execute')
     or has_function_privilege('anon','public.refresh_top10_today_cache()','execute')
     or has_table_privilege('anon','public.movie_top10_today_cache','select') then
    raise exception 'Private aggregation or cache table is exposed to anon';
  end if;
end;
$check$;
explain (analyze,buffers,format json) select * from public.get_top10_movies_today(10);
rollback;
