begin;
set local statement_timeout='20s';
do $test$
declare a public.movies%rowtype;b public.movies%rowtype; altered public.movies%rowtype; result jsonb; count_rows integer;
begin
 select * into a from movies where id='a0f63359-abca-47ff-beea-e8218e218160';
 select * into b from movies where id='5e8bc77a-0371-4473-bfcd-98377c65b76d';
 if not private.strict_playback_siblings(a,b) then raise exception 'Exact Transformers identity not recognized';end if;
 altered:=b;altered.year:=2007;
 if private.strict_playback_siblings(a,altered) then raise exception 'Wrong year accepted';end if;
 altered:=b;altered.tmdb_id:=1;
 if private.strict_playback_siblings(a,altered) then raise exception 'Conflicting TMDB accepted';end if;
 altered:=b;altered.type:='series';
 if private.strict_playback_siblings(a,altered) then raise exception 'Wrong type accepted';end if;
 a.type:='series';b.type:='series';a.season_number:=1;b.season_number:=2;
 if private.strict_playback_siblings(a,b) then raise exception 'Cross-season link accepted';end if;
 a.season_number:=null;b.season_number:=null;
 if private.strict_playback_siblings(a,b) then raise exception 'Unknown series season accepted';end if;
 if private.recovery_episode_key('tap-08')<>private.recovery_episode_key('tap-8')
  or private.recovery_episode_key('full')<>private.recovery_episode_key('1')
  or private.recovery_episode_key('tap-8')=private.recovery_episode_key('tap-9') then raise exception 'Episode identity wrong';end if;
 update runtime_capacity_state set mode='normal' where singleton;
 insert into canonicalization_candidates(candidate_key,identity_kind,identity_value,release_year,movie_type,movie_ids,confidence_tier,status)
 values('test-transformers-sibling-link','original_title','transformers age of extinction',2014,'single',
  array['a0f63359-abca-47ff-beea-e8218e218160'::uuid,'5e8bc77a-0371-4473-bfcd-98377c65b76d'::uuid],'A','ready')
 on conflict(candidate_key) do nothing;
 -- Simulate the original split-source problem, and roll every change back.
 delete from streams where movie_id='a0f63359-abca-47ff-beea-e8218e218160' and source='phimapi';
 result:=public.recover_sibling_playback_sources('a0f63359-abca-47ff-beea-e8218e218160','full',6);
 if (result->>'added')::integer<>1 then raise exception 'Expected exactly one deduplicated source, got %',result;end if;
 if exists(select 1 from streams where movie_id='a0f63359-abca-47ff-beea-e8218e218160' and source='phimapi' and health_status<>'unchecked') then raise exception 'Unprobed source marked verified';end if;
 if not exists(select 1 from private.sibling_source_recovery_ledger where target_movie_id='a0f63359-abca-47ff-beea-e8218e218160') then raise exception 'Audit ledger missing';end if;
 result:=public.recover_sibling_playback_sources('a0f63359-abca-47ff-beea-e8218e218160','full',6);
 if (result->>'added')::integer<>0 then raise exception 'Repeated repair duplicated source';end if;
 update runtime_capacity_state set mode='protect' where singleton;
 result:=public.recover_sibling_playback_sources('a0f63359-abca-47ff-beea-e8218e218160','full',6);
 if result->>'status'<>'capacity_protect' then raise exception 'Capacity guard ignored';end if;
 if has_function_privilege('anon','public.recover_sibling_playback_sources(uuid,text,integer)','execute') then raise exception 'Public mutation allowed';end if;
 update runtime_capacity_state set mode='normal' where singleton;
 perform public.seed_split_playback_recovery(10);
 if not exists(select 1 from private.sibling_source_seed_cursor where singleton and candidate_key<>'') then raise exception 'Seed cursor did not advance';end if;
end;$test$;
select 'Sibling source identity, episode aliases, deduplication, audit ledger, unchecked health, retry idempotency, capacity and access tests passed' result;
rollback;
