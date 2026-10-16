begin;
set local lock_timeout='3s';
create or replace function public.enqueue_playback_source_failures(p_items jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>150 then
  raise exception 'Expected a bounded failure batch';
 end if;
 with input as (
  select distinct on (m.id) m.id,nullif(x->>'episode_slug','') episode
  from jsonb_array_elements(p_items) x
  join movies m on m.id=(x->>'movie_id')::uuid
  where not public.movie_is_preview_only(m)
   and lower(coalesce(m.seo_catalog_status,'')) not in ('hidden','draft','superseded')
  order by m.id,x->>'episode_slug'
 )
 insert into playback_recovery_queue as q(movie_id,priority,requested_episode)
 select id,5,episode from input
 on conflict(movie_id) do update set priority=5,requested_episode=coalesce(excluded.requested_episode,q.requested_episode),
  next_attempt_at=case when q.last_finished_at is null then least(q.next_attempt_at,now())
   else least(q.next_attempt_at,greatest(now(),q.last_finished_at+interval '30 minutes')) end;
 get diagnostics n=row_count;
 return n;
end;$$;


update public.playback_recovery_queue set next_attempt_at=least(next_attempt_at,created_at) where attempts=0;
commit;
