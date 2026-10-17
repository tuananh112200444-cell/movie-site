begin;
set local lock_timeout='3s';set local statement_timeout='25s';
create function public.first_season_base_title(value text) returns text
language sql immutable parallel safe set search_path=public,pg_temp as $$
 select trim(regexp_replace(public.kp_search_normalize(value),' (phan|season|mua|part|s) 0*1$',''));
$$;
create index movies_first_season_title_lookup_idx on public.movies
 (year,public.canonical_movie_type(type),public.first_season_base_title(name),public.first_season_base_title(origin_name))
 where superseded_by_movie_id is null;
create index movies_original_identity_lookup_idx on public.movies
 (year,public.canonical_movie_type(type),public.kp_search_normalize(coalesce(nullif(title_original,''),nullif(origin_name,''),nullif(original_title,''),title_en)))
 where superseded_by_movie_id is null;
create function private.implicit_first_season_identity(a jsonb,b jsonb) returns boolean
language sql immutable set search_path=public,private,pg_temp as $$
 select coalesce(
 canonical_movie_type(a->>'type')='series' and canonical_movie_type(b->>'type')='series'
 and nullif(a->>'year','')::integer between 1888 and 2200 and a->>'year'=b->>'year'
 and ((private.movie_season_signature(a)->>'scope'='unknown' and private.movie_season_signature(b)->>'season'='1')
   or(private.movie_season_signature(b)->>'scope'='unknown' and private.movie_season_signature(a)->>'season'='1'))
 and length(first_season_base_title(coalesce(nullif(a->>'name',''),a->>'title_vi')))>=5
 and first_season_base_title(coalesce(nullif(a->>'name',''),a->>'title_vi'))=first_season_base_title(coalesce(nullif(b->>'name',''),b->>'title_vi'))
 and length(first_season_base_title(coalesce(nullif(a->>'origin_name',''),a->>'title_original',a->>'title_en')))>=5
 and first_season_base_title(coalesce(nullif(a->>'origin_name',''),a->>'title_original',a->>'title_en'))=first_season_base_title(coalesce(nullif(b->>'origin_name',''),b->>'title_original',b->>'title_en'))
 ,false);
$$;
create or replace function private.movie_boundary_matches_json(m public.movies,p jsonb) returns boolean
language sql stable set search_path=public,private,pg_temp as $$
 select coalesce(
  (canonical_movie_type(m.type)='' or canonical_movie_type(p->>'type')='' or canonical_movie_type(m.type)=canonical_movie_type(p->>'type'))
  and not(coalesce(m.tmdb_id,0)>0 and coalesce(nullif(p->>'tmdb_id','')::integer,0)>0 and m.tmdb_id<>(p->>'tmdb_id')::integer)
  and not(nullif(m.imdb_id,'') is not null and nullif(p->>'imdb_id','') is not null and lower(m.imdb_id)<>lower(p->>'imdb_id'))
  and (private.movie_season_signature(to_jsonb(m))->>'scope')<>'conflict'
  and (private.movie_season_signature(p)->>'scope')<>'conflict'
  and (private.movie_season_signature(to_jsonb(m))=private.movie_season_signature(p)
   or private.implicit_first_season_identity(to_jsonb(m),p)),false);
