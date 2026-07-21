-- RAW episodes can be added to an older GLVietsub title without changing the
-- catalogue sitemap timestamp. Complete a full rotating catalogue pass much
-- sooner so those releases are discovered without manual intervention.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-glvietsub-feed-every-15-minutes') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'sync-glvietsub-feed-every-15-minutes'),
      command := $cmd$select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-glvietsub-feed?limit=8',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 120000
      );$cmd$
    );
  end if;
end $$;
