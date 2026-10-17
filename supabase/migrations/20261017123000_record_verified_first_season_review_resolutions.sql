begin;set local lock_timeout='3s';set local statement_timeout='20s';
create table private.verified_first_season_merge_reviews (
 base_movie_id uuid not null references movies(id),first_movie_id uuid not null references movies(id),
 evidence jsonb not null,reviewed_at timestamptz not null default now(),primary key(base_movie_id,first_movie_id));
alter table private.verified_first_season_merge_reviews enable row level security;
revoke all on private.verified_first_season_merge_reviews from public,anon,authenticated;
grant select on private.verified_first_season_merge_reviews to service_role;
insert into private.verified_first_season_merge_reviews values
 ('942fd919-ed15-488a-821a-cc75e6997fde','4984e24d-5e95-4849-beb1-c55a233ef8da','{"tmdb_id":218589,"season":1,"provider_checks":["KKPhim","VSMOV","NguonC"],"reason":"same external ID and first season; incomplete provider advertises fewer episodes"}',now()),
 ('c5c82285-0173-4a3d-86e4-e1f45f83cba2','102611d5-c397-4777-ae42-9ddf09440bf8','{"tmdb_id":235685,"season":1,"provider_checks":["KKPhim","NguonC"],"current_episode_count_both":3,"reason":"same external ID and first season; advertised totals differ"}',now());
create or replace function private.safe_implicit_first_season_siblings(a public.movies,b public.movies) returns boolean
language sql stable set search_path=public,private,pg_temp as $$
 select coalesce(a.id<>b.id and private.implicit_first_season_identity(to_jsonb(a),to_jsonb(b))
 and private.movie_boundary_matches_json(a,to_jsonb(b))
 and a.superseded_by_movie_id is null and b.superseded_by_movie_id is null
 and lower(coalesce(a.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and lower(coalesce(b.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 -- More advertised episodes on the unnamed collection could mean a bundle.
 and (exists(select 1 from private.verified_first_season_merge_reviews v where (v.base_movie_id=a.id and v.first_movie_id=b.id) or (v.base_movie_id=b.id and v.first_movie_id=a.id)) or not (coalesce(a.total_episodes,0)>0 and coalesce(b.total_episodes,0)>0 and (
 (first_season_base_title(a.name)=kp_search_normalize(a.name) and a.total_episodes>b.total_episodes)
 or(first_season_base_title(b.name)=kp_search_normalize(b.name) and b.total_episodes>a.total_episodes))))
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
  from pairs on conflict(candidate_key) do update set status=excluded.status,confidence_tier=excluded.confidence_tier,evidence=excluded.evidence,last_error=null,updated_at=now() where canonicalization_candidates.status in ('review','failed') and excluded.status='ready' returning status
 ) select count(*) filter(where status='ready'),count(*) filter(where status='review') into eligible,flagged from inserted;
 return jsonb_build_object('ready',eligible,'review',flagged);
end;$$;
commit;
