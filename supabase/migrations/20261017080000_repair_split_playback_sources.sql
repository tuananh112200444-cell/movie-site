begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create table private.sibling_source_recovery_ledger (
 stream_id uuid primary key,
 target_movie_id uuid not null,
 donor_movie_id uuid not null,
 donor_stream_id uuid not null,
 source_url text not null,
 created_at timestamptz not null default now()
);
create table private.sibling_source_seed_cursor (
 singleton boolean primary key default true check(singleton),
 candidate_key text not null default '',cycles bigint not null default 0
);
insert into private.sibling_source_seed_cursor(singleton) values(true);
-- Strict identity check is evaluated against current rows, not just an old
-- duplicate candidate. Ambiguous seasons and conflicting external IDs fail.
create function private.strict_playback_siblings(a public.movies,b public.movies)
returns boolean language sql stable set search_path=public,pg_temp as $$
select coalesce(
 a.id<>b.id and a.year between 1888 and 2200 and a.year=b.year
 and public.canonical_movie_type(a.type)<>''
 and public.canonical_movie_type(a.type)=public.canonical_movie_type(b.type)
 and a.superseded_by_movie_id is null and b.superseded_by_movie_id is null
 and lower(coalesce(a.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and lower(coalesce(b.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and not (coalesce(a.tmdb_id,0)>0 and coalesce(b.tmdb_id,0)>0 and a.tmdb_id<>b.tmdb_id)
 and not (nullif(a.imdb_id,'') is not null and nullif(b.imdb_id,'') is not null and a.imdb_id<>b.imdb_id)
 and (
  (coalesce(a.tmdb_id,0)>0 and a.tmdb_id=b.tmdb_id)
  or (nullif(a.imdb_id,'') is not null and a.imdb_id=b.imdb_id)
  or (
   length(public.kp_search_normalize(coalesce(nullif(a.origin_name,''),nullif(a.title_original,''),a.original_title)))>=5
   and public.kp_search_normalize(coalesce(nullif(a.origin_name,''),nullif(a.title_original,''),a.original_title))
    =public.kp_search_normalize(coalesce(nullif(b.origin_name,''),nullif(b.title_original,''),b.original_title))
  )
 )
 and (public.canonical_movie_type(a.type)='single' or (
  public.canonical_season_number(concat_ws(' ',a.origin_name,a.title_original,a.name),a.season_number)>0
  and public.canonical_season_number(concat_ws(' ',a.origin_name,a.title_original,a.name),a.season_number)
   =public.canonical_season_number(concat_ws(' ',b.origin_name,b.title_original,b.name),b.season_number)
 )),false);
$$;
create function private.recovery_episode_key(value text) returns text
language sql immutable as $$
select case when lower(trim(coalesce(value,''))) in ('full','full-hd','hoan-tat') then '1'
 when lower(trim(value)) ~ '^(?:(?:tap|ep|episode)[-_ ]*)?0*[0-9]+$'
 then coalesce(nullif(ltrim(regexp_replace(lower(trim(value)),'^(?:tap|ep|episode)[-_ ]*',''),'0'),''),'0')
 else lower(trim(value)) end;
$$;
create function public.recover_sibling_playback_sources(p_movie_id uuid,p_episode text default '',p_limit integer default 6)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare n integer:=0;
begin
 if not exists(select 1 from runtime_capacity_state where singleton and mode='normal') then
  return jsonb_build_object('added',0,'status','capacity_protect');
 end if;
 if not pg_try_advisory_xact_lock(hashtextextended('sibling-source:'||p_movie_id,0)) then
  return jsonb_build_object('added',0,'status','already_running');
 end if;
 with donors as materialized (
  select distinct donor.id from canonicalization_candidates c
  cross join lateral unnest(c.movie_ids) member(id)
  join movies target on target.id=p_movie_id
  join movies donor on donor.id=member.id
  where p_movie_id=any(c.movie_ids) and c.confidence_tier='A' and c.status='ready'
   and private.strict_playback_siblings(target,donor)
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
create function public.seed_split_playback_recovery(p_limit integer default 20)
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $$
declare n integer;cursor_value text;last_key text;
begin
 if not exists(select 1 from runtime_capacity_state where singleton and mode='normal') then return 0;end if;
 select candidate_key into cursor_value from private.sibling_source_seed_cursor where singleton for update skip locked;
 if not found then return 0;end if;
 -- Walk a bounded number of candidate groups. Do not rejoin the whole
 -- duplicate catalogue to streams on every five-minute worker invocation.
 select max(candidate_key) into last_key from (
  select candidate_key from canonicalization_candidates where confidence_tier='A' and status='ready'
   and candidate_key>cursor_value and cardinality(movie_ids)<=20
  order by candidate_key limit greatest(1,least(coalesce(p_limit,20),200))
 ) batch;
 if last_key is null then
  update private.sibling_source_seed_cursor set candidate_key='',cycles=cycles+1 where singleton;return 0;
 end if;
 with groups as materialized (
  select * from canonicalization_candidates where confidence_tier='A' and status='ready'
   and candidate_key>cursor_value and candidate_key<=last_key and cardinality(movie_ids)<=20
 ), targets as materialized (
  select distinct target.id,target.is_published
  from groups c cross join lateral unnest(c.movie_ids) member(id)
  join movies target on target.id=member.id
  where c.confidence_tier='A' and c.status='ready'
   and not public.movie_is_preview_only(target)
   and not exists(select 1 from playback_recovery_queue q where q.movie_id=target.id)
   and not exists(select 1 from streams own where own.movie_id=target.id and own.is_active=true
    and own.health_status='ok' and own.stream_url ~* '\.m3u8([?#]|$)')
   and exists(select 1 from movies donor join streams s on s.movie_id=donor.id
    where donor.id=any(c.movie_ids) and private.strict_playback_siblings(target,donor)
     and s.is_active=true and s.health_status not in ('dead','failed')
     and s.source in ('phimapi','kkphim','vsmov','nguonc','blvietsub','khophim-r2')
     and s.stream_url ~* '^https://[^/]+/.+\.m3u8([?#]|$)')
  order by target.is_published desc,target.id limit 200
 ) insert into playback_recovery_queue(movie_id,priority)
 select id,case when is_published then 4 else 3 end from targets on conflict do nothing;
 get diagnostics n=row_count;
 update private.sibling_source_seed_cursor set candidate_key=last_key where singleton;
 return n;
end;$$;
revoke all on function private.strict_playback_siblings(public.movies,public.movies),private.recovery_episode_key(text) from public,anon,authenticated;
revoke all on function public.recover_sibling_playback_sources(uuid,text,integer),public.seed_split_playback_recovery(integer) from public,anon,authenticated;
grant execute on function public.recover_sibling_playback_sources(uuid,text,integer),public.seed_split_playback_recovery(integer) to service_role;
commit;
