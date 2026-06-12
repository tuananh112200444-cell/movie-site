alter table public.movies
  add column if not exists seo_catalog_status text not null default 'published',
  add column if not exists catalog_source text,
  add column if not exists tmdb_media_type text,
  add column if not exists tmdb_popularity numeric,
  add column if not exists tmdb_vote_count integer,
  add column if not exists tmdb_vote_average numeric,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists catalog_synced_at timestamptz,
  add column if not exists catalog_window_start date,
  add column if not exists catalog_window_end date;

update public.movies
set seo_catalog_status = 'published'
where seo_catalog_status is null;

create index if not exists movies_seo_catalog_status_updated_idx
  on public.movies (seo_catalog_status, updated_at desc)
  where is_published = true;

create index if not exists movies_catalog_source_synced_idx
  on public.movies (catalog_source, catalog_synced_at desc)
  where catalog_source is not null;

create index if not exists movies_tmdb_media_type_popularity_idx
  on public.movies (tmdb_media_type, tmdb_popularity desc nulls last)
  where tmdb_id is not null and is_published = true;

create index if not exists movies_release_at_catalog_idx
  on public.movies (release_at desc)
  where is_published = true and release_at is not null;

create index if not exists movies_tmdb_catalog_search_idx
  on public.movies using gin (
    (
      coalesce(name, '') || ' ' ||
      coalesce(origin_name, '') || ' ' ||
      coalesce(title_vi, '') || ' ' ||
      coalesce(title_en, '') || ' ' ||
      coalesce(title_original, '') || ' ' ||
      coalesce(normalized_name, '')
    ) gin_trgm_ops
  )
  where is_published = true;
