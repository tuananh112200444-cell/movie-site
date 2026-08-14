-- Add two low-volume, gap-only playback connectors. They never run in Viet
-- Nam viewing peaks and are part of the existing runtime capacity circuit.

insert into public.runtime_capacity_managed_jobs (job_name)
values ('sync-gap-playback-providers-offpeak')
on conflict (job_name) do nothing;

do $scheduler$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'sync-gap-playback-providers-offpeak';

  -- pg_cron is UTC. These windows are ICT 00:00-06:59, 07:00-10:59 and
  -- 15:00-18:59; 11:00-14:59 and 19:00-23:59 remain viewer-only windows.
  perform cron.schedule(
    'sync-gap-playback-providers-offpeak',
    '9,39 0-3,8-11,17-23 * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-gap-playback-providers?limit=2&scan_limit=12&cooldown_hours=24&providers=vsmov',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 90000
      );
    $cmd$
  );
end;
$scheduler$;

comment on table public.runtime_capacity_managed_jobs is
  'Non-critical background jobs paused automatically when viewer-facing database pressure is detected.';
