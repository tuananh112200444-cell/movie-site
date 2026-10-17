begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create or replace function private.keep_superseded_movie_retired()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 -- A connector may have read this row before a merge acquired its lock.
 -- Such an old update must not republish the tombstone or reclaim unique IDs.
 -- An explicit rollback clears superseded_by_movie_id, so recovery is allowed.
 if old.superseded_by_movie_id is not null and new.superseded_by_movie_id=old.superseded_by_movie_id then
  new.is_published:=false;new.seo_catalog_status:='superseded';
  new.source_site:='merged';new.source_name:=old.source_name;
  new.tmdb_id:=null;new.imdb_id:='';new.ophim_id:='';new.ophim_slug:=null;
 end if;
 return new;
end;$$;
drop trigger if exists keep_superseded_movie_retired on public.movies;
create trigger keep_superseded_movie_retired before update on public.movies
for each row execute function private.keep_superseded_movie_retired();

create or replace function private.redirect_merged_provider_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare destination uuid;depth integer:=0;
begin
 loop
  select superseded_by_movie_id into destination from public.movies where id=new.movie_id;
  exit when destination is null;
  depth:=depth+1;
  if depth>16 or destination=new.movie_id then raise exception 'Invalid merged identity chain';end if;
  new.movie_id:=destination;
 end loop;
 return new;
end;$$;
drop trigger if exists a_redirect_merged_provider_identity on public.provider_movie_identities;
create trigger a_redirect_merged_provider_identity before insert or update on public.provider_movie_identities
for each row execute function private.redirect_merged_provider_identity();
revoke all on function private.keep_superseded_movie_retired(),private.redirect_merged_provider_identity() from public,anon,authenticated;
commit;
