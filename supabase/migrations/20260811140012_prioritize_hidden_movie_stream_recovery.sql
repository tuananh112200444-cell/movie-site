-- Restore titles promptly when a provider CDN recovers. pg_cron uses UTC.
-- The recovery queue checks one source per hidden movie and is deliberately
-- small during Viet Nam viewing peaks (04-07 and 12-16 UTC).

do $scheduler$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'stream-health-hidden-recovery-offpeak',
    'stream-health-hidden-recovery-peak'
  );

  perform cron.schedule(
    'stream-health-hidden-recovery-offpeak',
    '4-59/5 0-3,8-11,17-23 * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=recovery&limit=30&movie_limit=60&concurrency=4&deactivate_after=3',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 90000
      );
    $cmd$
  );

  perform cron.schedule(
    'stream-health-hidden-recovery-peak',
    '4,14,24,34,44,54 4-7,12-16 * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=recovery&limit=8&movie_limit=24&concurrency=2&deactivate_after=3',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 60000
      );
    $cmd$
  );
end;
$scheduler$;
