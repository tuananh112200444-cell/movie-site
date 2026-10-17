begin;
set local statement_timeout='30s';set local lock_timeout='3s';
create temporary table verified_merge_before as
select id,to_jsonb(m) payload from movies m where id in
 ('a0f63359-abca-47ff-beea-e8218e218160','5e8bc77a-0371-4473-bfcd-98377c65b76d');
create temporary table verified_merge_urls_before as
select distinct stream_url,embed_url from streams where movie_id in
 ('a0f63359-abca-47ff-beea-e8218e218160','5e8bc77a-0371-4473-bfcd-98377c65b76d');
do $test$
declare outcome jsonb;merge uuid;alias text;
begin
 update runtime_capacity_state set mode='normal' where singleton;
 outcome:=public.merge_canonicalization_candidate('64e939fe99287cdaca7b0fca843d3449','a0f63359-abca-47ff-beea-e8218e218160',true);
 if outcome->>'canonical_slug'<>'transformers-4-ky-nguyen-huy-diet' then raise exception 'Wrong canonical route';end if;
 outcome:=public.merge_canonicalization_candidate('64e939fe99287cdaca7b0fca843d3449','a0f63359-abca-47ff-beea-e8218e218160',false);
 merge:=(outcome->>'merge_id')::uuid;
 if merge is null then raise exception 'Missing merge ledger';end if;
 if (select count(*) from canonical_merge_archive where merge_id=merge and table_name='movies')<>2 then raise exception 'Both movies were not backed up';end if;
 if exists(select 1 from verified_merge_urls_before b where not exists(select 1 from streams s
  where s.movie_id='a0f63359-abca-47ff-beea-e8218e218160' and coalesce(s.stream_url,'')=coalesce(b.stream_url,'') and coalesce(s.embed_url,'')=coalesce(b.embed_url,'')))
 then raise exception 'Distinct playback URL was lost';end if;
 if not exists(select 1 from movie_slug_aliases where alias_slug='transformers-ky-nguyen-huy-diet'
  and canonical_slug='transformers-4-ky-nguyen-huy-diet') then raise exception 'Old link has no alias';end if;
 if not exists(select 1 from movies where id='5e8bc77a-0371-4473-bfcd-98377c65b76d' and not is_published
  and superseded_by_movie_id='a0f63359-abca-47ff-beea-e8218e218160') then raise exception 'Duplicate still public';end if;
 outcome:=public.rollback_canonical_merge(merge);
 if outcome->>'success'<>'true' then raise exception 'Rollback failed';end if;
 if exists(select 1 from verified_merge_before b join movies m on m.id=b.id where (to_jsonb(m)-'updated_at')<>(b.payload-'updated_at'))
 then raise exception 'Movie metadata was not fully restored';end if;
 if exists(select 1 from verified_merge_urls_before b where not exists(select 1 from streams s
  where s.movie_id in ('a0f63359-abca-47ff-beea-e8218e218160','5e8bc77a-0371-4473-bfcd-98377c65b76d')
   and coalesce(s.stream_url,'')=coalesce(b.stream_url,'') and coalesce(s.embed_url,'')=coalesce(b.embed_url,''))) then raise exception 'Rollback lost playback URL';end if;
 if has_function_privilege('anon','public.merge_canonicalization_candidate(text,uuid,boolean)','execute') then raise exception 'Public merge access';end if;
end;$test$;
select 'Verified movie merge: both backups, all distinct playback URLs, canonical alias, duplicate suppression and full movie rollback passed' result;
rollback;
