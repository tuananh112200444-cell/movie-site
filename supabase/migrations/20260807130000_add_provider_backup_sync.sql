-- Cross-provider backfill is deliberately small and staggered. It reuses the
-- identity-checked sync function rather than creating a second episode writer.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-provider-backups-every-30-minutes') then
    perform cron.unschedule('sync-provider-backups-every-30-minutes');
  end if;

  perform cron.schedule(
    'sync-provider-backups-every-30-minutes',
    '14,44 * * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-provider-backups?limit=3&scan_limit=36',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 120000
      );
    $cmd$
  );
end $$;
