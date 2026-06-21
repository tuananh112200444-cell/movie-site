select
  id,
  source,
  updated_at,
  expires_at,
  expires_at > now() as is_valid,
  jsonb_array_length(coalesce(sections->'items', '[]'::jsonb)) as item_count,
  pg_size_pretty(pg_column_size(sections)::bigint) as sections_size
from public.home_page_cache
where id = 'search_index_v2';
