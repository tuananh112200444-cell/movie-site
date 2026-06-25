select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('streams', 'episodes', 'movie_episodes', 'stream_health_logs')
order by table_name, ordinal_position;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('streams', 'episodes', 'movie_episodes', 'stream_health_logs')
order by tablename, indexname;
