-- Complete the OR predicate used by search_movies_fast. Without this index,
-- normalized_name can force PostgreSQL to scan every published document even
-- though search_blob and slug are already backed by trigram GIN indexes.
create index if not exists movie_search_documents_normalized_name_trgm_idx
  on public.movie_search_documents using gin (normalized_name gin_trgm_ops)
  where is_published = true;

analyze public.movie_search_documents;
