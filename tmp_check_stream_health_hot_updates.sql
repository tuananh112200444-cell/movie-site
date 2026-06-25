select health_status, count(*)::int as total, min(response_time_ms)::int as fastest_ms, max(response_time_ms)::int as slowest_ms
from public.streams
where last_checked_at > now() - interval '10 minutes'
group by health_status
order by total desc;