$$;
create function private.safe_implicit_first_season_siblings(a public.movies,b public.movies) returns boolean
language sql stable set search_path=public,private,pg_temp as $$
 select coalesce(a.id<>b.id and private.implicit_first_season_identity(to_jsonb(a),to_jsonb(b))
 and private.movie_boundary_matches_json(a,to_jsonb(b))
 and a.superseded_by_movie_id is null and b.superseded_by_movie_id is null
 and lower(coalesce(a.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 and lower(coalesce(b.seo_catalog_status,'')) not in ('hidden','draft','superseded')
 -- More advertised episodes on the unnamed collection could mean a bundle.
 and not (coalesce(a.total_episodes,0)>0 and coalesce(b.total_episodes,0)>0 and (
 (private.movie_season_signature(to_jsonb(a))->>'scope'='unknown' and a.total_episodes>b.total_episodes)
 or(private.movie_season_signature(to_jsonb(b))->>'scope'='unknown' and b.total_episodes>a.total_episodes)))
 and not exists(select 1 from streams s where s.movie_id in(a.id,b.id)
   and s.episode_slug ~ '(?:phan|season|mua|part)[-_ ]*0*[2-9][0-9]*(?:$|[-_ ])')
 ,false);
$$;
alter function private.strict_playback_siblings(public.movies,public.movies) rename to strict_explicit_playback_siblings;
create function private.strict_playback_siblings(a public.movies,b public.movies) returns boolean
language sql stable set search_path=public,private,pg_temp as $$
 select private.strict_explicit_playback_siblings(a,b) or private.safe_implicit_first_season_siblings(a,b);
$$;

create function public.seed_implicit_first_season_merges(p_limit integer default 1000) returns jsonb
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
   and canonical_season_number(concat_ws(' ',a.name,a.origin_name,a.slug),a.season_number) is null
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
revoke all on function public.seed_implicit_first_season_merges(integer) from public,anon,authenticated;
grant execute on function public.seed_implicit_first_season_merges(integer) to service_role;
-- Updated resolver follows.

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
  v_boundary jsonb:=jsonb_build_object('year',p_year,'name',p_localized_title,'origin_name',p_original_title,'type',p_movie_type,'season_number',v_season,'season_scope',case when p_season=-1 then 'aggregate' else 'unknown' end,'tmdb_id',p_tmdb_id,'imdb_id',p_imdb_id);
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

  if v_movie_id is null and v_type='series' and coalesce(v_season,1)=1 and p_season is distinct from -1 then
    perform pg_advisory_xact_lock(hashtextextended('first-season:'||p_year::text||':'||first_season_base_title(p_localized_title)||':'||first_season_base_title(p_original_title),0));
    select movie.id into v_movie_id from movies movie
    where movie.superseded_by_movie_id is null and movie.year=p_year and canonical_movie_type(movie.type)='series'
     and first_season_base_title(movie.name)=first_season_base_title(p_localized_title)
     and first_season_base_title(movie.origin_name)=first_season_base_title(p_original_title)
     and private.movie_boundary_matches_json(movie,v_boundary)
     and lower(coalesce(movie.seo_catalog_status,'')) not in ('hidden','draft','superseded')
    order by movie.is_published desc, movie.current_episode desc nulls last,movie.id limit 1;
    if v_movie_id is not null then v_method:='first_season_bilingual_year';v_confidence:='strict';end if;
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



create function public.run_implicit_first_season_merge_batch(p_limit integer default 1) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare item record;r jsonb;merged integer:=0;reviewed integer:=0;failed integer:=0;outcomes jsonb:='[]';
begin
 if not exists(select 1 from runtime_capacity_state where singleton and mode='normal') then return jsonb_build_object('status','capacity_protect');end if;
 if not pg_try_advisory_xact_lock(hashtext('implicit-first-season-merge-runner')) then return jsonb_build_object('status','already_running');end if;
 for item in select candidate_key from canonicalization_candidates
  where candidate_key like 'implicit-first:%' and status='ready' and confidence_tier='A'
  order by candidate_key limit greatest(1,least(p_limit,3)) for update skip locked loop
  begin
   r:=merge_canonicalization_candidate(item.candidate_key,null,false);merged:=merged+1;
   outcomes:=outcomes||jsonb_build_array(r);
  exception when others then
   if sqlerrm like 'Unsafe identity%' then
    update canonicalization_candidates set status='review',last_error=sqlerrm,updated_at=now() where candidate_key=item.candidate_key;reviewed:=reviewed+1;
   else
    update canonicalization_candidates set status='failed',last_error=sqlerrm,updated_at=now() where candidate_key=item.candidate_key;failed:=failed+1;
   end if;
  end;
 end loop;
 return jsonb_build_object('status','processed','merged',merged,'review',reviewed,'failed',failed,'outcomes',outcomes);
end;$$;
revoke all on function public.run_implicit_first_season_merge_batch(integer) from public,anon,authenticated;
grant execute on function public.run_implicit_first_season_merge_batch(integer) to service_role;
notify pgrst,'reload schema';
commit;
