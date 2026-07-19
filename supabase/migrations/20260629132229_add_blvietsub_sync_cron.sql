do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-blvietsub-feed-every-15-minutes') then
    perform cron.unschedule('sync-blvietsub-feed-every-15-minutes');
  end if;
end $$;

select cron.schedule(
  'sync-blvietsub-feed-every-15-minutes',
  '3,18,33,48 * * * *',
  $$
    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-blvietsub-feed?limit=20&use_cursor=1&cursor_key=blvietsub_sitemap_external&refresh_search=1',
      headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)),
      timeout_milliseconds := 120000
    );
  $$
);
