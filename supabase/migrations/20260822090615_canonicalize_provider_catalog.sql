-- One canonical identity and one transactional merge path for every catalogue
-- connector. Provider slugs remain routing aliases; they are never movie IDs.

alter table public.movies
  add column if not exists season_number integer,
  add column if not exists canonical_identity_key text,
  add column if not exists superseded_by_movie_id uuid references public.movies(id) on delete set null,
  add column if not exists canonicalized_at timestamptz;

create index if not exists movies_superseded_by_idx
  on public.movies (superseded_by_movie_id)
  where superseded_by_movie_id is not null;

create index if not exists movies_canonical_lookup_idx
  on public.movies (year, type, season_number, canonical_identity_key)
  where superseded_by_movie_id is null;

do $provider_constraint$
declare item record;
begin
  for item in
    select conname
    from pg_constraint
    where conrelid = 'public.provider_movie_identities'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    execute format('alter table public.provider_movie_identities drop constraint %I', item.conname);
  end loop;
end;
$provider_constraint$;

do $provider_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.provider_movie_identities'::regclass
      and conname = 'provider_movie_identities_provider_format_check'
  ) then
    alter table public.provider_movie_identities
      add constraint provider_movie_identities_provider_format_check
      check (provider ~ '^[a-z0-9][a-z0-9_-]{1,31}$') not valid;
  end if;
end;
$provider_constraint$;

