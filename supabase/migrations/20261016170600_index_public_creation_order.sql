-- The API predicate is = true, not the IS TRUE predicate in older feed indexes.
create index concurrently if not exists movies_public_creation_order_idx
  on public.movies (created_at desc nulls last, id desc)
  where is_published = true;
