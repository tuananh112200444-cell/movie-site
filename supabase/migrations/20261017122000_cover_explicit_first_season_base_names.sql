begin;set local lock_timeout='3s';set local statement_timeout='25s';
create or replace function private.implicit_first_season_identity(a jsonb,b jsonb) returns boolean
language sql immutable set search_path=public,private,pg_temp as $$
 select coalesce(
 canonical_movie_type(a->>'type')='series' and canonical_movie_type(b->>'type')='series'
 and nullif(a->>'year','')::integer between 1888 and 2200 and a->>'year'=b->>'year'
 and ((private.movie_season_signature(a)->>'scope'='unknown' and private.movie_season_signature(b)->>'season'='1')
   or(private.movie_season_signature(b)->>'scope'='unknown' and private.movie_season_signature(a)->>'season'='1')
   or(private.movie_season_signature(a)->>'season'='1' and private.movie_season_signature(b)->>'season'='1'))
 and length(first_season_base_title(coalesce(nullif(a->>'name',''),a->>'title_vi')))>=5
 and first_season_base_title(coalesce(nullif(a->>'name',''),a->>'title_vi'))=first_season_base_title(coalesce(nullif(b->>'name',''),b->>'title_vi'))
 and length(first_season_base_title(coalesce(nullif(a->>'origin_name',''),a->>'title_original',a->>'title_en')))>=5
 and first_season_base_title(coalesce(nullif(a->>'origin_name',''),a->>'title_original',a->>'title_en'))=first_season_base_title(coalesce(nullif(b->>'origin_name',''),b->>'title_original',b->>'title_en'))
 ,false);
$$;
create or replace function private.safe_implicit_first_season_siblings(a public.movies,b public.movies) returns boolean
language sql stable set search_path=public,private,pg_temp as $$
 select coalesce(a.id<>b.id and private.implicit_first_season_identity(to_jsonb(a),to_jsonb(b))
 and private.movie_boundary_matches_json(a,to_jsonb(b))
 and a.superseded_by_movie_id is null and b.superseded_by_movie_id is null
 and lower(coalesce(a.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and lower(coalesce(b.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 -- More advertised episodes on the unnamed collection could mean a bundle.
 and not (coalesce(a.total_episodes,0)>0 and coalesce(b.total_episodes,0)>0 and (
 (first_season_base_title(a.name)=kp_search_normalize(a.name) and a.total_episodes>b.total_episodes)
 or(first_season_base_title(b.name)=kp_search_normalize(b.name) and b.total_episodes>a.total_episodes)))
 and not exists(select 1 from streams s where s.movie_id in(a.id,b.id)
   and s.episode_slug ~ '(?:phan|season|mua|part)[-_ ]*0*[2-9][0-9]*(?:$|[-_ ])')
 ,false);
$$;
create or replace function public.seed_implicit_first_season_merges(p_limit integer default 1000) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare eligible integer; flagged integer;
begin
 if not exists(select 1 from runtime_capacity_state where singleton and mode='normal') then return jsonb_build_object('status','capacity_protect');end if;
 with pairs as materialized (
  select a.id base_id,b.id first_id,a.slug base_slug,b.slug first_slug,a.year,
   private.safe_implicit_first_season_siblings(a,b) safe
  from movies b join movies a on a.year=b.year
   and canonical_movie_type(a.type)='series'
   and first_season_base_title(a.name)=first_season_base_title(b.name)
   and first_season_base_title(a.origin_name)=first_season_base_title(b.origin_name)
   and a.superseded_by_movie_id is null
  where b.superseded_by_movie_id is null and canonical_movie_type(b.type)='series'
   and canonical_season_number(concat_ws(' ',b.name,b.origin_name,b.slug),b.season_number)=1
   and coalesce(canonical_season_number(concat_ws(' ',a.name,a.origin_name,a.slug),a.season_number),1)=1
   and kp_search_normalize(a.name)=first_season_base_title(a.name)
   and kp_search_normalize(b.name)<>first_season_base_title(b.name)
   and a.id<>b.id
   and length(first_season_base_title(a.name))>=5 and length(first_season_base_title(a.origin_name))>=5
  order by a.id,b.id limit greatest(1,least(p_limit,2000))
 ), inserted as (
  insert into canonicalization_candidates(candidate_key,identity_kind,identity_value,release_year,movie_type,season_number,movie_ids,confidence_tier,status,evidence)
  select 'implicit-first:'||base_id||':'||first_id,'implicit_first_season',base_slug,year,'series',1,array[base_id,first_id],
   case when safe then 'A' else 'B' end,case when safe then 'ready' else 'review' end,
   jsonb_build_object('base_slug',base_slug,'first_slug',first_slug,'contract','bilingual-year-type-first-season-v1','safe',safe)
  from pairs on conflict(candidate_key) do nothing returning status
 ) select count(*) filter(where status='ready'),count(*) filter(where status='review') into eligible,flagged from inserted;
 return jsonb_build_object('ready',eligible,'review',flagged);
end;$$;
commit;
