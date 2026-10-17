begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create table private.canonical_merge_cleanup_backup (
 table_name text not null,row_key text not null,payload jsonb not null,
 archived_at timestamptz not null default now(),primary key(table_name,row_key)
);
insert into private.canonical_merge_cleanup_backup(table_name,row_key,payload)
select 'movies',m.id::text,to_jsonb(m) from public.movies m
where m.superseded_by_movie_id is not null and m.is_published=true on conflict do nothing;
insert into private.canonical_merge_cleanup_backup(table_name,row_key,payload)
select 'movie_slug_aliases',a.alias_slug,to_jsonb(a) from public.movie_slug_aliases a join public.movies m on m.id=a.movie_id
where m.superseded_by_movie_id is not null or a.canonical_slug<>m.slug on conflict do nothing;
insert into private.canonical_merge_cleanup_backup(table_name,row_key,payload)
select 'canonicalization_candidates',candidate_key,to_jsonb(c) from public.canonicalization_candidates c
where status='failed' and last_error like 'No active canonical movie%' on conflict do nothing;

-- These are pre-existing merged tombstones, not additional film matches.
update public.movies set is_published=false,seo_catalog_status='superseded',source_site='merged',updated_at=now()
where superseded_by_movie_id is not null and is_published=true;
do $routes$
declare route record;destination uuid;next_id uuid;destination_slug text;visited uuid[];
begin
 for route in select a.* from public.movie_slug_aliases a join public.movies m on m.id=a.movie_id
  where m.superseded_by_movie_id is not null or a.canonical_slug<>m.slug
 loop
  destination:=route.movie_id;visited:=array[]::uuid[];
  loop
   if destination=any(visited) or cardinality(visited)>=16 then raise exception 'Canonical alias cycle: %',route.alias_slug;end if;
   visited:=array_append(visited,destination);
   select slug,superseded_by_movie_id into destination_slug,next_id from public.movies where id=destination;
   if not found then raise exception 'Missing alias destination: %',route.alias_slug;end if;
   exit when next_id is null;
   destination:=next_id;
  end loop;
  if route.alias_slug=destination_slug then
   delete from public.movie_slug_aliases where alias_slug=route.alias_slug;
  else
   update public.movie_slug_aliases set movie_id=destination,canonical_slug=destination_slug,updated_at=now()
   where alias_slug=route.alias_slug;
  end if;
  delete from public.movie_api_cache where slug=route.alias_slug;
 end loop;
end;$routes$;
-- Members already point to different canonical films; do not merge those
-- independent destinations based on the stale candidate's old title label.
update public.canonicalization_candidates set status='review',
 last_error='Old candidate members now point to different canonical records; manual identity review required',updated_at=now()
where status='failed' and last_error like 'No active canonical movie%';
commit;
