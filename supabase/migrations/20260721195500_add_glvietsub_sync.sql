do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-glvietsub-feed-every-15-minutes') then
    perform cron.unschedule('sync-glvietsub-feed-every-15-minutes');
  end if;
  perform cron.schedule(
    'sync-glvietsub-feed-every-15-minutes',
    '4,19,34,49 * * * *',
    $cmd$select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-glvietsub-feed?limit=3',
      headers := jsonb_build_object(
        'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
      ),
      timeout_milliseconds := 120000
    );$cmd$
  );

  if exists (select 1 from cron.job where jobname = 'warm-home-proxy-every-15-minutes') then
    perform cron.unschedule('warm-home-proxy-every-15-minutes');
  end if;
  perform cron.schedule(
    'warm-home-proxy-every-15-minutes',
    '7,22,37,52 * * * *',
    $cmd$select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/home-proxy?refresh=1',
      headers := jsonb_build_object(
        'x-home-proxy-refresh', '1'
      ),
      timeout_milliseconds := 120000
    );$cmd$
  );
end $$;
