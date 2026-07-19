do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'publish-movie-feed-websub';
    perform cron.schedule(
      'publish-movie-feed-websub',
      '*/30 * * * *',
      $cmd$
      select net.http_post(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/movie-rss-feed',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' order by created_at desc limit 1),
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
      $cmd$
    );
  end if;
end $$;
