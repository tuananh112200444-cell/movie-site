do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-ophim-priority-every-15-minutes') then
    perform cron.unschedule('sync-ophim-priority-every-15-minutes');
  end if;

  if exists (select 1 from cron.job where jobname = 'sync-kkphim-priority-every-15-minutes') then
    perform cron.unschedule('sync-kkphim-priority-every-15-minutes');
  end if;

  perform cron.schedule(
    'sync-ophim-priority-every-15-minutes',
    '1,16,31,46 * * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies?provider=ophim&pages=1&limit=8&episodes=1',
        headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)),
        timeout_milliseconds := 150000
      );
    $cmd$
  );

  perform cron.schedule(
    'sync-kkphim-priority-every-15-minutes',
    '6,21,36,51 * * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies?provider=kkphim&pages=1&limit=8&episodes=1',
        headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)),
        timeout_milliseconds := 150000
      );
    $cmd$
  );
end $$;
