-- Google Indexing API is only intended for JobPosting/BroadcastEvent pages,
-- not ordinary movie detail URLs. Discovery remains automated through dynamic
-- sitemaps, RSS/WebSub and internal links.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-ping-google-daily') then
    perform cron.unschedule('auto-ping-google-daily');
  end if;
end $$;
