-- Durable, sampled media verification. No catalog-wide publication changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create table public.playback_recovery_queue (
 movie_id uuid primary key references public.movies(id) on delete cascade,
 priority smallint not null default 2,
 requested_episode text,
 episode_cursor text not null default '',
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 attempts integer not null default 0,
 last_finished_at timestamptz,
 outcome text,
 evidence jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index playback_recovery_due_idx on public.playback_recovery_queue(next_attempt_at,priority desc,movie_id);
alter table public.playback_recovery_queue enable row level security;
revoke all on public.playback_recovery_queue from public,anon,authenticated;
grant select on public.playback_recovery_queue to service_role;
create table private.playback_recovery_scan (
 singleton boolean primary key default true check(singleton),
 published_phase boolean not null default true,
 cursor_id uuid not null default '00000000-0000-0000-0000-000000000000',
 lease_token uuid,
 lease_until timestamptz,
 scanned bigint not null default 0,
 cycles bigint not null default 0
);
insert into private.playback_recovery_scan(singleton) values(true);

create function public.enqueue_playback_source_failures(p_items jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>150 then
  raise exception 'Expected a bounded failure batch';
 end if;
 with input as (
  select distinct on (m.id) m.id,coalesce(x->>'episode_slug','') episode
  from jsonb_array_elements(p_items) x
  join movies m on m.id::text=x->>'movie_id'
  where not public.movie_is_preview_only(m)
   and lower(coalesce(m.seo_catalog_status,'')) not in ('hidden','draft','superseded')
  order by m.id,x->>'episode_slug'
 )
 insert into playback_recovery_queue as q(movie_id,priority,requested_episode)
 select id,5,episode from input
 on conflict(movie_id) do update set priority=5,requested_episode=excluded.requested_episode,
  next_attempt_at=case when q.last_finished_at is null then now()
   else least(q.next_attempt_at,greatest(now(),q.last_finished_at+interval '30 minutes')) end;
 get diagnostics n=row_count;
 return n;
end;$$;

create function public.claim_playback_source_recovery() returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare s private.playback_recovery_scan%rowtype; m public.movies%rowtype;
 q public.playback_recovery_queue%rowtype; token uuid:=gen_random_uuid(); result jsonb; reports jsonb;
begin
 -- The lease covers the complete HTTP repair chain, not just a SQL call.
 if not pg_try_advisory_xact_lock(hashtext('bounded-playback-source-recovery')) then return null; end if;
 if not exists(select 1 from runtime_capacity_state where singleton and mode='normal')
  or (select count(*) from pg_stat_activity where backend_type='client backend' and state='active' and pid<>pg_backend_pid())>=5
 then return null; end if;
 select * into s from private.playback_recovery_scan where singleton for update;
 if s.lease_until>now() then return null; end if;
 -- Bounded recent viewer evidence takes precedence over catalog sampling.
 with recent as materialized (
  select movie_slug,episode_slug from player_error_events
  where created_at>now()-interval '30 minutes'
   and event_type in ('stall_fatal','hls_fatal','hls_fatal_retry','direct_video_error','native_hls_error','iframe_blocked')
  order by created_at desc limit 100
 ), grouped as (
  select movie_slug,episode_slug from recent group by 1,2 having count(*)>=3
 )
 select jsonb_agg(jsonb_build_object('movie_id',movie.id,'episode_slug',g.episode_slug)) into reports
 from grouped g join movies movie on movie.slug=g.movie_slug;
 if reports is not null then perform public.enqueue_playback_source_failures(reports); end if;
 -- Also bring known missing-source films into the same recovery loop.
 insert into playback_recovery_queue(movie_id,priority)
 select movie.id,3 from catalog_integrity_issues issue join movies movie on movie.id=issue.movie_id
 where issue.status='open' and issue.issue_type='published_without_playback'
  and movie.is_published=true and not public.movie_is_preview_only(movie)
  and lower(coalesce(movie.seo_catalog_status,'')) not in ('hidden','draft','superseded')
  and not exists(select 1 from playback_recovery_queue existing where existing.movie_id=movie.id)
 order by issue.first_detected_at limit 1 on conflict do nothing;
 -- One indexed keyset step per invocation. Published films are scanned first.
 select movie.* into m from movies movie
 where movie.id>s.cursor_id and movie.is_published=s.published_phase
  and lower(coalesce(movie.seo_catalog_status,'')) not in ('hidden','draft','superseded')
  and not public.movie_is_preview_only(movie)
 order by movie.id limit 1;
 if found then
  insert into playback_recovery_queue(movie_id,priority) values(m.id,case when m.is_published then 2 else 1 end)
   on conflict do nothing;
  update private.playback_recovery_scan set cursor_id=m.id,scanned=scanned+1 where singleton;
 else
  update private.playback_recovery_scan set published_phase=not published_phase,
   cursor_id='00000000-0000-0000-0000-000000000000',cycles=cycles+case when published_phase then 0 else 1 end
   where singleton;
 end if;
 select queue.* into q from playback_recovery_queue queue join movies movie on movie.id=queue.movie_id
 where queue.next_attempt_at<=now() and (queue.lease_until is null or queue.lease_until<=now())
  and lower(coalesce(movie.seo_catalog_status,'')) not in ('hidden','draft','superseded')
  and not public.movie_is_preview_only(movie)
 order by (queue.priority=5) desc, queue.next_attempt_at,queue.priority desc,queue.movie_id
 for update of queue skip locked limit 1;
 if not found then return null; end if;
 update playback_recovery_queue set lease_token=token,lease_until=now()+interval '3 minutes',attempts=attempts+1
  where movie_id=q.movie_id;
 update private.playback_recovery_scan set lease_token=token,lease_until=now()+interval '3 minutes' where singleton;
 select jsonb_build_object('movie_id',q.movie_id,'slug',movie.slug,'token',token,
  'requested_episode',q.requested_episode,'episode_cursor',q.episode_cursor,'attempts',q.attempts+1)
 into result from movies movie where movie.id=q.movie_id;
 return result;
end;$$;

create function public.complete_playback_source_recovery(p_movie_id uuid,p_token uuid,p_outcome text,p_episode text,p_evidence jsonb)
returns boolean language plpgsql security definer set search_path=public,private,pg_temp as $$
declare n integer;
begin
 if p_outcome not in ('verified_sample','recovered_sample','pending_browser','no_source','retry') then
  raise exception 'Unsupported playback outcome';
 end if;
 update playback_recovery_queue set outcome=p_outcome,evidence=coalesce(p_evidence,'{}'),
  episode_cursor=case when p_outcome in ('verified_sample','recovered_sample') then coalesce(p_episode,'') else episode_cursor end,
  requested_episode=case when requested_episode=p_episode then null else requested_episode end,
  priority=case when requested_episode is not null and requested_episode<>p_episode then 5 else 2 end,
  next_attempt_at=now()+case
   when requested_episode is not null and requested_episode<>p_episode then interval '5 minutes'
   when p_outcome in ('verified_sample','recovered_sample') then interval '7 days'
   when p_outcome='pending_browser' then interval '6 hours'
   when p_outcome='no_source' then interval '1 day'
   else interval '30 minutes' end,
  lease_token=null,lease_until=null,last_finished_at=now()
 where movie_id=p_movie_id and lease_token=p_token;
 get diagnostics n=row_count;
 if n=1 then
  update private.playback_recovery_scan set lease_token=null,lease_until=null where singleton and lease_token=p_token;
 end if;
 return n=1;
end;$$;
revoke all on function public.enqueue_playback_source_failures(jsonb),public.claim_playback_source_recovery(),
 public.complete_playback_source_recovery(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_playback_source_failures(jsonb),public.claim_playback_source_recovery(),
 public.complete_playback_source_recovery(uuid,uuid,text,text,jsonb) to service_role;
commit;
