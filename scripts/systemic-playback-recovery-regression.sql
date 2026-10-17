begin;
set local statement_timeout='20s';
do $test$
declare a public.movies%rowtype;b public.movies%rowtype;altered public.movies%rowtype;r jsonb;again jsonb; claimed record;competitor text;
begin
 select * into a from movies where id='8427b8a1-78e9-4ef0-ad41-dbe40e07eb73';
 select * into b from movies where id='513713ce-b654-4e5b-b764-1761c91d0eee';
 a.origin_name:='On the drinking table under the planning table';b.origin_name:='Friday Night Fever';
 if not private.localized_cast_playback_match(a,b) then raise exception 'Translated original title with exact Vietnamese identity/cast not recognized';end if;
 altered:=b;altered.actor:=array['Unrelated actor A','Unrelated actor B'];
 if private.localized_cast_playback_match(a,altered) then raise exception 'Same title without shared actors accepted';end if;
 altered:=b;altered.year:=2024;
 if private.localized_cast_playback_match(a,altered) then raise exception 'Wrong release year accepted';end if;
 altered:=b;altered.tmdb_id:=2;a.tmdb_id:=1;
 if private.localized_cast_playback_match(a,altered) then raise exception 'Conflicting external IDs accepted';end if;
 a.tmdb_id:=null;a.type:='series';b.type:='series';a.season_number:=1;b.season_number:=2;
 if private.localized_cast_playback_match(a,b) then raise exception 'Cross-season match accepted';end if;
 update movies set origin_name='On the drinking table under the planning table',
  title_original='On the drinking table under the planning table' where id='8427b8a1-78e9-4ef0-ad41-dbe40e07eb73';
 delete from streams where movie_id='8427b8a1-78e9-4ef0-ad41-dbe40e07eb73' and source='phimapi';
 r:=public.recover_sibling_playback_sources('8427b8a1-78e9-4ef0-ad41-dbe40e07eb73','full',6);
 if (r->>'added')::integer<1 then raise exception 'Translated-title counterpart source was not recovered';end if;
 if exists(select 1 from streams where movie_id='8427b8a1-78e9-4ef0-ad41-dbe40e07eb73' and source='phimapi' and health_status<>'unchecked')
 then raise exception 'Counterpart was marked verified before probing';end if;
 r:=public.import_local_playback_audit('test-local-recovery',jsonb_build_array(
  jsonb_build_object('movie_id','5e8bc77a-0371-4473-bfcd-98377c65b76d','episode_slug','full','verdict','unverified','checked_at',now()),
  jsonb_build_object('movie_id','8427b8a1-78e9-4ef0-ad41-dbe40e07eb73','episode_slug','full','verdict','verified_media_sample','checked_at',now())));
 if (r->>'imported')::integer<>2 then raise exception 'Local audit not recorded';end if;
 if not exists(select 1 from private.local_playback_audit_results where run_key='test-local-recovery'
  and original_movie_id='5e8bc77a-0371-4473-bfcd-98377c65b76d' and canonical_movie_id='a0f63359-abca-47ff-beea-e8218e218160') then raise exception 'Old movie ID was not mapped to canonical';end if;
 again:=public.import_local_playback_audit('test-local-recovery',jsonb_build_array(
  jsonb_build_object('movie_id','5e8bc77a-0371-4473-bfcd-98377c65b76d','episode_slug','full','verdict','unverified','checked_at',now())));
 if (again->>'imported')::integer<>0 or (again->>'queued')::integer<>0 then raise exception 'Duplicate import requeued work';end if;
 update system_brain_tasks set enabled=false where brain='catalog';
 select task_key into competitor from system_brain_tasks where brain='catalog' and task_key<>'catalog:provider-repair' limit 1;
 update system_brain_tasks set enabled=true,priority=5,next_run_at=now()-interval '1 minute',lease_until=null where task_key=competitor;
 update system_brain_tasks set enabled=true,priority=1,next_run_at='1970-01-01',lease_until=null where task_key='catalog:provider-repair';
 select * into claimed from public.claim_system_brain_tasks('catalog',1);
 if claimed.task_key<>'catalog:provider-repair' then raise exception 'Overdue repair task still starves';end if;
 if has_function_privilege('anon','public.import_local_playback_audit(text,jsonb)','execute') then raise exception 'Public local audit mutation allowed';end if;
end;$test$;
select 'Localized title/cast safety, canonical local-audit import, idempotency, catalog fairness and access tests passed' result;
rollback;
