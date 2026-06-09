-- Harden movie deduplication without blocking deploys on existing duplicate rows.
-- This migration adds audit surfaces and supporting indexes. Actual duplicate rows
-- should be merged through the admin-movie-upsert merge action before adding stricter
-- unique constraints on title/year groups.

create index if not exists movies_published_normalized_name_year_idx
  on public.movies ((lower(trim(coalesce(normalized_name, '')))), year, updated_at desc)
  where is_published = true
    and nullif(trim(coalesce(normalized_name, '')), '') is not null;

create index if not exists movies_published_title_year_idx
  on public.movies ((lower(trim(coalesce(name, '')))), year, updated_at desc)
  where is_published = true
    and nullif(trim(coalesce(name, '')), '') is not null;

create index if not exists movies_published_origin_year_idx
  on public.movies ((lower(trim(coalesce(origin_name, '')))), year, updated_at desc)
  where is_published = true
    and nullif(trim(coalesce(origin_name, '')), '') is not null;

create index if not exists movies_source_published_updated_idx
  on public.movies (source_site, is_published, updated_at desc);

create table if not exists public.movie_merge_audit (
  id bigserial primary key,
  target_movie_id uuid not null,
  target_slug text not null,
  source_movie_ids uuid[] not null default '{}',
  source_slugs text[] not null default '{}',
  reason text not null default 'manual',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists movie_merge_audit_target_created_idx
  on public.movie_merge_audit (target_movie_id, created_at desc);

alter table public.movie_merge_audit enable row level security;

drop policy if exists "No public movie merge audit access" on public.movie_merge_audit;

create or replace view public.movie_duplicate_candidates
with (security_invoker = true)
as
with candidate_keys as (
  select
    id,
    slug,
    name,
    origin_name,
    year,
    source_site,
    source_name,
    updated_at,
    lower(trim(coalesce(normalized_name, ''))) as normalized_key,
    lower(trim(coalesce(origin_name, ''))) as origin_key,
    lower(trim(coalesce(ophim_slug, ''))) as ophim_slug_key,
    lower(trim(coalesce(ophim_id, ''))) as ophim_id_key,
    lower(trim(coalesce(imdb_id, ''))) as imdb_id_key,
    tmdb_id
  from public.movies
  where is_published = true
),
groups as (
  select 'normalized_origin_year'::text as reason, normalized_key || '|' || origin_key as dedup_key, year, array_agg(id order by updated_at desc) as ids
  from candidate_keys
  where normalized_key <> '' and origin_key <> '' and year is not null
  group by normalized_key, origin_key, year
  having count(*) > 1

  union all

  select 'ophim_slug'::text as reason, ophim_slug_key as dedup_key, null::integer as year, array_agg(id order by updated_at desc) as ids
  from candidate_keys
  where ophim_slug_key <> ''
  group by ophim_slug_key
  having count(*) > 1

  union all

  select 'ophim_id'::text as reason, ophim_id_key as dedup_key, null::integer as year, array_agg(id order by updated_at desc) as ids
  from candidate_keys
  where ophim_id_key <> ''
  group by ophim_id_key
  having count(*) > 1

  union all

  select 'tmdb_id'::text as reason, tmdb_id::text as dedup_key, null::integer as year, array_agg(id order by updated_at desc) as ids
  from candidate_keys
  where tmdb_id is not null
  group by tmdb_id
  having count(*) > 1
)
select
  groups.reason,
  groups.dedup_key,
  groups.year,
  cardinality(groups.ids) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'id', candidate_keys.id,
      'slug', candidate_keys.slug,
      'name', candidate_keys.name,
      'origin_name', candidate_keys.origin_name,
      'source_site', candidate_keys.source_site,
      'source_name', candidate_keys.source_name,
      'updated_at', candidate_keys.updated_at
    )
    order by candidate_keys.updated_at desc
  ) as movies
from groups
join candidate_keys on candidate_keys.id = any(groups.ids)
group by groups.reason, groups.dedup_key, groups.year, groups.ids;
