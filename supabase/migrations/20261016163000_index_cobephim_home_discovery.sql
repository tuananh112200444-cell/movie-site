-- This home-proxy OR predicate otherwise scans all published movies, including
-- large provider metadata strings, on every cache refresh. Index only matching
-- rows in the requested order; CONCURRENTLY keeps movie ingestion available.
-- Run outside a transaction (including when applying this migration manually).
create index concurrently if not exists movies_cobephim_home_discovery_idx
  on public.movies (updated_at desc nulls last)
  where is_published = true
    and (
      source_site = 'cobephim'
      or source_name ilike '%CobePhim%'
      or source_url ilike '%cobephim%'
      or showtimes ilike '%cobephim%'
      or source_url ilike '%streamvsmov%'
      or showtimes ilike '%streamvsmov%'
    );
