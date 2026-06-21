select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name ilike '%player%'
    or table_name ilike '%video%'
    or table_name ilike '%watch%'
    or table_name ilike '%event%'
    or table_name ilike '%error%'
  )
order by table_name;
