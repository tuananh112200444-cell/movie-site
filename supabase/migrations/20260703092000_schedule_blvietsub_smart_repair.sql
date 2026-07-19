do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-blvietsub-smart-repair-every-30-minutes') then
    perform cron.unschedule('sync-blvietsub-smart-repair-every-30-minutes');
  end if;
end $$;

select cron.schedule(
  'sync-blvietsub-smart-repair-every-30-minutes',
  '13,43 * * * *',
  $$
    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-blvietsub-feed?repair_existing=1&limit=4&refresh_search=0',
      headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)),
      timeout_milliseconds := 150000
    );
  $$
);
