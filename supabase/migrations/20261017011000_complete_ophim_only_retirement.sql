-- OPhim-only retirement. Keep NguonC, canonical movies, aliases and SEO intact.
begin;
set local lock_timeout='3s';
set local statement_timeout='90s';
create schema if not exists private;
create table if not exists private.ophim_retirement_backup (
 table_name text not null,row_id text not null,payload jsonb not null,
 archived_at timestamptz not null default now(),
 primary key(table_name,row_id)
);
revoke all on private.ophim_retirement_backup from public,anon,authenticated;

-- Match provider tokens and URL HOSTS, never the substring in khophim-r2 or URL paths.
create or replace function public.is_retired_playback_source(
 p_source text,p_server_name text,p_stream_url text,p_embed_url text
) returns boolean language sql immutable parallel safe as $fn$
 select lower(trim(coalesce(p_source,''))) in ('ophim','ophim1.com','opstream','ophim.cc','ophim.me')
 or lower(coalesce(p_server_name,'')) ~ '(^|[^a-z0-9])ophim([^a-z0-9]|$)|(^|[^a-z0-9])opstream([^a-z0-9]|$)'
 or lower(coalesce(p_stream_url,'')) ~ '^https?://([^/?#]+\.)?(ophim1\.com|ophim\.cc|ophim\.me|opstream[0-9]*\.[a-z.]+)(:[0-9]+)?([/?#]|$)'
 or lower(coalesce(p_embed_url,'')) ~ '^https?://([^/?#]+\.)?(ophim1\.com|ophim\.cc|ophim\.me|opstream[0-9]*\.[a-z.]+)(:[0-9]+)?([/?#]|$)';
$fn$;
insert into public.retired_playback_providers(provider,reason,aliases)
 values('ophim','Confirmed retired OPhim transport; canonical movies and other providers retained.',array['ophim1.com','ophim.cc','ophim.me','opstream'])
 on conflict(provider) do update set reason=excluded.reason,aliases=excluded.aliases;
update public.provider_operational_policy set ingest_enabled=false,playback_mode='disabled',playback_penalty=100000,
 reason='OPhim retired; preserve NguonC and canonical movie catalogue',updated_at=now()
 where provider='ophim';
do $jobs$ declare j record;begin
 for j in select jobid from cron.job
 where jobname='sync-ophim-priority-every-15-minutes'
 or lower(command) ~ 'provider=ophim([&'' ]|$)' loop
 perform cron.alter_job(j.jobid,active:=false);
 end loop;
 -- The capacity guard must never re-enable the permanently retired ingest.
 delete from public.runtime_capacity_managed_jobs where job_name='sync-ophim-priority-every-15-minutes';
end;$jobs$;

create or replace function private.archive_retired_ophim_batch(p_limit integer default 500)
returns jsonb language plpgsql security invoker set search_path=public,private,pg_catalog,pg_temp as $batch$
declare n integer:=greatest(1,least(coalesce(p_limit,500),500));s integer;e integer;m integer;src integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('ophim-only-retirement-v2',0)) then return jsonb_build_object('busy',true);end if;
 with candidates as materialized (
  select * from public.streams where public.is_retired_playback_source(coalesce(provider_key,source),server_name,stream_url,embed_url)
  and coalesce(provider_key,source,'') not in ('nguonc','khophim-r2') limit n for update skip locked
 ), archived as (
  insert into private.ophim_retirement_backup(table_name,row_id,payload)
  select 'streams',id::text,to_jsonb(c) from candidates c
  on conflict do nothing returning row_id
 ) delete from public.streams where id in(select id from candidates)
 and (exists(select 1 from private.ophim_retirement_backup b where b.table_name='streams' and b.row_id=streams.id::text) or streams.id::text in(select row_id from archived));
 get diagnostics s=row_count;
 with candidates as materialized (
  select * from public.movie_episodes where public.is_retired_playback_source(source,server_name,link_m3u8,link_embed)
  and coalesce(source,'') not in ('nguonc','khophim-r2') limit n for update skip locked
 ), archived as (
  insert into private.ophim_retirement_backup(table_name,row_id,payload)
  select 'movie_episodes',id::text,to_jsonb(c) from candidates c on conflict do nothing returning row_id
 ) delete from public.movie_episodes where id in(select id from candidates)
 and (exists(select 1 from private.ophim_retirement_backup b where b.table_name='movie_episodes' and b.row_id=movie_episodes.id::text) or movie_episodes.id::text in(select row_id from archived));
 get diagnostics m=row_count;
 with candidates as materialized (
  select * from public.episodes where public.is_retired_playback_source('',server_name,link_m3u8,link_embed)
  limit n for update skip locked
 ), archived as (
  insert into private.ophim_retirement_backup(table_name,row_id,payload)
  select 'episodes',id::text,to_jsonb(c) from candidates c on conflict do nothing returning row_id
 ) delete from public.episodes where id in(select id from candidates)
 and (exists(select 1 from private.ophim_retirement_backup b where b.table_name='episodes' and b.row_id=episodes.id::text) or episodes.id::text in(select row_id from archived));
 get diagnostics e=row_count;
 with candidates as materialized (
  select * from public.movie_sources where lower(source_site) in('ophim','ophim1.com','ophim.cc','ophim.me','opstream') and is_active
  limit n for update skip locked
 ), archived as (
  insert into private.ophim_retirement_backup(table_name,row_id,payload)
  select 'movie_sources',id::text,to_jsonb(c) from candidates c on conflict do nothing returning row_id
 ) update public.movie_sources set is_active=false,status='retired',updated_at=now()
 where id in(select id from candidates)
 and (exists(select 1 from private.ophim_retirement_backup b where b.table_name='movie_sources' and b.row_id=movie_sources.id::text)
 or movie_sources.id::text in(select row_id from archived));
 get diagnostics src=row_count;
 return jsonb_build_object('streams',s,'movie_episodes',m,'episodes',e,'sources_disabled',src);
end;$batch$;
revoke all on function private.archive_retired_ophim_batch(integer) from public,anon,authenticated;
commit;
