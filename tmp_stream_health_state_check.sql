select
  id,
  episode_slug,
  server_name,
  is_active,
  health_status,
  failure_count,
  response_time_ms,
  last_checked_at,
  last_error
from public.streams
where id in (
  '8092b6fe-6ba4-4e1b-a052-5139a0df4c1d',
  'b51704c0-f2c9-44b0-a695-43c72fd89c52',
  '741c502d-25e6-4b21-ac74-0b1576e90942',
  '5ffbed02-1cc6-4b92-b21f-ebbb5e8ce528',
  '8907bcba-72cb-4669-9357-9001f7fc6ecc'
)
order by episode_slug;

select
  health_status,
  is_active,
  count(*) as total
from public.streams
group by health_status, is_active
order by health_status, is_active;
