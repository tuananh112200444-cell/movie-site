do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-onlyflix-feed-hourly') then
    perform cron.unschedule('sync-onlyflix-feed-hourly');
  end if;
  perform cron.schedule(
    'sync-onlyflix-feed-hourly',
    '29 * * * *',
    $cmd$select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-onlyflix-feed?limit=2',
      headers := jsonb_build_object(
        'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
      ),
      timeout_milliseconds := 120000
    );$cmd$
  );
end $$;
