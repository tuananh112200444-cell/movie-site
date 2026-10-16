-- Uses a known failing queue item; all changes are rolled back.
begin;set local lock_timeout='3s';set local statement_timeout='20s';
create temp table audit_test_target as select movie_id,attempts from public.movie_playback_audit_queue where last_error like '%missing FROM-clause entry for table%movie_row%' order by attempts desc limit 1;
update public.movie_playback_audit_queue set next_attempt_at=now()-interval '1 minute',requested_at=timestamptz '1970-01-01' where movie_id in(select movie_id from audit_test_target);
select public.process_movie_playback_audit_queue(1) audit_result;
do $test$ begin
 if not exists(select 1 from audit_test_target)then raise exception 'Missing known failing queue fixture';end if;
 if exists(select 1 from movie_playback_audit_queue q join audit_test_target t using(movie_id))then raise exception 'Known failing queue item was not processed';end if;
end;$test$;
rollback;
