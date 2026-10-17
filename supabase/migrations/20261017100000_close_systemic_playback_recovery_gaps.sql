begin;
set local lock_timeout='3s';set local statement_timeout='25s';
-- An indexed, narrow alternative when providers use different original titles.
create index if not exists movies_localized_playback_identity_idx
on public.movies(year,public.kp_search_normalize(split_part(name,'/',1)))
where superseded_by_movie_id is null;
create function private.localized_cast_playback_match(a public.movies,b public.movies)
returns boolean language sql stable set search_path=public,pg_temp as $$
select coalesce(a.id<>b.id and a.year between 1888 and 2200 and a.year=b.year
 and public.canonical_movie_type(a.type)<>'' and public.canonical_movie_type(a.type)=public.canonical_movie_type(b.type)
 and a.superseded_by_movie_id is null and b.superseded_by_movie_id is null
 and lower(coalesce(a.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and lower(coalesce(b.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and length(public.kp_search_normalize(split_part(a.name,'/',1)))>=5
 and public.kp_search_normalize(split_part(a.name,'/',1))=public.kp_search_normalize(split_part(b.name,'/',1))
 and not (coalesce(a.tmdb_id,0)>0 and coalesce(b.tmdb_id,0)>0 and a.tmdb_id<>b.tmdb_id)
 and not (nullif(a.imdb_id,'') is not null and nullif(b.imdb_id,'') is not null and a.imdb_id<>b.imdb_id)
 and (select count(distinct public.kp_search_normalize(actor_a)) from unnest(a.actor) actor_a
   where length(public.kp_search_normalize(actor_a))>=3 and exists(select 1 from unnest(b.actor) actor_b
    where public.kp_search_normalize(actor_b)=public.kp_search_normalize(actor_a)))>=2
 and (public.canonical_movie_type(a.type)='single' or (
  public.canonical_season_number(concat_ws(' ',a.origin_name,a.title_original,a.name),a.season_number)>0
  and public.canonical_season_number(concat_ws(' ',a.origin_name,a.title_original,a.name),a.season_number)
   =public.canonical_season_number(concat_ws(' ',b.origin_name,b.title_original,b.name),b.season_number))),false);
$$;
revoke all on function private.localized_cast_playback_match(public.movies,public.movies) from public,anon,authenticated;

create table private.local_playback_audit_results(
 run_key text not null,original_movie_id uuid not null,canonical_movie_id uuid not null,
 episode_slug text,verdict text not null,checked_at timestamptz not null,imported_at timestamptz not null default now(),
 primary key(run_key,original_movie_id)
);
revoke all on private.local_playback_audit_results from public,anon,authenticated;
create function public.import_local_playback_audit(p_run_key text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare imported integer:=0;queued integer:=0;
begin
 if p_run_key!~'^[a-zA-Z0-9_-]{5,80}$' or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>200 then
  raise exception 'Invalid bounded local audit batch';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where x->>'verdict' not in
  ('verified_media_sample','unverified','failed_probes','no_stored_source')) then raise exception 'Unsupported local audit verdict';end if;
 with recursive input as materialized(
  select (x->>'movie_id')::uuid original_id,nullif(x->>'episode_slug','') episode,x->>'verdict' verdict,(x->>'checked_at')::timestamptz checked_at
  from jsonb_array_elements(p_items) x
 ), resolved as(
  select i.*,m.id,m.superseded_by_movie_id,array[m.id] path from input i join movies m on m.id=i.original_id
  union all select r.original_id,r.episode,r.verdict,r.checked_at,m.id,m.superseded_by_movie_id,r.path||m.id
  from resolved r join movies m on m.id=r.superseded_by_movie_id
  where cardinality(r.path)<16 and not m.id=any(r.path)
 ), recorded as(
  insert into private.local_playback_audit_results(run_key,original_movie_id,canonical_movie_id,episode_slug,verdict,checked_at)
  select p_run_key,original_id,id,episode,verdict,checked_at from resolved where superseded_by_movie_id is null
   and checked_at<=now()+interval '5 minutes'
  on conflict do nothing returning *
 ), eligible as materialized(
  select distinct on(m.id) m.id,r.episode_slug,m.is_published
  from recorded r join movies m on m.id=r.canonical_movie_id
  where r.verdict<>'verified_media_sample' and r.checked_at>now()-interval '7 days'
   and not public.movie_is_preview_only(m)
   and lower(coalesce(m.seo_catalog_status,'')) not in ('hidden','draft','superseded')
  order by m.id,r.checked_at desc,r.episode_slug
 ), enqueued as(
  insert into playback_recovery_queue as q(movie_id,priority,requested_episode,next_attempt_at)
  select id,case when is_published then 4 else 3 end,episode_slug,now() from eligible
  on conflict(movie_id) do update set priority=greatest(q.priority,excluded.priority),
   requested_episode=coalesce(q.requested_episode,excluded.requested_episode),
   next_attempt_at=least(q.next_attempt_at,excluded.next_attempt_at)
  returning movie_id
 ) select (select count(*) from recorded),(select count(*) from enqueued) into imported,queued;
 return jsonb_build_object('imported',imported,'queued',queued,'does_not_mark_streams_dead',true);
end;$$;
revoke all on function public.import_local_playback_audit(text,jsonb) from public,anon,authenticated;
grant execute on function public.import_local_playback_audit(text,jsonb) to service_role;

create or replace function public.recover_sibling_playback_sources(p_movie_id uuid,p_episode text default '',p_limit integer default 6)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare n integer:=0;
begin
 if not exists(select 1 from runtime_capacity_state where singleton and mode='normal') then
  return jsonb_build_object('added',0,'status','capacity_protect');
 end if;
 if not pg_try_advisory_xact_lock(hashtextextended('sibling-source:'||p_movie_id,0)) then
  return jsonb_build_object('added',0,'status','already_running');
 end if;
 with requested as materialized(select * from movies where id=p_movie_id), donors as materialized (
  select distinct donor.id from canonicalization_candidates c
  cross join lateral unnest(c.movie_ids) member(id)
  join movies target on target.id=p_movie_id
  join movies donor on donor.id=member.id
  where p_movie_id=any(c.movie_ids) and c.confidence_tier='A' and c.status='ready'
   and private.strict_playback_siblings(target,donor)
  union
  select donor.id from requested target join movies donor
   on donor.year=target.year and donor.superseded_by_movie_id is null
   and public.kp_search_normalize(split_part(donor.name,'/',1))=public.kp_search_normalize(split_part(target.name,'/',1))
  where private.localized_cast_playback_match(target,donor)
 ), candidates as materialized (
  select distinct on(s.source,s.stream_url,private.recovery_episode_key(s.episode_slug)) s.*
  from donors d join streams s on s.movie_id=d.id
  where s.is_active=true and s.health_status not in ('dead','failed')
   and s.source in ('phimapi','kkphim','vsmov','nguonc','blvietsub','khophim-r2')
   and s.stream_url ~* '^https://[^/]+/.+\.m3u8([?#]|$)'
   and (coalesce(p_episode,'')='' or private.recovery_episode_key(s.episode_slug)=private.recovery_episode_key(p_episode))
   and not exists(select 1 from streams existing where existing.movie_id=p_movie_id
    and existing.source=s.source and existing.stream_url=s.stream_url
    and private.recovery_episode_key(existing.episode_slug)=private.recovery_episode_key(s.episode_slug))
  order by s.source,s.stream_url,private.recovery_episode_key(s.episode_slug),s.priority desc,s.id
  limit greatest(1,least(coalesce(p_limit,6),12))
 ), inserted as (
  insert into streams(movie_id,episode_slug,source,server_name,stream_url,embed_url,quality,priority,is_active,
   health_status,failure_count,last_error,last_checked_at,updated_at,ophim_id,audio_type,subtitle_url)
  select p_movie_id,episode_slug,source,server_name,stream_url,embed_url,quality,priority,true,
   'unchecked',0,'Provider verification pending: sibling source',null,now(),ophim_id,audio_type,subtitle_url
  from candidates on conflict(movie_id,episode_slug,source,server_name) do nothing
  returning id,source,server_name,episode_slug,stream_url
 ), logged as (
  insert into private.sibling_source_recovery_ledger(stream_id,target_movie_id,donor_movie_id,donor_stream_id,source_url)
  select i.id,p_movie_id,c.movie_id,c.id,i.stream_url from inserted i join candidates c
   on c.source=i.source and c.server_name=i.server_name and c.episode_slug=i.episode_slug and c.stream_url=i.stream_url
  on conflict do nothing returning stream_id
 ) select count(*) into n from logged;
 if n>0 then delete from movie_api_cache where slug=(select slug from movies where id=p_movie_id);end if;
 return jsonb_build_object('added',n,'requires_media_probe',true);
end;$$;

CREATE OR REPLACE FUNCTION public.claim_system_brain_tasks(p_brain text, p_limit integer DEFAULT 1)
 RETURNS TABLE(task_key text, handler text, params jsonb, attempts bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
begin
  if p_brain not in ('catalog', 'playback') then
    raise exception 'Unsupported brain: %', p_brain using errcode = '22023';
  end if;

  return query
  with candidates as materialized (
    select task.task_key
    from public.system_brain_tasks task
    where task.brain = p_brain
      and task.enabled is true
      and task.next_run_at <= now()
      and (task.lease_until is null or task.lease_until <= now())
    order by task.next_run_at asc, task.priority desc, task.task_key
    for update of task skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 2))
  ), claimed as (
    update public.system_brain_tasks task
    set status = 'running',
        lease_until = now() + interval '3 minutes',
        last_started_at = now(),
        attempts = task.attempts + 1,
        updated_at = now()
    from candidates candidate
    where task.task_key = candidate.task_key
    returning task.task_key, task.handler, task.params, task.attempts
  )
  select claimed.task_key, claimed.handler, claimed.params, claimed.attempts
  from claimed
  order by claimed.task_key;
end;
$function$
;

create or replace function public.claim_playback_source_recovery() returns jsonb
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
 order by (queue.priority=5) desc,movie.is_published desc,queue.priority desc,queue.next_attempt_at,queue.movie_id
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


commit;
