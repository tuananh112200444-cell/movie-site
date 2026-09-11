-- Keep the newest KKPhim episode releases fresh during Vietnam viewing peaks.
-- The connector itself hard-caps this privileged path to one page / four titles
-- with episode ingestion enabled, while runtime capacity protection still wins.

insert into public.system_brain_tasks (
  task_key, brain, handler, params, priority, interval_seconds, enabled,
  status, next_run_at, lease_until, consecutive_failures, last_error, updated_at
)
values (
  'catalog:kkphim-peak-freshness',
  'catalog',
  'sync-ophim-movies',
  '{"provider":"kkphim","pages":1,"limit":4,"episodes":1,"peak_freshness":1,"_timeout_ms":100000}'::jsonb,
  5,
  900,
  true,
  'idle',
  now(),
  null,
  0,
  null,
  now()
)
on conflict (task_key) do update
set brain = excluded.brain,
    handler = excluded.handler,
    params = excluded.params,
    priority = excluded.priority,
    interval_seconds = excluded.interval_seconds,
    enabled = true,
    status = 'idle',
    next_run_at = least(public.system_brain_tasks.next_run_at, now()),
    lease_until = null,
    consecutive_failures = 0,
    last_error = null,
    updated_at = now();

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'catalog-brain-peak-freshness';

  perform cron.schedule(
    'catalog-brain-peak-freshness',
    '2-59/15 4-6,11-16 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/catalog-brain?limit=1',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 110000
      );
    $cmd$
  );
end;
$scheduler$;

-- Trigger the reported title immediately. The target path bypasses the broad
-- peak-hour catalogue guard but retains all identity and playback gates.
select net.http_get(
  url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-ophim-movies?provider=kkphim&slug=tinh-yeu-noi-loan-phan-2&limit=1&episodes=1',
  headers := jsonb_build_object(
    'x-cron-secret',
    (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
  ),
  timeout_milliseconds := 110000
);
