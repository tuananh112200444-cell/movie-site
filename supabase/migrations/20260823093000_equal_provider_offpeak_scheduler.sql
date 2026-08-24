-- Provider-neutral source policy and Vietnam-aware scheduler.
-- pg_cron runs in UTC. Heavy windows below map to:
--   00:00-05:59 ICT (17:00-22:59 UTC)  : night / lowest viewer load
--   06:00-10:59 and 14:00-17:59 ICT    : shoulder / reduced frequency
--   11:00-13:59 and 18:00-23:59 ICT    : peak / no catalog sync

insert into public.system_brain_tasks (
  task_key, brain, handler, params, priority, interval_seconds, enabled,
  status, next_run_at, lease_until, consecutive_failures, last_error, updated_at
)
values
  ('catalog:ophim-recent', 'catalog', 'sync-ophim-movies', '{"provider":"ophim","pages":1,"limit":4,"episodes":1,"_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now(), null, 0, null, now()),
  ('catalog:kkphim-recent', 'catalog', 'sync-ophim-movies', '{"provider":"kkphim","pages":1,"limit":4,"episodes":1,"_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now() + interval '1 minute', null, 0, null, now()),
  ('catalog:vsmov-recent', 'catalog', 'sync-ophim-movies', '{"provider":"vsmov","pages":1,"limit":4,"episodes":1,"_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now() + interval '2 minutes', null, 0, null, now()),
  ('catalog:nguonc-recent', 'catalog', 'sync-ophim-movies', '{"provider":"nguonc","pages":1,"limit":4,"episodes":1,"_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now() + interval '3 minutes', null, 0, null, now()),
  ('catalog:blvietsub-recent', 'catalog', 'sync-blvietsub-feed', '{"limit":4,"offset":0,"page_size":60,"refresh_search":0,"_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now() + interval '4 minutes', null, 0, null, now()),
  ('catalog:glvietsub-recent', 'catalog', 'sync-glvietsub-feed', '{"limit":4,"recent":1,"_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now() + interval '5 minutes', null, 0, null, now()),
  ('catalog:motchill-recent', 'catalog', 'sync-motchill-feed', '{"limit":4,"_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now() + interval '6 minutes', null, 0, null, now()),
  ('catalog:onlyflix-recent', 'catalog', 'sync-onlyflix-feed', '{"limit":4,"_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now() + interval '7 minutes', null, 0, null, now()),
  ('catalog:cobephim-recent', 'catalog', 'sync-cobephim-feed', '{"limit":4,"use_cursor":1,"cursor_key":"cobephim_equal_pool","_timeout_ms":100000}'::jsonb, 4, 3600, true, 'idle', now() + interval '8 minutes', null, 0, null, now()),
  ('catalog:provider-repair', 'catalog', 'unified-provider-brain', '{"limit":1,"provider_budget":4,"_timeout_ms":110000}'::jsonb, 5, 1800, true, 'idle', now() + interval '9 minutes', null, 0, null, now())
on conflict (task_key) do update
set brain = excluded.brain,
    handler = excluded.handler,
    params = excluded.params,
    priority = excluded.priority,
    interval_seconds = excluded.interval_seconds,
    enabled = true,
    status = 'idle',
    next_run_at = excluded.next_run_at,
    lease_until = null,
    consecutive_failures = 0,
    last_error = null,
    updated_at = now();

comment on table public.system_brain_tasks is
  'Durable fair queue. API provider tasks use the same priority and interval; playback quality is selected only by measured score.';

do $scheduler$
declare
  retired_jobs text[] := array[
    'auto-repair-player-issues-every-10-minutes',
    'catalog-brain-every-2-minutes',
    'dispatch-catalog-source-repairs-every-2-minutes',
    'dispatch-catalog-source-repairs-peak-guard',
    'playback-audit-newest-a',
    'playback-audit-newest-b',
    'playback-audit-newest-c',
    'playback-brain-every-3-minutes',
    'process-playback-learning-queue',
    'recheck-motchill-ongoing-every-10-minutes',
    'refresh-playback-provider-coverage-every-10-minutes',
    'stream-health-check-every-15-minutes',
    'stream-health-hidden-recovery-offpeak',
    'stream-health-hidden-recovery-peak',
    'stream-health-hot-every-5-minutes',
    'stream-health-hot-peak-guard',
    'stream-health-problem-every-15-minutes',
    'stream-health-stale-hourly',
    'stream-health-unchecked-every-15-minutes',
    'sync-blvietsub-feed-backfill-every-30-minutes',
    'sync-blvietsub-feed-every-15-minutes',
    'sync-blvietsub-recent-peak-guard',
    'sync-cobephim-backup-every-10-minutes',
    'sync-gap-playback-providers-offpeak',
    'sync-glvietsub-feed-every-15-minutes',
    'sync-glvietsub-recent-every-15-minutes',
    'sync-glvietsub-recent-peak-guard',
    'sync-kkphim-priority-every-15-minutes',
    'sync-motchill-feed-every-10-minutes',
    'sync-onlyflix-feed-hourly',
    'sync-ophim-priority-every-15-minutes',
    'sync-provider-backups-every-30-minutes',
    'unified-provider-brain-every-30-minutes'
  ];
  new_jobs text[] := array[
    'catalog-brain-night',
    'catalog-brain-shoulder',
    'playback-brain-night',
    'playback-brain-shoulder',
    'playback-brain-peak-guard'
  ];
  current_mode text := 'normal';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.alter_job(jobid, active := false)
  from cron.job
  where jobname = any(retired_jobs);

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = any(new_jobs);

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'evaluate-runtime-capacity-every-2-minutes',
    'evaluate-runtime-capacity-every-5-minutes'
  );

  perform cron.schedule(
    'evaluate-runtime-capacity-every-5-minutes',
    '*/5 * * * *',
    'select public.evaluate_runtime_capacity();'
  );

  perform cron.schedule(
    'catalog-brain-night',
    '3-58/5 17-22 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/catalog-brain?limit=2',
        headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
        timeout_milliseconds := 120000
      );
    $cmd$
  );
  perform cron.schedule(
    'catalog-brain-shoulder',
    '7,22,37,52 23,0-3,7-10 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/catalog-brain?limit=1',
        headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
        timeout_milliseconds := 120000
      );
    $cmd$
  );
  perform cron.schedule(
    'playback-brain-night',
    '1-56/5 17-22 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/playback-brain?limit=2',
        headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
        timeout_milliseconds := 120000
      );
    $cmd$
  );
  perform cron.schedule(
    'playback-brain-shoulder',
    '9,24,39,54 23,0-3,7-10 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/playback-brain?limit=1',
        headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
        timeout_milliseconds := 120000
      );
    $cmd$
  );
  perform cron.schedule(
    'playback-brain-peak-guard',
    '12,42 4-6,11-16 * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/playback-brain?limit=1',
        headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
        timeout_milliseconds := 90000
      );
    $cmd$
  );

  delete from public.runtime_capacity_managed_jobs
  where job_name = any(retired_jobs);

  insert into public.runtime_capacity_managed_jobs (job_name, paused_by_capacity_guard, paused_at, updated_at)
  select unnest(new_jobs), false, null, now()
  on conflict (job_name) do update
  set paused_by_capacity_guard = false,
      paused_at = null,
      updated_at = now();

  select mode into current_mode
  from public.runtime_capacity_state
  where singleton = true;

  if current_mode = 'protect' then
    perform cron.alter_job(jobid, active := false)
    from cron.job
    where jobname = any(new_jobs);

    update public.runtime_capacity_managed_jobs
    set paused_by_capacity_guard = true,
        paused_at = now(),
        updated_at = now()
    where job_name = any(new_jobs);
  end if;
end;
$scheduler$;
