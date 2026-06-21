select key, page, updated_at
from public.sync_cursors
where key ilike '%blvietsub%'
order by updated_at desc nulls last;

select function_name, run_at, scanned, added, skipped, errors, success, elapsed_ms, details
from public.sync_logs
where function_name ilike '%blvietsub%'
order by run_at desc
limit 10;
