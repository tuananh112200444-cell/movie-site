begin;set local lock_timeout='3s';set local statement_timeout='15s';
create function public.find_verified_first_season_alias(p_movie jsonb) returns jsonb
language sql stable security definer set search_path=public,private,pg_temp as $$
 select to_jsonb(m) from movies m
 where m.superseded_by_movie_id is null and m.year=nullif(p_movie->>'year','')::integer
 and canonical_movie_type(m.type)='series'
 and first_season_base_title(m.name)=first_season_base_title(p_movie->>'name')
 and first_season_base_title(m.origin_name)=first_season_base_title(p_movie->>'origin_name')
 and private.implicit_first_season_identity(to_jsonb(m),p_movie)
 and private.movie_boundary_matches_json(m,p_movie)
 and lower(coalesce(m.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and not exists(select 1 from streams s where s.movie_id=m.id and s.episode_slug ~ '(?:phan|season|mua|part)[-_ ]*0*[2-9][0-9]*(?:$|[-_ ])')
 order by m.is_published desc,m.current_episode desc nulls last,m.id limit 1;
$$;
revoke all on function public.find_verified_first_season_alias(jsonb) from public,anon,authenticated;
grant execute on function public.find_verified_first_season_alias(jsonb) to service_role;
notify pgrst,'reload schema';commit;
