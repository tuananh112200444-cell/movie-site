select jsonb_pretty(jsonb_agg(row_to_json(c)::jsonb order by table_name, ordinal_position)) as columns
from (
  select
    table_name,
    ordinal_position,
    column_name,
    data_type,
    is_nullable,
    column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('streams', 'episodes', 'movie_episodes', 'stream_health_logs')
) c;
