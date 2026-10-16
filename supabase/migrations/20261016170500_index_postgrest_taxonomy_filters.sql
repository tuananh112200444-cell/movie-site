-- PostgREST emits `is_published = $n` (simplified to a bare boolean when true).
-- Existing taxonomy indexes use `is_published IS TRUE`, which the planner does
-- not prove from that expression. Match the API predicate exactly. A single
-- multicolumn GIN supports category, country, and their intersection.
create index concurrently if not exists movies_public_taxonomy_filter_idx
  on public.movies using gin (category jsonb_path_ops, country jsonb_path_ops)
  where is_published = true;
