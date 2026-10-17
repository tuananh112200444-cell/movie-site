begin;
set local lock_timeout='3s';
set local statement_timeout='25s';
alter table public.movies add column if not exists season_scope text not null default 'unknown'
 check (season_scope in ('unknown','season','aggregate','conflict'));

create or replace function public.canonical_season_number(p_title text,p_explicit integer default null)
returns integer language sql immutable parallel safe set search_path=public,pg_catalog,pg_temp as $$
 select coalesce(case when p_explicit>0 then p_explicit end,nullif((regexp_match(public.kp_search_normalize(p_title),'(?:^|[^a-z0-9])(?:season|phan|mua|part|s) *([0-9]{1,3})(?=$|[^a-z0-9])'))[1]::integer,0));
$$;
create function private.movie_season_signature(p jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare nums integer[]; n integer; scope text;
begin
 select array_agg(distinct val) into nums from (
  select nullif(p->>'season_number','')::integer val
  union all select nullif(p#>>'{tmdb,season}','')::integer
  union all select (r)[1]::integer from regexp_matches(kp_search_normalize(concat_ws(' ',p->>'name',p->>'origin_name',p->>'original_name',p->>'title_vi',p->>'title_en',p->>'title_original',p->>'slug')),'(?:^|[^a-z0-9])(?:season|phan|mua|part|s) *([0-9]{1,3})(?=$|[^a-z0-9])','g') r
 ) q where val>0;
 scope:=case when cardinality(nums)>1 then 'conflict' when p->>'season_scope'='aggregate' then 'aggregate' when cardinality(nums)=1 then 'season' else 'unknown' end;
 n:=case when scope='season' then nums[1] else null end;
 return jsonb_build_object('scope',scope,'season',n);
end;$$;
create function private.movie_boundary_matches_json(m public.movies,p jsonb) returns boolean
language sql stable set search_path=public,private,pg_temp as $$
 select coalesce(
  (canonical_movie_type(m.type)='' or canonical_movie_type(p->>'type')='' or canonical_movie_type(m.type)=canonical_movie_type(p->>'type'))
  and not(coalesce(m.tmdb_id,0)>0 and coalesce(nullif(p->>'tmdb_id','')::integer,0)>0 and m.tmdb_id<>(p->>'tmdb_id')::integer)
  and not(nullif(m.imdb_id,'') is not null and nullif(p->>'imdb_id','') is not null and lower(m.imdb_id)<>lower(p->>'imdb_id'))
  and (private.movie_season_signature(to_jsonb(m))->>'scope')<>'conflict'
  and (private.movie_season_signature(p)->>'scope')<>'conflict'
  and private.movie_season_signature(to_jsonb(m))=private.movie_season_signature(p),false);
$$;

-- TMDB/IMDb identify a series, not a season. Include media type and scope.
drop index public.movies_tmdb_id_unique;
drop index public.movies_imdb_id_unique;
drop index public.movies_imdb_id_lower_unique;
create unique index movies_tmdb_season_identity_unique on public.movies (
 tmdb_id,public.canonical_movie_type(type),
 coalesce(public.canonical_season_number(coalesce(name,'')||' '||coalesce(origin_name,'')||' '||coalesce(slug,''),season_number),0),(case when season_scope='aggregate' then 'aggregate' else 'individual' end)
) where tmdb_id>0 and superseded_by_movie_id is null;
create unique index movies_imdb_season_identity_unique on public.movies (
 lower(trim(imdb_id)),public.canonical_movie_type(type),
 coalesce(public.canonical_season_number(coalesce(name,'')||' '||coalesce(origin_name,'')||' '||coalesce(slug,''),season_number),0),(case when season_scope='aggregate' then 'aggregate' else 'individual' end)
) where nullif(trim(imdb_id),'') is not null and superseded_by_movie_id is null;

create table private.movie_season_audit (
 movie_id uuid not null references public.movies(id), issue text not null,
 evidence jsonb not null, status text not null default 'review',
 checked_at timestamptz not null default now(), primary key(movie_id,issue)
);
alter table private.movie_season_audit enable row level security;
revoke all on private.movie_season_audit from public,anon,authenticated;
grant select on private.movie_season_audit to service_role;

-- Metadata-only inventory: preserve editorial/publication decisions and never merge.
insert into private.movie_season_audit(movie_id,issue,evidence)
select id,'season_metadata_conflict',jsonb_build_object('slug',slug,'signature',private.movie_season_signature(to_jsonb(m)))
from movies m where superseded_by_movie_id is null and season_number>0
 and canonical_season_number(concat_ws(' ',name,origin_name,slug),null)>0
 and season_number<>canonical_season_number(concat_ws(' ',name,origin_name,slug),null);

insert into private.movie_season_audit(movie_id,issue,evidence)
select m.id,'provider_type_conflict',jsonb_build_object('slug',m.slug,'provider',i.provider,'provider_slug',i.provider_slug,'provider_type',i.movie_type,'catalog_type',m.type)
from movies m join provider_movie_identities i on i.movie_id=m.id
where canonical_movie_type(i.movie_type)<>'' and canonical_movie_type(m.type)<>'' and canonical_movie_type(i.movie_type)<>canonical_movie_type(m.type)
on conflict do nothing;

-- Resolver definition follows below; all candidate branches use the same guard.

create or replace function public.resolve_canonical_movie(
  p_provider text,
  p_provider_slug text,
  p_provider_id text default '',
  p_tmdb_id integer default null,
  p_imdb_id text default '',
  p_original_title text default '',
  p_localized_title text default '',
  p_year integer default null,
  p_movie_type text default '',
  p_season integer default null,
  p_create_slug text default '',
  p_source_name text default ''
)
returns table(movie_id uuid, created boolean, match_method text, confidence text)
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_provider_slug text := lower(trim(coalesce(p_provider_slug, '')));
  v_provider_id text := trim(coalesce(p_provider_id, ''));
  v_type text := public.canonical_movie_type(p_movie_type);
  v_season integer := public.canonical_season_number(concat_ws(' ', p_original_title, p_localized_title), p_season);
  v_identity text := public.canonical_identity_fingerprint(
    p_tmdb_id, p_imdb_id, p_original_title, p_year, p_movie_type, v_season
  );
  v_movie_id uuid;
  v_created boolean := false;
  v_method text := '';
  v_confidence text := '';
  v_slug text;
  v_boundary jsonb:=jsonb_build_object('name',p_localized_title,'origin_name',p_original_title,'type',p_movie_type,'season_number',v_season,'season_scope',case when p_season=-1 then 'aggregate' else 'unknown' end,'tmdb_id',p_tmdb_id,'imdb_id',p_imdb_id);
begin
  if p_season=-1 then v_identity:=v_identity||':aggregate'; end if;
  if v_provider !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
    raise exception 'Invalid provider: %', p_provider;
  end if;
  if v_provider_slug = '' or v_provider_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid provider slug: %', p_provider_slug;
  end if;

  if private.movie_season_signature(v_boundary)->>'scope'='conflict' then raise exception 'Conflicting incoming season metadata'; end if;

  perform pg_advisory_xact_lock(hashtextextended('provider:' || v_provider || ':' || v_provider_slug, 0));
  if v_identity is not null then
    perform pg_advisory_xact_lock(hashtextextended('canonical:' || v_identity, 0));
  end if;

  select identity.movie_id into v_movie_id
  from public.provider_movie_identities identity
  join public.movies movie on movie.id = identity.movie_id
  where identity.provider = v_provider
    and identity.provider_slug = v_provider_slug
    and movie.superseded_by_movie_id is null and private.movie_boundary_matches_json(movie, v_boundary);
  if v_movie_id is not null then
    v_method := 'provider_identity';
    v_confidence := 'authoritative';
  end if;

  if v_movie_id is null and v_identity is not null then
    select identity.movie_id into v_movie_id
    from public.canonical_movie_identities identity
    join public.movies movie on movie.id = identity.movie_id
    where identity.identity_key = v_identity
      and movie.superseded_by_movie_id is null and private.movie_boundary_matches_json(movie, v_boundary);
    if v_movie_id is not null then
      v_method := split_part(v_identity, ':', 1);
      v_confidence := case when v_method in ('tmdb','imdb') then 'authoritative' else 'strict' end;
    end if;
  end if;

  if v_movie_id is null and coalesce(p_tmdb_id, 0) > 0 then
    select movie.id into v_movie_id
    from public.movies movie
    where movie.tmdb_id = p_tmdb_id
      and movie.superseded_by_movie_id is null and private.movie_boundary_matches_json(movie, v_boundary)
      and (v_type = '' or public.canonical_movie_type(coalesce(movie.tmdb_media_type, movie.type)) in ('', v_type))
      and coalesce(movie.season_number, public.canonical_season_number(concat_ws(' ', movie.origin_name, movie.title_original), null), 0) = coalesce(v_season, 0)
    order by movie.is_published desc, movie.current_episode desc nulls last, movie.created_at asc
    limit 1;
    if v_movie_id is not null then v_method := 'tmdb'; v_confidence := 'authoritative'; end if;
  end if;

  if v_movie_id is null and nullif(lower(trim(coalesce(p_imdb_id, ''))), '') is not null then
    select movie.id into v_movie_id
    from public.movies movie
    where lower(trim(coalesce(movie.imdb_id, ''))) = lower(trim(p_imdb_id))
      and movie.superseded_by_movie_id is null and private.movie_boundary_matches_json(movie, v_boundary)
      and (v_type = '' or public.canonical_movie_type(movie.type) in ('', v_type))
      and coalesce(movie.season_number, public.canonical_season_number(concat_ws(' ', movie.origin_name, movie.title_original), null), 0) = coalesce(v_season, 0)
    order by movie.is_published desc, movie.current_episode desc nulls last, movie.created_at asc
    limit 1;
    if v_movie_id is not null then v_method := 'imdb'; v_confidence := 'authoritative'; end if;
  end if;

  if v_movie_id is null and p_year between 1888 and 2200 and v_type <> ''
    and length(public.kp_search_normalize(p_original_title)) >= 3 then
    select movie.id into v_movie_id
    from public.movies movie
    where movie.year = p_year
      and movie.superseded_by_movie_id is null and private.movie_boundary_matches_json(movie, v_boundary)
      and public.canonical_movie_type(movie.type) = v_type
      and coalesce(movie.season_number, public.canonical_season_number(concat_ws(' ', movie.origin_name, movie.title_original), null), 0) = coalesce(v_season, 0)
      and public.kp_search_normalize(coalesce(nullif(movie.title_original,''), nullif(movie.origin_name,''), nullif(movie.original_title,''), movie.title_en))
          = public.kp_search_normalize(p_original_title)
      and not (
        coalesce(movie.tmdb_id, 0) > 0 and coalesce(p_tmdb_id, 0) > 0 and movie.tmdb_id <> p_tmdb_id
      )
    order by movie.is_published desc,
      public.movie_has_usable_persisted_playback(movie.id) desc,
      coalesce(movie.current_episode, 0) desc,
      movie.created_at asc
    limit 1;
    if v_movie_id is not null then v_method := 'original_title_year_type_season'; v_confidence := 'strict'; end if;
  end if;

  if v_movie_id is null then
    v_slug := lower(trim(coalesce(nullif(p_create_slug, ''), v_provider_slug)));
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then v_slug := v_provider || '-' || substr(md5(v_provider_slug), 1, 12); end if;
    if exists (select 1 from public.movies where slug = v_slug) then
      v_slug := v_provider || '-' || v_slug;
    end if;
    if exists (select 1 from public.movies where slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(v_provider_id || v_provider_slug), 1, 8);
    end if;

    insert into public.movies (
      slug, name, origin_name, title_vi, title_en, title_original,
      normalized_name, year, type, source_site, source_name,
      tmdb_id, imdb_id, season_number, season_scope, canonical_identity_key,
      is_published, seo_catalog_status, canonicalized_at, updated_at
    ) values (
      v_slug,
      coalesce(nullif(trim(p_localized_title), ''), nullif(trim(p_original_title), ''), v_provider_slug),
      coalesce(nullif(trim(p_original_title), ''), ''),
      coalesce(nullif(trim(p_localized_title), ''), nullif(trim(p_original_title), ''), v_provider_slug),
      coalesce(nullif(trim(p_original_title), ''), ''),
      coalesce(nullif(trim(p_original_title), ''), nullif(trim(p_localized_title), ''), v_provider_slug),
      regexp_replace(public.kp_search_normalize(concat_ws(' ', p_localized_title, p_original_title)), ' ', '-', 'g'),
      p_year, p_movie_type, v_provider, coalesce(nullif(p_source_name, ''), v_provider),
      nullif(p_tmdb_id, 0), nullif(trim(p_imdb_id), ''), v_season, v_boundary->>'season_scope', v_identity,
      false, 'awaiting_playback', now(), now()
    ) returning id into v_movie_id;
    v_created := true;
    v_method := 'created';
    v_confidence := case when v_identity is null then 'provider_only' else 'strict' end;
  end if;

  if v_identity is not null then
    insert into public.canonical_movie_identities (
      identity_key, movie_id, identity_kind, confidence, evidence, updated_at
    ) values (
      v_identity, v_movie_id,
      case split_part(v_identity, ':', 1) when 'title' then 'original_title' else split_part(v_identity, ':', 1) end,
      case when split_part(v_identity, ':', 1) in ('tmdb','imdb') then 'authoritative' else 'strict' end,
      jsonb_build_object('provider', v_provider, 'provider_slug', v_provider_slug), now()
    ) on conflict (identity_key) do nothing;

    select identity.movie_id into v_movie_id
    from public.canonical_movie_identities identity join public.movies movie on movie.id=identity.movie_id
    where identity.identity_key = v_identity and movie.superseded_by_movie_id is null and private.movie_boundary_matches_json(movie, v_boundary);
    if v_movie_id is null then raise exception 'Canonical identity collision requires season review'; end if;
  end if;

  insert into public.provider_movie_identities as identity (
    provider, provider_slug, provider_id, movie_id, normalized_name,
    release_year, movie_type, first_seen_at, last_seen_at
  ) values (
    v_provider, v_provider_slug, v_provider_id, v_movie_id,
    regexp_replace(public.kp_search_normalize(concat_ws(' ', p_localized_title, p_original_title)), ' ', '-', 'g'),
    p_year, p_movie_type, now(), now()
  ) on conflict (provider, provider_slug) do update set
    provider_id = coalesce(nullif(excluded.provider_id, ''), identity.provider_id),
    movie_id = excluded.movie_id,
    normalized_name = coalesce(nullif(excluded.normalized_name, ''), identity.normalized_name),
    release_year = coalesce(excluded.release_year, identity.release_year),
    movie_type = coalesce(nullif(excluded.movie_type, ''), identity.movie_type),
    last_seen_at = now();

  update public.movies
  set season_number = coalesce(movies.season_number, v_season),
      canonical_identity_key = coalesce(movies.canonical_identity_key, v_identity),
      canonicalized_at = now()
  where id = v_movie_id;

  return query select v_movie_id, v_created, v_method, v_confidence;
end;
$$;


create or replace function private.strict_playback_siblings(a public.movies,b public.movies)
returns boolean language sql stable set search_path=public,pg_temp as $$
select coalesce(
 a.id<>b.id and private.movie_boundary_matches_json(a,to_jsonb(b)) and a.year between 1888 and 2200 and a.year=b.year
 and public.canonical_movie_type(a.type)<>''
 and public.canonical_movie_type(a.type)=public.canonical_movie_type(b.type)
 and a.superseded_by_movie_id is null and b.superseded_by_movie_id is null
 and lower(coalesce(a.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and lower(coalesce(b.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and not (coalesce(a.tmdb_id,0)>0 and coalesce(b.tmdb_id,0)>0 and a.tmdb_id<>b.tmdb_id)
 and not (nullif(a.imdb_id,'') is not null and nullif(b.imdb_id,'') is not null and a.imdb_id<>b.imdb_id)
 and (
  (coalesce(a.tmdb_id,0)>0 and a.tmdb_id=b.tmdb_id)
  or (nullif(a.imdb_id,'') is not null and a.imdb_id=b.imdb_id)
  or (
   length(public.kp_search_normalize(coalesce(nullif(a.origin_name,''),nullif(a.title_original,''),a.original_title)))>=5
   and public.kp_search_normalize(coalesce(nullif(a.origin_name,''),nullif(a.title_original,''),a.original_title))
    =public.kp_search_normalize(coalesce(nullif(b.origin_name,''),nullif(b.title_original,''),b.original_title))
  )
 )
 and (public.canonical_movie_type(a.type)='single' or (
  public.canonical_season_number(concat_ws(' ',a.origin_name,a.title_original,a.name),a.season_number)>0
  and public.canonical_season_number(concat_ws(' ',a.origin_name,a.title_original,a.name),a.season_number)
   =public.canonical_season_number(concat_ws(' ',b.origin_name,b.title_original,b.name),b.season_number)
 )),false);
$$;

create or replace function private.localized_cast_playback_match(a public.movies,b public.movies)
returns boolean language sql stable set search_path=public,pg_temp as $$
select coalesce(a.id<>b.id and private.movie_boundary_matches_json(a,to_jsonb(b)) and a.year between 1888 and 2200 and a.year=b.year
 and public.canonical_movie_type(a.type)<>'' and public.canonical_movie_type(a.type)=public.canonical_movie_type(b.type)
 and a.superseded_by_movie_id is null and b.superseded_by_movie_id is null
 and lower(coalesce(a.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and lower(coalesce(b.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and length(public.kp_search_normalize(split_part(a.name,'/',1)))>=5
 and public.kp_search_normalize(split_part(a.name,'/',1))=public.kp_search_normalize(split_part(b.name,'/',1))
 and not (coalesce(a.tmdb_id,0)>0 and coalesce(b.tmdb_id,0)>0 and a.tmdb_id<>b.tmdb_id)
 and not (nullif(a.imdb_id,'') is not null and nullif(b.imdb_id,'') is not null and a.imdb_id<>b.imdb_id)
 and (select count(distinct public.kp_search_normalize(actor_a)) from unnest(a.actor) actor_a
   where length(public.kp_search_normalize(actor_a))>=3 and exists(select 1 from unnest(b.actor) actor_b
    where public.kp_search_normalize(actor_b)=public.kp_search_normalize(actor_a)))>=2
 and (public.canonical_movie_type(a.type)='single' or (
  public.canonical_season_number(concat_ws(' ',a.origin_name,a.title_original,a.name),a.season_number)>0
  and public.canonical_season_number(concat_ws(' ',a.origin_name,a.title_original,a.name),a.season_number)
   =public.canonical_season_number(concat_ws(' ',b.origin_name,b.title_original,b.name),b.season_number))),false);
$$;

notify pgrst,'reload schema';
commit;
