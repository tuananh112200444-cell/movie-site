-- A slow problem-source probe can consume the whole sequential Playback Brain
-- request. Keep gap prevention ahead of recovery while preserving the latter
-- at the next priority tier.
update public.system_brain_tasks
set priority = 4,
    updated_at = now()
where task_key = 'playback:problem';

update public.system_brain_tasks
set priority = 5,
    consecutive_failures = 0,
    last_error = null,
    status = 'idle',
    lease_until = null,
    next_run_at = case task_key
      when 'playback:unchecked' then now() - interval '3 minutes'
      when 'playback:provider-verification' then now() - interval '2 minutes'
      else now() - interval '1 minute'
    end,
    updated_at = now()
where task_key in (
  'playback:newest',
  'playback:unchecked',
  'playback:provider-verification'
);
