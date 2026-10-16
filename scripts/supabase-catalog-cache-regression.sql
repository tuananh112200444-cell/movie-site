-- Compare both cached and uncached page paths using one consistent database snapshot.
begin isolation level repeatable read;set local lock_timeout='3s';set local statement_timeout='30s';
refresh materialized view concurrently public.catalog_feed_page_cache;
do $check$ declare m text;off integer;a jsonb;b jsonb;begin
 foreach m in array array['new','episode_updates'] loop
 foreach off in array array[0,36,72,108,144,180] loop
 select jsonb_agg(to_jsonb(r)) into a from public.compute_stable_catalog_feed(m,36,off) r;
 select jsonb_agg(to_jsonb(r)) into b from public.get_stable_catalog_feed(m,36,off) r;
 if a is distinct from b then raise exception 'Feed cache mismatch % %',m,off;end if;
 end loop;end loop;end;$check$;
explain(analyze,buffers,format json) select * from public.get_stable_catalog_feed('new',36,0);
rollback;
