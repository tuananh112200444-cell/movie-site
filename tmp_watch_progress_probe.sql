select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'watch_progress'
order by ordinal_position;

select count(*) as total_rows
from public.watch_progress;
