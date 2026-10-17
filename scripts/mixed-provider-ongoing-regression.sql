begin;set local lock_timeout='3s';set local statement_timeout='10s';
do $$
declare target uuid:='77bdca05-5d81-4e4a-bfc5-046dc760db26';
begin
 if not exists(select 1 from movies where id=target and source_site='vsmov' and current_episode=4) then raise exception 'Unexpected target fixture state';end if;
 delete from kkphim_ongoing_refresh_queue where movie_id=target;
 update movies set current_episode=current_episode where id=target;
 if not exists(select 1 from kkphim_ongoing_refresh_queue where movie_id=target) then raise exception 'Mixed source ongoing row not enrolled';end if;
 update movies set status='completed' where id=target;
 if exists(select 1 from kkphim_ongoing_refresh_queue where movie_id=target) then raise exception 'Completed movie queued';end if;
end;$$;
rollback;
