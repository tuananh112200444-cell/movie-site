select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('movie_episodes', 'episodes', 'streams')
order by table_name, ordinal_position;
