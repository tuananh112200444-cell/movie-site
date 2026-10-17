do $$
declare r record;base_id uuid;first_id uuid;other_id uuid;collection_id uuid;merged jsonb;a movies%rowtype;b movies%rowtype;
begin
 select * into r from resolve_canonical_movie('firstreg','base-fixture','',null,'','Original Bridge Tale','Cau Chuyen Kiem Thu',2026,'series',null,'first-reg-base','Test');base_id:=r.movie_id;
 select * into r from resolve_canonical_movie('firstreg','first-fixture','',null,'','Original Bridge Tale (Season 1)','Cau Chuyen Kiem Thu (Phan 1)',2026,'series',1,'first-reg-one','Test');
 if r.movie_id<>base_id then raise exception 'base and season1 still create different records';end if;
 select * into r from resolve_canonical_movie('firstreg','second-fixture','',null,'','Original Bridge Tale (Season 2)','Cau Chuyen Kiem Thu (Phan 2)',2026,'series',2,'first-reg-two','Test');
 if r.movie_id=base_id then raise exception 'season2 collapsed';end if;
 select * into r from resolve_canonical_movie('firstreg','aggregate-fixture','',null,'','Original Bridge Tale','Cau Chuyen Kiem Thu',2026,'series',-1,'first-reg-all','Test');
 if r.movie_id=base_id then raise exception 'aggregate collapsed';end if;
 -- Existing duplicate rows: validate preserving merge rather than hide a result.
 insert into movies(slug,name,origin_name,year,type,season_scope,season_number,is_published,seo_catalog_status,total_episodes)
 values('first-reg-duplicate-base','Merge Fixture','Original Merge Fixture',2026,'series','unknown',null,false,'awaiting_playback',10) returning id into base_id;
 insert into movies(slug,name,origin_name,year,type,season_scope,season_number,is_published,seo_catalog_status,total_episodes)
 values('first-reg-duplicate-one','Merge Fixture (Phan 1)','Original Merge Fixture (Season 1)',2026,'series','season',1,false,'awaiting_playback',10) returning id into first_id;
 select * into a from movies where id=base_id;select * into b from movies where id=first_id;
 if not private.safe_implicit_first_season_siblings(a,b) then raise exception 'verified first season bridge rejected';end if;
 a.total_episodes:=20;
 if private.safe_implicit_first_season_siblings(a,b) then raise exception 'larger aggregate accepted';end if;
 a.total_episodes:=10;b.year:=2025;
 if private.safe_implicit_first_season_siblings(a,b) then raise exception 'different year accepted';end if;
 b.year:=2026;b.tmdb_id:=1;a.tmdb_id:=2;
 if private.safe_implicit_first_season_siblings(a,b) then raise exception 'conflicting external IDs accepted';end if;
 insert into streams(movie_id,episode_slug,source,server_name,stream_url,embed_url,health_status)
 values(base_id,'tap-1','firstreg','Base','https://example.invalid/base.m3u8','','unchecked'),(first_id,'tap-01','firstreg','First','https://example.invalid/first.m3u8','','unchecked');
 insert into canonicalization_candidates(candidate_key,identity_kind,identity_value,release_year,movie_type,season_number,movie_ids,confidence_tier,status)
 values('implicit-first:regression','implicit_first_season','fixture',2026,'series',1,array[base_id,first_id],'A','ready');
 merged:=merge_canonicalization_candidate('implicit-first:regression',first_id,false);
 if not coalesce((merged->>'success')::boolean,false) then raise exception 'merge failed';end if;
 if not exists(select 1 from movies where id=base_id and superseded_by_movie_id=first_id) then raise exception 'source not retired';end if;
 if (select count(*) from streams where movie_id=first_id and source='firstreg')<>2 then raise exception 'sources not preserved';end if;
 if not exists(select 1 from movie_slug_aliases where alias_slug='first-reg-duplicate-base' and movie_id=first_id) then raise exception 'old route not preserved';end if;
 if not exists(select 1 from canonical_merge_archive where source_movie_id=base_id) then raise exception 'rollback archive missing';end if;
end;$$;

