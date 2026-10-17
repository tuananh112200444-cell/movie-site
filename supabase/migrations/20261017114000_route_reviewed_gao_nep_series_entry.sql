begin;
set local lock_timeout='3s';set local statement_timeout='10s';
insert into movie_slug_aliases(alias_slug,movie_id,canonical_slug,reason,updated_at)
select 'gao-nep-gao-te',id,slug,'reviewed-vietnamese-series-entry-season-1',now() from movies
where id='79923108-e253-4203-81a5-6698a0d984c6' and slug='gao-nep-gao-te-phan-1' and type='series' and year=2018
on conflict(alias_slug) do update set movie_id=excluded.movie_id,canonical_slug=excluded.canonical_slug,reason=excluded.reason,updated_at=now();
delete from movie_api_cache where slug in ('gao-nep-gao-te','gao-nep-gao-te-phan-1','gao-nep-gao-te-phan-2');
commit;
