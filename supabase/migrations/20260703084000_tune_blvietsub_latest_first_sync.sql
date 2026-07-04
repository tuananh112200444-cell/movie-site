do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-blvietsub-feed-every-15-minutes') then
    perform cron.unschedule('sync-blvietsub-feed-every-15-minutes');
  end if;

  if exists (select 1 from cron.job where jobname = 'sync-blvietsub-feed-backfill-every-30-minutes') then
    perform cron.unschedule('sync-blvietsub-feed-backfill-every-30-minutes');
  end if;
end $$;

select cron.schedule(
  'sync-blvietsub-feed-every-15-minutes',
  '3,18,33,48 * * * *',
  $$
    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-blvietsub-feed?limit=24&offset=0&page_size=150&refresh_search=0&secret=YOUR_CRON_SECRET',
      timeout_milliseconds := 120000
    );
  $$
);

select cron.schedule(
  'sync-blvietsub-feed-backfill-every-30-minutes',
  '8,38 * * * *',
  $$
    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-blvietsub-feed?limit=12&use_cursor=1&cursor_key=blvietsub_sitemap_external&refresh_search=0&secret=YOUR_CRON_SECRET',
      timeout_milliseconds := 120000
    );
  $$
);
