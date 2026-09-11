-- The queue index fix removes the statement-timeout cause. Reset only the
-- viewer-facing verification tasks so the scheduler retries them immediately;
-- playback learning remains demoted until its separate analytics query is fixed.
update public.system_brain_tasks
set consecutive_failures = 0,
    last_error = null,
    next_run_at = now(),
    status = 'idle',
    lease_until = null,
    updated_at = now()
where task_key in (
  'playback:newest',
  'playback:unchecked',
  'playback:provider-verification'
);
