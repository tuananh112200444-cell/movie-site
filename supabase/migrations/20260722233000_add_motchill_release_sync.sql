do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-motchill-feed-every-10-minutes') then
    perform cron.unschedule('sync-motchill-feed-every-10-minutes');
  end if;
  perform cron.schedule(
    'sync-motchill-feed-every-10-minutes',
    '2,12,22,32,42,52 * * * *',
    $cmd$select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-motchill-feed?limit=8',
      headers := jsonb_build_object(
        'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
      ),
      timeout_milliseconds := 120000
    );$cmd$
  );
end $$;
