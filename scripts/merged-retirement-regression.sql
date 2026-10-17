begin;
set local statement_timeout='15s';
do $test$
declare target uuid;count_rows integer;
begin
 select superseded_by_movie_id into target from movies where id='5e8bc77a-0371-4473-bfcd-98377c65b76d';
 if target is null then raise exception 'Expected merged Transformers donor';end if;
 update movies set is_published=true,seo_catalog_status='published',source_site='phimapi',tmdb_id=91314
  where id='5e8bc77a-0371-4473-bfcd-98377c65b76d';
 if not exists(select 1 from movies where id='5e8bc77a-0371-4473-bfcd-98377c65b76d'
  and not is_published and seo_catalog_status='superseded' and source_site='merged' and tmdb_id is null)
 then raise exception 'Stale connector update resurrected donor';end if;
 update provider_movie_identities set movie_id='5e8bc77a-0371-4473-bfcd-98377c65b76d'
  where movie_id=target;
 if exists(select 1 from provider_movie_identities where movie_id='5e8bc77a-0371-4473-bfcd-98377c65b76d')
 then raise exception 'Provider identity rebound to donor';end if;
end;$test$;
select 'Retired movie cannot be republished by a stale connector update; provider aliases follow the canonical movie' result;
rollback;
