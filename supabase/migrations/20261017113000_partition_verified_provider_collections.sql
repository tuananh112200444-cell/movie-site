begin;
set local lock_timeout='3s';set local statement_timeout='20s';
-- Only reviewed ranges may bridge aggregate numbering and per-season numbering.
create table private.verified_season_partitions (
 collection_movie_id uuid not null references public.movies(id),
 target_movie_id uuid not null references public.movies(id),
 season integer not null check(season>0),
 first_episode integer not null check(first_episode>0),
 last_episode integer not null check(last_episode>=first_episode),
 evidence jsonb not null check(evidence<>'{}'::jsonb),
 created_at timestamptz not null default now(),
 primary key(collection_movie_id,target_movie_id),
 check(collection_movie_id<>target_movie_id)
);
alter table private.verified_season_partitions enable row level security;
revoke all on private.verified_season_partitions from public,anon,authenticated;
grant select on private.verified_season_partitions to service_role;
create table private.season_partition_stream_ledger (
 source_stream_id uuid not null,target_stream_id uuid not null,
 source_episode text not null,target_episode text not null,
 copied_at timestamptz not null default now(), primary key(source_stream_id,target_stream_id)
);
alter table private.season_partition_stream_ledger enable row level security;
revoke all on private.season_partition_stream_ledger from public,anon,authenticated;
grant select on private.season_partition_stream_ledger to service_role;
create function private.forward_verified_season_stream(s public.streams) returns void
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare p private.verified_season_partitions%rowtype;n integer;ep text;dest uuid;
begin
 if not exists(select 1 from private.verified_season_partitions where collection_movie_id=s.movie_id) then return;end if;
 n:=((regexp_match(lower(s.episode_slug),'^(?:tap|ep|episode)[-_ ]*0*([0-9]+)(?:$|[-_])'))[1])::integer;
 if n is null then return;end if;
 for p in select * from private.verified_season_partitions where collection_movie_id=s.movie_id and n between first_episode and last_episode loop
  if not exists(select 1 from movies m where m.id=p.target_movie_id and m.superseded_by_movie_id is null
   and private.movie_season_signature(to_jsonb(m))=jsonb_build_object('scope','season','season',p.season)) then continue;end if;
  ep:='tap-'||(n-p.first_episode+1)::text;
  insert into streams(movie_id,episode_slug,source,server_name,stream_url,embed_url,subtitle_url,quality,priority,is_active,health_status,last_error,audio_type)
  values(p.target_movie_id,ep,s.source,s.server_name,s.stream_url,s.embed_url,s.subtitle_url,s.quality,s.priority,s.is_active,'unchecked','Reviewed season partition; playback verification pending',s.audio_type)
  on conflict(movie_id,episode_slug,source,server_name) do update set
   stream_url=excluded.stream_url,embed_url=excluded.embed_url,
   health_status='unchecked',last_checked_at=null,failure_count=0,
   last_error=excluded.last_error,updated_at=now()
  where streams.stream_url is distinct from excluded.stream_url or streams.embed_url is distinct from excluded.embed_url
  returning id into dest;
  if dest is null then select id into dest from streams where movie_id=p.target_movie_id and episode_slug=ep and source=s.source and server_name=s.server_name;end if;
  insert into private.season_partition_stream_ledger values(s.id,dest,s.episode_slug,ep,now()) on conflict do nothing;
  delete from movie_api_cache where slug=(select slug from movies where id=p.target_movie_id);
 end loop;
end;$$;
create function private.forward_verified_season_stream_trigger() returns trigger
language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
 if tg_op='UPDATE' and new.stream_url is not distinct from old.stream_url and new.embed_url is not distinct from old.embed_url and new.episode_slug=old.episode_slug then return new;end if;
 perform private.forward_verified_season_stream(new);return new;
end;$$;
create trigger streams_forward_reviewed_seasons after insert or update of stream_url,embed_url,episode_slug on public.streams
for each row execute function private.forward_verified_season_stream_trigger();

-- Verified provider payload: 1-Phan 1, 110-Phan 2; KKPhim 109 + 50 episodes.
do $$
declare source_id uuid:='87b7a839-6319-487e-beef-9ea0a05c622d'; row public.streams%rowtype;
begin
 if not exists(select 1 from movies where id=source_id and slug='nguonc-gao-nep-gao-te' and year=2018 and type='series') then raise exception 'Collection identity changed';end if;
 if (select count(distinct ((regexp_match(episode_slug,'^tap-([0-9]+)'))[1])::integer) from streams where movie_id=source_id)<>159
  or not exists(select 1 from streams where movie_id=source_id and episode_slug='tap-1-phan-1')
  or not exists(select 1 from streams where movie_id=source_id and episode_slug='tap-110-phan-2') then raise exception 'Collection numbering changed';end if;
 insert into private.verified_season_partitions(collection_movie_id,target_movie_id,season,first_episode,last_episode,evidence) values
 (source_id,'79923108-e253-4203-81a5-6698a0d984c6',1,1,109,'{"provider":"nguonc","boundary":"tap-1-phan-1","kkphim_episodes":109,"reviewed":"2026-10-17"}'),
 (source_id,'8cdae6f5-05f0-4d9d-9b8f-05186de7ae5a',2,110,159,'{"provider":"nguonc","boundary":"tap-110-phan-2","kkphim_episodes":50,"reviewed":"2026-10-17"}');
 update movies set season_scope='aggregate' where id=source_id;
 for row in select * from streams where movie_id=source_id loop perform private.forward_verified_season_stream(row);end loop;
 if (select count(*) from private.season_partition_stream_ledger l join streams s on s.id=l.source_stream_id where s.movie_id=source_id)<>159 then raise exception 'Incomplete season partition';end if;
end;$$;
commit;
