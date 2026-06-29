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
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-blvietsub-feed?limit=20&use_cursor=1&cursor_key=blvietsub_sitemap_external&refresh_search=1&secret=kp-sync-5dc07b34ca8740ffb7c17a67b1430e36750a9082eca640dd88b6fce6f2219708',
      timeout_milliseconds := 120000
    );
  $$
);
