-- Run after migration; all mutations are rolled back.
begin;
set local statement_timeout='20s';
do $test$
declare w jsonb; movie uuid; result boolean; old_published boolean;
begin
 update private.playback_recovery_scan set lease_until=null,lease_token=null where singleton;
 update runtime_capacity_state set mode='normal' where singleton;
 w:=public.claim_playback_source_recovery();
 if w is null then raise exception 'Expected an eligible verification claim'; end if;
 movie:=(w->>'movie_id')::uuid;
 select is_published into old_published from movies where id=movie;
 if public.claim_playback_source_recovery() is not null then raise exception 'Overlapping workers were admitted'; end if;
 result:=public.complete_playback_source_recovery(movie,gen_random_uuid(),'verified_sample','tap-1','{}');
 if result then raise exception 'Stale completion token accepted'; end if;
 result:=public.complete_playback_source_recovery(movie,(w->>'token')::uuid,'pending_browser','tap-1','{"reason":"region blocked"}');
 if not result then raise exception 'Valid completion rejected'; end if;
 if not exists(select 1 from playback_recovery_queue where movie_id=movie and outcome='pending_browser'
  and next_attempt_at>now()+interval '20 minutes' and lease_until is null) then raise exception 'Backoff not persisted'; end if;
 if (select is_published from movies where id=movie) is distinct from old_published then raise exception 'Probe changed publication'; end if;
 -- Expired invocations are reclaimable, and capacity protection blocks claims.
 update playback_recovery_queue set next_attempt_at=now()-interval '1 day',lease_until=now()-interval '1 second',priority=5 where movie_id=movie;
 w:=public.claim_playback_source_recovery();
 if w is null or (w->>'movie_id')::uuid<>movie then raise exception 'Expired work was not reclaimed'; end if;
 update private.playback_recovery_scan set lease_until=null where singleton;
 update runtime_capacity_state set mode='protect' where singleton;
 if public.claim_playback_source_recovery() is not null then raise exception 'Capacity protect ignored'; end if;
 if has_function_privilege('anon','public.claim_playback_source_recovery()','execute')
  or has_table_privilege('anon','public.playback_recovery_queue','select') then raise exception 'Public recovery access'; end if;
end;$test$;
select 'Recovery queue lease, fencing, retry, capacity, publication and privileges passed' as result;
rollback;