create table if not exists public.canonical_movie_identities (
  identity_key text primary key,
  movie_id uuid not null references public.movies(id) on delete cascade,
  identity_kind text not null check (identity_kind in ('tmdb', 'imdb', 'original_title')),
  confidence text not null check (confidence in ('authoritative', 'strict')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists canonical_movie_identities_movie_idx
  on public.canonical_movie_identities (movie_id);

create table if not exists public.canonicalization_candidates (
  candidate_key text primary key,
  identity_kind text not null,
  identity_value text not null,
  release_year integer,
  movie_type text not null default '',
  season_number integer,
  movie_ids uuid[] not null,
  canonical_movie_id uuid references public.movies(id) on delete set null,
  confidence_tier text not null check (confidence_tier in ('A', 'B')),
  status text not null default 'pending' check (status in ('pending', 'ready', 'review', 'approved', 'processing', 'merged', 'rejected', 'failed')),
  evidence jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error text,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  merged_at timestamptz
);

create index if not exists canonicalization_candidates_queue_idx
  on public.canonicalization_candidates (confidence_tier, status, updated_at, candidate_key)
  where status in ('ready', 'approved', 'failed');

create table if not exists public.canonical_merge_ledger (
  id uuid primary key default gen_random_uuid(),
  candidate_key text references public.canonicalization_candidates(candidate_key) on delete set null,
  canonical_movie_id uuid not null references public.movies(id) on delete restrict,
  source_movie_ids uuid[] not null,
  canonical_slug text not null,
  source_slugs text[] not null,
  status text not null check (status in ('processing', 'completed', 'rolled_back', 'failed')),
  reason text not null,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz
);

create index if not exists canonical_merge_ledger_candidate_idx
  on public.canonical_merge_ledger (candidate_key, started_at desc);

create table if not exists public.canonical_merge_archive (
  merge_id uuid not null references public.canonical_merge_ledger(id) on delete cascade,
  table_name text not null,
  source_movie_id uuid,
  row_key text not null,
  row_data jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (merge_id, table_name, row_key)
);

create index if not exists canonical_merge_archive_source_idx
  on public.canonical_merge_archive (source_movie_id, merge_id);

alter table public.canonical_movie_identities enable row level security;
alter table public.canonicalization_candidates enable row level security;
alter table public.canonical_merge_ledger enable row level security;
alter table public.canonical_merge_archive enable row level security;

revoke all on table public.canonical_movie_identities, public.canonicalization_candidates,
  public.canonical_merge_ledger, public.canonical_merge_archive from public, anon, authenticated;
grant select, insert, update, delete on table public.canonical_movie_identities,
  public.canonicalization_candidates, public.canonical_merge_ledger,
  public.canonical_merge_archive to service_role;

create or replace function public.canonical_movie_type(p_type text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_catalog, pg_temp
as $$
  select case
    when lower(trim(coalesce(p_type, ''))) in ('single','movie','phim-le','phim le','phim-chieu-rap') then 'single'
    when lower(trim(coalesce(p_type, ''))) in ('series','tv','phim-bo','phim bo','hoathinh','tvshows') then 'series'
    else ''
  end
$$;

create or replace function public.canonical_season_number(p_title text, p_explicit integer default null)
returns integer
language sql
immutable
parallel safe
set search_path = public, pg_catalog, pg_temp
as $$
  select coalesce(
    nullif(p_explicit, 0),
    nullif((regexp_match(public.kp_search_normalize(p_title), '(season|phan|mua|s) ([0-9]{1,2})( |$)'))[2]::integer, 0)
  )
$$;

create or replace function public.canonical_identity_fingerprint(
  p_tmdb_id integer,
  p_imdb_id text,
  p_original_title text,
  p_year integer,
  p_type text,
  p_season integer
)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_catalog, pg_temp
as $$
  select case
    when coalesce(p_tmdb_id, 0) > 0 then
      concat_ws(':', 'tmdb', public.canonical_movie_type(p_type), p_tmdb_id::text, coalesce(p_season, 0)::text)
    when nullif(lower(trim(coalesce(p_imdb_id, ''))), '') is not null then
      concat_ws(':', 'imdb', lower(trim(p_imdb_id)), public.canonical_movie_type(p_type), coalesce(p_season, 0)::text)
    when p_year between 1888 and 2200
      and public.canonical_movie_type(p_type) <> ''
      and length(public.kp_search_normalize(p_original_title)) >= 3 then
      concat_ws(':', 'title', public.kp_search_normalize(p_original_title), p_year::text,
        public.canonical_movie_type(p_type), coalesce(p_season, 0)::text)
    else null
  end
$$;

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
begin
  if v_provider !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
    raise exception 'Invalid provider: %', p_provider;
  end if;
  if v_provider_slug = '' or v_provider_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid provider slug: %', p_provider_slug;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('provider:' || v_provider || ':' || v_provider_slug, 0));
  if v_identity is not null then
    perform pg_advisory_xact_lock(hashtextextended('canonical:' || v_identity, 0));
  end if;

  select identity.movie_id into v_movie_id
  from public.provider_movie_identities identity
  join public.movies movie on movie.id = identity.movie_id
  where identity.provider = v_provider
    and identity.provider_slug = v_provider_slug
    and movie.superseded_by_movie_id is null;
  if v_movie_id is not null then
    v_method := 'provider_identity';
    v_confidence := 'authoritative';
  end if;

  if v_movie_id is null and v_identity is not null then
    select identity.movie_id into v_movie_id
    from public.canonical_movie_identities identity
    join public.movies movie on movie.id = identity.movie_id
    where identity.identity_key = v_identity
      and movie.superseded_by_movie_id is null;
    if v_movie_id is not null then
      v_method := split_part(v_identity, ':', 1);
      v_confidence := case when v_method in ('tmdb','imdb') then 'authoritative' else 'strict' end;
    end if;
  end if;

  if v_movie_id is null and coalesce(p_tmdb_id, 0) > 0 then
    select movie.id into v_movie_id
    from public.movies movie
    where movie.tmdb_id = p_tmdb_id
      and movie.superseded_by_movie_id is null
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
      and movie.superseded_by_movie_id is null
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
      and movie.superseded_by_movie_id is null
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
      tmdb_id, imdb_id, season_number, canonical_identity_key,
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
      nullif(p_tmdb_id, 0), nullif(trim(p_imdb_id), ''), v_season, v_identity,
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
    from public.canonical_movie_identities identity
    where identity.identity_key = v_identity;
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

revoke all on function public.resolve_canonical_movie(text,text,text,integer,text,text,text,integer,text,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.resolve_canonical_movie(text,text,text,integer,text,text,text,integer,text,integer,text,text)
  to service_role;

do $bulk_resolver$
begin
  if to_regprocedure('public.bulk_ingest_provider_catalog_legacy(text,jsonb)') is null then
    alter function public.bulk_ingest_provider_catalog(text,jsonb)
      rename to bulk_ingest_provider_catalog_legacy;
  end if;
end;
$bulk_resolver$;

create or replace function public.bulk_ingest_provider_catalog(
  p_provider text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  item jsonb;
  movie jsonb;
  provider_slug text;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Bulk catalogue payload must be an array';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    movie := coalesce(item->'movie', '{}'::jsonb);
    provider_slug := lower(trim(coalesce(item->>'provider_slug', movie->>'slug', '')));
    perform * from public.resolve_canonical_movie(
      p_provider => lower(trim(p_provider)),
      p_provider_slug => provider_slug,
      p_provider_id => trim(coalesce(item->>'provider_id', provider_slug)),
      p_tmdb_id => nullif(coalesce(movie->>'tmdb_id',''),'')::integer,
      p_imdb_id => coalesce(movie->>'imdb_id',''),
      p_original_title => coalesce(movie->>'title_original',movie->>'origin_name',''),
      p_localized_title => coalesce(movie->>'title_vi',movie->>'name',''),
      p_year => nullif(coalesce(movie->>'year',''),'')::integer,
      p_movie_type => coalesce(movie->>'type',''),
      p_season => null,
      p_create_slug => coalesce(movie->>'slug',provider_slug),
      p_source_name => case lower(trim(p_provider)) when 'phimapi' then 'KKPhim' when 'nguonc' then 'NguonC' else p_provider end
    );
  end loop;

  return public.bulk_ingest_provider_catalog_legacy(p_provider, p_items);
end;
$$;

revoke all on function public.bulk_ingest_provider_catalog(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.bulk_ingest_provider_catalog(text,jsonb) to service_role;

create or replace function public.scan_canonicalization_candidates(p_limit integer default 2000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  affected integer := 0;
  split_issues integer := 0;
begin
  with normalized as materialized (
    select
      movie.id,
      movie.tmdb_id,
      movie.imdb_id,
      movie.year,
      public.canonical_movie_type(movie.type) as movie_type,
      coalesce(movie.season_number,
        public.canonical_season_number(concat_ws(' ', movie.origin_name, movie.title_original), null), 0) as season_number,
      public.kp_search_normalize(coalesce(
        nullif(movie.title_original, ''), nullif(movie.origin_name, ''),
        nullif(movie.original_title, ''), nullif(movie.title_en, '')
      )) as original_title,
      movie.slug,
      movie.name,
      movie.is_published,
      movie.created_at,
      movie.current_episode,
      movie.total_episodes,
      movie.superseded_by_movie_id
    from public.movies movie
    where movie.superseded_by_movie_id is null
      and lower(coalesce(movie.seo_catalog_status, '')) <> 'superseded'
  ), grouped as materialized (
    select
      case when count(*) filter (where coalesce(tmdb_id, 0) > 0) = count(*)
            and count(distinct tmdb_id) = 1
        then 'tmdb' else 'original_title' end as identity_kind,
      case when count(*) filter (where coalesce(tmdb_id, 0) > 0) = count(*)
            and count(distinct tmdb_id) = 1
        then max(tmdb_id)::text else original_title end as identity_value,
      year,
      movie_type,
      season_number,
      array_agg(id order by
        is_published desc,
        coalesce(current_episode, 0) desc,
        coalesce(total_episodes, 0) desc,
        created_at asc,
        id) as movie_ids,
      array_agg(slug order by created_at asc, id) as slugs,
      array_agg(name order by created_at asc, id) as names,
      count(distinct tmdb_id) filter (where coalesce(tmdb_id, 0) > 0) as tmdb_conflicts,
      count(distinct imdb_id) filter (where nullif(trim(coalesce(imdb_id, '')), '') is not null) as imdb_conflicts,
      count(*) as duplicate_count
    from normalized
    where year between 1888 and 2200
      and movie_type <> ''
      and length(original_title) >= 3
    group by original_title, year, movie_type, season_number
    having count(*) > 1
    order by count(*) desc, original_title
    limit greatest(1, least(coalesce(p_limit, 2000), 5000))
  ), inserted as (
    insert into public.canonicalization_candidates as candidate (
      candidate_key, identity_kind, identity_value, release_year, movie_type,
      season_number, movie_ids, confidence_tier, status, evidence, detected_at, updated_at
    )
    select
      md5(concat_ws('|', identity_kind, identity_value, year, movie_type, season_number)) as candidate_key,
      identity_kind,
      identity_value,
      year,
      movie_type,
      nullif(season_number, 0),
      movie_ids,
      case when tmdb_conflicts <= 1 and imdb_conflicts <= 1 then 'A' else 'B' end,
      case when tmdb_conflicts <= 1 and imdb_conflicts <= 1 then 'ready' else 'review' end,
      jsonb_build_object(
        'duplicate_count', duplicate_count,
        'slugs', slugs,
        'names', names,
        'tmdb_conflicts', tmdb_conflicts,
        'imdb_conflicts', imdb_conflicts,
        'contract', 'canonical_identity_v1'
      ),
      now(), now()
    from grouped
    on conflict (candidate_key) do update set
      movie_ids = excluded.movie_ids,
      confidence_tier = excluded.confidence_tier,
      status = case
        when candidate.status in ('merged','rejected','approved','processing') then candidate.status
        else excluded.status
      end,
      evidence = excluded.evidence,
      updated_at = now()
    returning candidate_key
  )
  select count(*) into affected from inserted;

  with split as materialized (
    select distinct on (candidate.candidate_key, missing.movie_id, missing.provider)
      candidate.candidate_key,
      missing.movie_id,
      ready.movie_id as related_movie_id,
      missing.provider,
      missing.state as missing_state,
      ready.state as sibling_state,
      ready.episode_count,
      ready.playable_stream_count
    from public.canonicalization_candidates candidate
    cross join lateral unnest(candidate.movie_ids) missing_id(movie_id)
    join public.movie_provider_coverage missing on missing.movie_id = missing_id.movie_id
      and missing.state in ('missing','unavailable','error')
    cross join lateral unnest(candidate.movie_ids) ready_id(movie_id)
    join public.movie_provider_coverage ready on ready.movie_id = ready_id.movie_id
      and ready.provider = missing.provider
      and ready.state in ('ready','pending','degraded')
      and ready.playable_stream_count > 0
    where candidate.status in ('ready','review','approved')
      and ready.movie_id <> missing.movie_id
    order by candidate.candidate_key, missing.movie_id, missing.provider,
      ready.best_playback_score desc, ready.playable_stream_count desc, ready.movie_id
  ), upserted as (
    insert into public.catalog_integrity_issues as issue (
      issue_key, issue_type, movie_id, related_movie_id, severity, confidence,
      status, evidence, first_detected_at, last_detected_at, attempts
    )
    select
      'split_provider_coverage:' || candidate_key || ':' || movie_id::text || ':' || provider,
      'split_provider_coverage', movie_id, related_movie_id, 5, 1,
      'open', jsonb_build_object(
        'candidate_key', candidate_key,
        'provider', provider,
        'missing_state', missing_state,
        'sibling_state', sibling_state,
        'sibling_episode_count', episode_count,
        'sibling_playable_stream_count', playable_stream_count
      ), now(), now(), 0
    from split
    on conflict (issue_key) do update set
      related_movie_id = excluded.related_movie_id,
      status = case when issue.status = 'resolved' then 'resolved' else 'open' end,
      evidence = excluded.evidence,
      last_detected_at = now()
    returning issue_key
  )
  select count(*) into split_issues from upserted;

  return jsonb_build_object(
    'success', true,
    'candidates_scanned', affected,
    'split_provider_coverage_issues', split_issues,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.scan_canonicalization_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.scan_canonicalization_candidates(integer) to service_role;

create or replace function public.archive_canonical_merge_table(
  p_merge_id uuid,
  p_table_name text,
  p_source_movie_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
declare
  allowed constant text[] := array[
    'episodes','movie_episodes','streams','movie_sources','stream_health_logs',
    'movie_enrichment','movie_provider_coverage','movie_refresh_queue',
    'movie_search_documents','movie_seo_quality_status','movie_tmdb_enrichment_status',
    'provider_movie_identities','schedule_email_notifications','seo_url_inspections',
    'catalog_integrity_issues','subtitle_tracks','thai_bl_episodes','thai_bl_streams',
    'watch_progress'
  ];
  affected integer := 0;
begin
  if not p_table_name = any(allowed) or to_regclass('public.' || p_table_name) is null then
    return 0;
  end if;

  execute format($sql$
    insert into public.canonical_merge_archive (
      merge_id, table_name, source_movie_id, row_key, row_data
    )
    select $1, %L, row.movie_id,
      coalesce(nullif(to_jsonb(row)->>'id', ''), nullif(to_jsonb(row)->>'provider', ''), 'row')
        || ':' || md5(to_jsonb(row)::text),
      to_jsonb(row)
    from public.%I row
    where row.movie_id = any($2)
    on conflict (merge_id, table_name, row_key) do nothing
  $sql$, p_table_name, p_table_name)
  using p_merge_id, p_source_movie_ids;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.archive_canonical_merge_table(uuid,text,uuid[])
  from public, anon, authenticated;

create or replace function public.merge_canonicalization_candidate(
  p_candidate_key text,
  p_canonical_movie_id uuid default null,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  candidate public.canonicalization_candidates%rowtype;
  target public.movies%rowtype;
  source public.movies%rowtype;
  source_ids uuid[];
  source_slugs text[];
  merge_id uuid;
  table_name text;
  archived jsonb := '{}'::jsonb;
  moved jsonb := '{}'::jsonb;
  affected integer;
begin
  select * into candidate
  from public.canonicalization_candidates
  where candidate_key = p_candidate_key
  for update;

  if not found then raise exception 'Canonicalization candidate not found: %', p_candidate_key; end if;
  if candidate.status not in ('ready','approved','failed') then
    raise exception 'Candidate % is not mergeable (status=%)', p_candidate_key, candidate.status;
  end if;
  if candidate.confidence_tier <> 'A' and candidate.status <> 'approved' then
    raise exception 'Tier B candidate requires explicit approval: %', p_candidate_key;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('canonical-merge:' || p_candidate_key, 0));
  perform 1 from public.movies where id = any(candidate.movie_ids) order by id for update;

  select movie.* into target
  from public.movies movie
  where movie.id = any(candidate.movie_ids)
    and movie.superseded_by_movie_id is null
    and (p_canonical_movie_id is null or movie.id = p_canonical_movie_id)
  order by
    case when p_canonical_movie_id is not null and movie.id = p_canonical_movie_id then 1 else 0 end desc,
    movie.is_published desc,
    public.movie_has_usable_persisted_playback(movie.id) desc,
    coalesce(movie.current_episode, 0) desc,
    coalesce(movie.total_episodes, 0) desc,
    case when lower(concat_ws(' ', movie.source_site, movie.source_name)) ~ '(admin|supabase|blvietsub)' then 1 else 0 end desc,
    movie.created_at asc,
    movie.id
  limit 1;

  if target.id is null then raise exception 'No active canonical movie for candidate %', p_candidate_key; end if;

  select coalesce(array_agg(id order by id), array[]::uuid[]),
         coalesce(array_agg(slug order by id), array[]::text[])
  into source_ids, source_slugs
  from public.movies
  where id = any(candidate.movie_ids)
    and id <> target.id
    and superseded_by_movie_id is null;

  if cardinality(source_ids) = 0 then
    update public.canonicalization_candidates
    set status='merged', canonical_movie_id=target.id, merged_at=now(), updated_at=now(), last_error=null
    where candidate_key=p_candidate_key;
    return jsonb_build_object('success', true, 'already_merged', true, 'canonical_movie_id', target.id, 'canonical_slug', target.slug);
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'success', true, 'dry_run', true, 'candidate_key', p_candidate_key,
      'canonical_movie_id', target.id, 'canonical_slug', target.slug,
      'source_movie_ids', source_ids, 'source_slugs', source_slugs,
      'confidence_tier', candidate.confidence_tier, 'evidence', candidate.evidence
    );
  end if;

  update public.canonicalization_candidates
  set status='processing', attempts=attempts+1, updated_at=now(), last_error=null
  where candidate_key=p_candidate_key;

  insert into public.canonical_merge_ledger (
    candidate_key, canonical_movie_id, source_movie_ids, canonical_slug,
    source_slugs, status, reason
  ) values (
    p_candidate_key, target.id, source_ids, target.slug,
    source_slugs, 'processing', 'auto-safe-canonical-identity-v1'
  ) returning id into merge_id;

  insert into public.canonical_merge_archive (merge_id, table_name, source_movie_id, row_key, row_data)
  select merge_id, 'movies', movie.id, movie.id::text, to_jsonb(movie)
  from public.movies movie where movie.id = any(source_ids);

  foreach table_name in array array[
    'episodes','movie_episodes','streams','movie_sources','stream_health_logs',
    'movie_enrichment','movie_provider_coverage','movie_refresh_queue',
    'movie_search_documents','movie_seo_quality_status','movie_tmdb_enrichment_status',
    'provider_movie_identities','schedule_email_notifications','seo_url_inspections',
    'catalog_integrity_issues','subtitle_tracks','thai_bl_episodes','thai_bl_streams','watch_progress'
  ] loop
    affected := public.archive_canonical_merge_table(merge_id, table_name, source_ids);
    archived := archived || jsonb_build_object(table_name, affected);
  end loop;

  for source in
    select movie.* from public.movies movie where movie.id = any(source_ids) order by movie.id
  loop
    -- Release globally unique external identities first. The archived source
    -- record still carries their original values, so the target can adopt
    -- them later in this same transaction without a transient unique clash.
    update public.movies
    set tmdb_id=null,imdb_id='',ophim_id='',ophim_slug=null,updated_at=now()
    where id=source.id;

    update public.movies canonical
    set title_vi = coalesce(nullif(canonical.title_vi,''), nullif(source.title_vi,''), canonical.title_vi),
        title_en = coalesce(nullif(canonical.title_en,''), nullif(source.title_en,''), canonical.title_en),
        title_original = coalesce(nullif(canonical.title_original,''), nullif(source.title_original,''), canonical.title_original),
        origin_name = coalesce(nullif(canonical.origin_name,''), nullif(source.origin_name,''), canonical.origin_name),
        content = case when length(coalesce(source.content,'')) > length(coalesce(canonical.content,'')) then source.content else canonical.content end,
        thumb_url = coalesce(nullif(canonical.thumb_url,''), nullif(source.thumb_url,''), canonical.thumb_url),
        poster_url = coalesce(nullif(canonical.poster_url,''), nullif(source.poster_url,''), canonical.poster_url),
        backdrop_url = coalesce(nullif(canonical.backdrop_url,''), nullif(source.backdrop_url,''), canonical.backdrop_url),
        trailer_url = coalesce(nullif(canonical.trailer_url,''), nullif(source.trailer_url,''), canonical.trailer_url),
        tmdb_id = coalesce(canonical.tmdb_id, source.tmdb_id),
        imdb_id = coalesce(nullif(canonical.imdb_id,''), nullif(source.imdb_id,''), canonical.imdb_id),
        ophim_id = coalesce(nullif(canonical.ophim_id,''), nullif(source.ophim_id,''), canonical.ophim_id),
        ophim_slug = coalesce(nullif(canonical.ophim_slug,''), nullif(source.ophim_slug,''), canonical.ophim_slug),
        current_episode = greatest(coalesce(canonical.current_episode,0), coalesce(source.current_episode,0)),
        total_episodes = greatest(coalesce(canonical.total_episodes,0), coalesce(source.total_episodes,0)),
        episode_current = case when coalesce(source.current_episode,0) > coalesce(canonical.current_episode,0) then source.episode_current else canonical.episode_current end,
        episode_total = case when coalesce(source.total_episodes,0) > coalesce(canonical.total_episodes,0) then source.episode_total else canonical.episode_total end,
        category = case when coalesce(jsonb_array_length(canonical.category),0)=0 then source.category else canonical.category end,
        country = case when coalesce(jsonb_array_length(canonical.country),0)=0 then source.country else canonical.country end,
        season_number = coalesce(canonical.season_number, source.season_number, candidate.season_number),
        canonical_identity_key = coalesce(canonical.canonical_identity_key,
          public.canonical_identity_fingerprint(coalesce(canonical.tmdb_id,source.tmdb_id),
            coalesce(canonical.imdb_id,source.imdb_id), candidate.identity_value,
            candidate.release_year, candidate.movie_type, candidate.season_number)),
        canonicalized_at = now(), updated_at = now()
    where canonical.id = target.id;

    update public.streams target_stream
    set stream_url = case when coalesce(source_stream.playback_score,0) > coalesce(target_stream.playback_score,0) then source_stream.stream_url else target_stream.stream_url end,
        embed_url = case when coalesce(source_stream.playback_score,0) > coalesce(target_stream.playback_score,0) then source_stream.embed_url else target_stream.embed_url end,
        subtitle_url = coalesce(nullif(target_stream.subtitle_url,''), nullif(source_stream.subtitle_url,''), target_stream.subtitle_url),
        health_status = case when coalesce(source_stream.playback_score,0) > coalesce(target_stream.playback_score,0) then source_stream.health_status else target_stream.health_status end,
        playback_score = greatest(coalesce(target_stream.playback_score,0), coalesce(source_stream.playback_score,0)),
        failure_count = least(coalesce(target_stream.failure_count,0), coalesce(source_stream.failure_count,0)),
        last_checked_at = greatest(target_stream.last_checked_at, source_stream.last_checked_at),
        updated_at = now()
    from public.streams source_stream
    where source_stream.movie_id = source.id and target_stream.movie_id = target.id
      and lower(trim(target_stream.source)) = lower(trim(source_stream.source))
      and lower(trim(target_stream.server_name)) = lower(trim(source_stream.server_name))
      and lower(trim(target_stream.episode_slug)) = lower(trim(source_stream.episode_slug));

    delete from public.streams source_stream
    using public.streams target_stream
    where source_stream.movie_id=source.id and target_stream.movie_id=target.id
      and lower(trim(source_stream.source))=lower(trim(target_stream.source))
      and lower(trim(source_stream.server_name))=lower(trim(target_stream.server_name))
      and lower(trim(source_stream.episode_slug))=lower(trim(target_stream.episode_slug));
    update public.streams set movie_id=target.id, updated_at=now() where movie_id=source.id;

    delete from public.movie_episodes source_row using public.movie_episodes target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and lower(trim(source_row.server_name))=lower(trim(target_row.server_name))
      and source_row.episode_number=target_row.episode_number;
    update public.movie_episodes set movie_id=target.id, updated_at=now() where movie_id=source.id;

    delete from public.episodes source_row using public.episodes target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and lower(trim(source_row.server_name))=lower(trim(target_row.server_name))
      and lower(trim(coalesce(source_row.episode_slug,'')))=lower(trim(coalesce(target_row.episode_slug,'')));
    update public.episodes set movie_id=target.id where movie_id=source.id;

    delete from public.movie_sources source_row using public.movie_sources target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and lower(trim(source_row.source_name))=lower(trim(target_row.source_name))
      and lower(trim(source_row.source_movie_id))=lower(trim(target_row.source_movie_id));
    update public.movie_sources set movie_id=target.id, updated_at=now() where movie_id=source.id;

    update public.stream_health_logs set movie_id=target.id where movie_id=source.id;
    update public.subtitle_tracks set movie_id=target.id where movie_id=source.id;

    delete from public.watch_progress source_row using public.watch_progress target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and source_row.episode_slug=target_row.episode_slug;
    update public.watch_progress set movie_id=target.id where movie_id=source.id;

    delete from public.schedule_email_notifications source_row using public.schedule_email_notifications target_row
    where source_row.movie_id=source.id and target_row.movie_id=target.id
      and source_row.target_episode_number=target_row.target_episode_number
      and source_row.target_at=target_row.target_at
      and lower(source_row.recipient_email)=lower(target_row.recipient_email);
    update public.schedule_email_notifications set movie_id=target.id, movie_slug=target.slug where movie_id=source.id;

    update public.provider_movie_identities set movie_id=target.id where movie_id=source.id;
    update public.canonical_movie_identities set movie_id=target.id, updated_at=now() where movie_id=source.id;
    update public.catalog_integrity_issues set movie_id=target.id where movie_id=source.id;
    update public.catalog_integrity_issues set related_movie_id=target.id where related_movie_id=source.id;
    update public.seo_url_inspections set movie_id=target.id where movie_id=source.id;

    delete from public.movie_enrichment where movie_id=source.id;
    delete from public.movie_provider_coverage where movie_id=source.id;
    delete from public.movie_refresh_queue where movie_id=source.id;
    delete from public.movie_search_documents where movie_id=source.id;
    delete from public.movie_seo_quality_status where movie_id=source.id;
    delete from public.movie_tmdb_enrichment_status where movie_id=source.id;

    delete from public.playback_learning_queue source_row using public.playback_learning_queue target_row
    where source_row.movie_slug=source.slug and target_row.movie_slug=target.slug
      and source_row.episode_slug=target_row.episode_slug and source_row.source_host=target_row.source_host;
    update public.playback_learning_queue set movie_slug=target.slug where movie_slug=source.slug;
    update public.player_error_events set movie_slug=target.slug where movie_slug=source.slug;

    if exists (select 1 from public.movie_reviews where slug=source.slug) then
      if exists (select 1 from public.movie_reviews where slug=target.slug) then
        delete from public.movie_reviews where slug=source.slug;
      else
        update public.movie_reviews set slug=target.slug where slug=source.slug;
      end if;
    end if;

    insert into public.movie_slug_aliases(alias_slug,movie_id,canonical_slug,reason,updated_at)
    values(source.slug,target.id,target.slug,'canonical-identity-v1',now())
    on conflict(alias_slug) do update set movie_id=excluded.movie_id,
      canonical_slug=excluded.canonical_slug, reason=excluded.reason, updated_at=now();

    update public.movies
    set is_published=false, seo_catalog_status='superseded', superseded_by_movie_id=target.id,
        source_site='merged', source_name='Merged into '||target.slug,
        tmdb_id=null, imdb_id='', ophim_id='', ophim_slug=null,
        canonicalized_at=now(), updated_at=now()
    where id=source.id;
  end loop;

  update public.canonical_movie_identities set movie_id=target.id, updated_at=now()
  where identity_key = public.canonical_identity_fingerprint(
    target.tmdb_id,target.imdb_id,candidate.identity_value,candidate.release_year,
    candidate.movie_type,candidate.season_number
  );

  perform public.refresh_movie_provider_coverage(array[target.id]);
  perform public.enqueue_movie_refresh(target.id, 'canonical_movies_merged');
  delete from public.movie_api_cache where slug=target.slug or slug=any(source_slugs);
  delete from public.home_page_cache where id <> '__never__';

  update public.catalog_integrity_issues
  set status='resolved', resolved_at=now(), last_error=null
  where issue_type='split_provider_coverage'
    and (movie_id=target.id or related_movie_id=target.id)
    and evidence->>'candidate_key'=p_candidate_key;

  update public.canonicalization_candidates
  set status='merged', canonical_movie_id=target.id, merged_at=now(), updated_at=now(), last_error=null
  where candidate_key=p_candidate_key;

  update public.canonical_merge_ledger
  set status='completed', completed_at=now(), summary=jsonb_build_object(
    'archived_rows',archived,'source_count',cardinality(source_ids),
    'canonical_movie_id',target.id,'canonical_slug',target.slug
  ) where id=merge_id;

  return jsonb_build_object(
    'success',true,'merge_id',merge_id,'candidate_key',p_candidate_key,
    'canonical_movie_id',target.id,'canonical_slug',target.slug,
    'source_movie_ids',source_ids,'source_slugs',source_slugs,'archived_rows',archived
  );
exception when others then
  if merge_id is not null then
    update public.canonical_merge_ledger set status='failed',error_message=sqlerrm,completed_at=now() where id=merge_id;
  end if;
  update public.canonicalization_candidates set status='failed',last_error=sqlerrm,updated_at=now()
  where candidate_key=p_candidate_key;
  raise;
end;
$$;

revoke all on function public.merge_canonicalization_candidate(text,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.merge_canonicalization_candidate(text,uuid,boolean) to service_role;

create table if not exists public.provider_operational_policy (
  provider text primary key,
  ingest_enabled boolean not null default true,
  playback_mode text not null default 'normal' check (playback_mode in ('normal','last_resort','disabled')),
  playback_penalty integer not null default 0,
  reason text not null default '',
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.provider_operational_policy enable row level security;
revoke all on table public.provider_operational_policy from public, anon, authenticated;
grant select, insert, update, delete on table public.provider_operational_policy to service_role;

insert into public.provider_operational_policy(provider,ingest_enabled,playback_mode,playback_penalty,reason)
values
  ('ophim',false,'last_resort',900,'Widespread opstream DNS/404/5xx failures verified on 2026-08-22; healthy rows remain available'),
  ('kkphim',true,'normal',0,''),
  ('nguonc',true,'normal',0,''),
  ('vsmov',true,'normal',0,'')
on conflict(provider) do update set
  ingest_enabled=excluded.ingest_enabled,
  playback_mode=excluded.playback_mode,
  playback_penalty=excluded.playback_penalty,
  reason=excluded.reason,
  reviewed_at=now(),updated_at=now();

do $disable_ophim_ingest$
begin
  if to_regclass('public.system_brain_tasks') is not null then
    update public.system_brain_tasks
    set enabled=false,status='idle',lease_until=null,
        last_error='Paused by provider operational policy: OPhim playback clusters degraded',
        updated_at=now()
    where task_key='catalog:ophim-recent';
  end if;

  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.alter_job(jobid,active:=false)
    from cron.job
    where jobname in ('sync-ophim-priority-every-15-minutes','sync-ophim-movies-every-15-minutes');
  end if;
end;
$disable_ophim_ingest$;

create or replace function public.quarantine_conclusively_broken_ophim_streams(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  affected integer:=0;
  movie_ids uuid[]:=array[]::uuid[];
begin
  with batch as materialized (
    select stream.id
    from public.streams stream
    where stream.provider_key='ophim'
      and stream.is_active is true
      and stream.failure_count >= 2
      and lower(coalesce(stream.health_status,'')) in ('failed','dead')
      and lower(coalesce(stream.last_error,'')) ~ '(dns error|failed to lookup|name or service not known|http (404|410)|http status (404|410))'
    order by stream.last_checked_at asc nulls first,stream.id
    limit greatest(1,least(coalesce(p_limit,1000),5000))
    for update skip locked
  ), changed as (
    update public.streams stream
    set is_active=false,health_status='dead',
        last_error=case when stream.last_error like 'Quarantined:%' then stream.last_error
          else 'Quarantined: conclusively broken OPhim source; '||stream.last_error end,
        updated_at=now()
    from batch where stream.id=batch.id
    returning stream.movie_id
  )
  select count(*),coalesce(array_agg(distinct movie_id),array[]::uuid[])
  into affected,movie_ids from changed;

  if cardinality(movie_ids)>0 then
    perform public.refresh_movie_provider_coverage(movie_ids);
  end if;
  return jsonb_build_object('success',true,'quarantined',affected,'movies',cardinality(movie_ids),'checked_at',now());
end;
$$;

revoke all on function public.quarantine_conclusively_broken_ophim_streams(integer)
  from public, anon, authenticated;
grant execute on function public.quarantine_conclusively_broken_ophim_streams(integer) to service_role;

create or replace function public.process_canonicalization_batch(
  p_limit integer default 5,
  p_require_split_coverage boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  item record;
  result jsonb;
  merged integer:=0;
  failed integer:=0;
  failures jsonb:='[]'::jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtextextended(
    'process-canonicalization-batch:'||p_require_split_coverage::text,0
  )) then
    return jsonb_build_object('success',true,'status','already_running','merged',0,'failed',0);
  end if;

  for item in
    select candidate.candidate_key
    from public.canonicalization_candidates candidate
    where candidate.status='ready' and candidate.confidence_tier='A'
      and (
        not p_require_split_coverage or exists(
          select 1 from public.catalog_integrity_issues issue
          where issue.issue_type='split_provider_coverage' and issue.status='open'
            and issue.evidence->>'candidate_key'=candidate.candidate_key
        )
      )
    order by candidate.updated_at,candidate.candidate_key
    limit greatest(1,least(coalesce(p_limit,5),25))
    for update of candidate skip locked
  loop
    begin
      result:=public.merge_canonicalization_candidate(item.candidate_key,null,false);
      if coalesce((result->>'success')::boolean,false) then merged:=merged+1; end if;
    exception when others then
      failed:=failed+1;
      failures:=failures||jsonb_build_array(jsonb_build_object('candidate_key',item.candidate_key,'error',sqlerrm));
      update public.canonicalization_candidates
      set status='failed',attempts=attempts+1,last_error=sqlerrm,updated_at=now()
      where candidate_key=item.candidate_key;
    end;
  end loop;

  return jsonb_build_object('success',true,'merged',merged,'failed',failed,'failures',failures,'checked_at',now());
end;
$$;

revoke all on function public.process_canonicalization_batch(integer,boolean)
  from public, anon, authenticated;
grant execute on function public.process_canonicalization_batch(integer,boolean) to service_role;

create or replace function public.rollback_canonical_merge(p_merge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  ledger public.canonical_merge_ledger%rowtype;
  archived record;
  restored integer:=0;
begin
  select * into ledger from public.canonical_merge_ledger where id=p_merge_id for update;
  if not found then raise exception 'Merge ledger not found: %',p_merge_id; end if;
  if ledger.status<>'completed' then raise exception 'Only a completed merge can be rolled back (status=%)',ledger.status; end if;
  if exists(
    select 1 from public.canonical_merge_ledger later
    where later.canonical_movie_id=ledger.canonical_movie_id and later.status='completed'
      and later.started_at>ledger.started_at
  ) then raise exception 'A later merge depends on this canonical movie'; end if;

  perform pg_advisory_xact_lock(hashtextextended('canonical-merge:'||coalesce(ledger.candidate_key,p_merge_id::text),0));
  perform 1 from public.movies where id=ledger.canonical_movie_id or id=any(ledger.source_movie_ids) order by id for update;

  for archived in
    select row_data from public.canonical_merge_archive
    where merge_id=p_merge_id and table_name='movies'
    order by source_movie_id
  loop
    update public.movies movie set
      is_published=coalesce((archived.row_data->>'is_published')::boolean,false),
      seo_catalog_status=coalesce(archived.row_data->>'seo_catalog_status','published'),
      source_site=coalesce(archived.row_data->>'source_site',''),
      source_name=archived.row_data->>'source_name',
      tmdb_id=nullif(archived.row_data->>'tmdb_id','')::integer,
      imdb_id=archived.row_data->>'imdb_id',
      ophim_id=archived.row_data->>'ophim_id',
      ophim_slug=archived.row_data->>'ophim_slug',
      season_number=nullif(archived.row_data->>'season_number','')::integer,
      canonical_identity_key=archived.row_data->>'canonical_identity_key',
      superseded_by_movie_id=null,
      canonicalized_at=nullif(archived.row_data->>'canonicalized_at','')::timestamptz,
      updated_at=now()
    where movie.id=(archived.row_data->>'id')::uuid;
    restored:=restored+1;
  end loop;

  for archived in select row_data from public.canonical_merge_archive where merge_id=p_merge_id and table_name='streams'
  loop
    insert into public.streams select (jsonb_populate_record(null::public.streams,archived.row_data)).*
    on conflict(id) do update set movie_id=excluded.movie_id;
  end loop;
  for archived in select row_data from public.canonical_merge_archive where merge_id=p_merge_id and table_name='movie_episodes'
  loop
    insert into public.movie_episodes select (jsonb_populate_record(null::public.movie_episodes,archived.row_data)).*
    on conflict(id) do update set movie_id=excluded.movie_id;
  end loop;
  for archived in select row_data from public.canonical_merge_archive where merge_id=p_merge_id and table_name='episodes'
  loop
    insert into public.episodes select (jsonb_populate_record(null::public.episodes,archived.row_data)).*
    on conflict(id) do update set movie_id=excluded.movie_id;
  end loop;
  for archived in select row_data from public.canonical_merge_archive where merge_id=p_merge_id and table_name='movie_sources'
  loop
    insert into public.movie_sources select (jsonb_populate_record(null::public.movie_sources,archived.row_data)).*
    on conflict(id) do update set movie_id=excluded.movie_id;
  end loop;
  for archived in select row_data from public.canonical_merge_archive where merge_id=p_merge_id and table_name='stream_health_logs'
  loop
    insert into public.stream_health_logs select (jsonb_populate_record(null::public.stream_health_logs,archived.row_data)).*
    on conflict(id) do update set movie_id=excluded.movie_id,stream_id=excluded.stream_id;
  end loop;
  for archived in select row_data from public.canonical_merge_archive where merge_id=p_merge_id and table_name='subtitle_tracks'
  loop
    insert into public.subtitle_tracks select (jsonb_populate_record(null::public.subtitle_tracks,archived.row_data)).*
    on conflict(id) do update set movie_id=excluded.movie_id;
  end loop;
  for archived in select row_data from public.canonical_merge_archive where merge_id=p_merge_id and table_name='watch_progress'
  loop
    insert into public.watch_progress select (jsonb_populate_record(null::public.watch_progress,archived.row_data)).*
    on conflict(id) do update set movie_id=excluded.movie_id;
  end loop;
  for archived in select row_data from public.canonical_merge_archive where merge_id=p_merge_id and table_name='provider_movie_identities'
  loop
    update public.provider_movie_identities set movie_id=(archived.row_data->>'movie_id')::uuid
    where provider=archived.row_data->>'provider' and provider_slug=archived.row_data->>'provider_slug';
  end loop;

  delete from public.movie_slug_aliases where alias_slug=any(ledger.source_slugs) and movie_id=ledger.canonical_movie_id;
  perform public.refresh_movie_provider_coverage(array_append(ledger.source_movie_ids,ledger.canonical_movie_id));
  perform public.enqueue_movie_refresh(ledger.canonical_movie_id,'canonical_merge_rolled_back');

  update public.canonicalization_candidates set status='ready',canonical_movie_id=null,merged_at=null,
    last_error='Rolled back merge '||p_merge_id::text,updated_at=now()
  where candidate_key=ledger.candidate_key;
  update public.canonical_merge_ledger set status='rolled_back',rolled_back_at=now() where id=p_merge_id;

  return jsonb_build_object('success',true,'merge_id',p_merge_id,'restored_source_movies',restored,'rolled_back_at',now());
end;
$$;

revoke all on function public.rollback_canonical_merge(uuid) from public,anon,authenticated;
grant execute on function public.rollback_canonical_merge(uuid) to service_role;

comment on table public.provider_operational_policy is
  'Operational circuit breaker. OPhim is paused and last-resort, not hard-deleted; verified recovery can reverse the policy.';
