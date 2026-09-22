-- The TMDB feed is useful for international releases but does not discover
-- Vietnamese cinema trailers promptly. Keep it scheduled, then add a separate
-- public cinema-catalogue discovery source for early, trailer-backed SEO pages.
do $$
declare
  tmdb_command text := $cmd$
    select net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-tmdb-catalog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'VIETNAM_CINEMA_TRAILER_SECRET' order by created_at desc limit 1)
      ),
      body := jsonb_build_object('pages', 4, 'limit', 220, 'months', 8),
      timeout_milliseconds := 240000
    );
  $cmd$;
  cinema_command text := $cmd$
    select net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-vietnam-cinema-trailers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'VIETNAM_CINEMA_TRAILER_SECRET' order by created_at desc limit 1)
      ),
      body := jsonb_build_object('limit', 30),
      timeout_milliseconds := 240000
    );
  $cmd$;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sync-tmdb-catalog-daily') then
      perform cron.alter_job((select jobid from cron.job where jobname = 'sync-tmdb-catalog-daily'), schedule := '20 1,9,17 * * *', command := tmdb_command);
    else
      perform cron.schedule('sync-tmdb-catalog-daily', '20 1,9,17 * * *', tmdb_command);
    end if;

    if exists (select 1 from cron.job where jobname = 'sync-vietnam-cinema-trailers') then
      perform cron.alter_job((select jobid from cron.job where jobname = 'sync-vietnam-cinema-trailers'), schedule := '7 */2 * * *', command := cinema_command);
    else
      perform cron.schedule('sync-vietnam-cinema-trailers', '7 */2 * * *', cinema_command);
    end if;
  end if;
end $$;

-- Trigger the first refresh immediately after deployment. The function keeps
-- the same strict official-YouTube-trailer gate as its recurring run.
select net.http_post(
  url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-vietnam-cinema-trailers',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'VIETNAM_CINEMA_TRAILER_SECRET' order by created_at desc limit 1)
  ),
  body := jsonb_build_object('limit', 30),
  timeout_milliseconds := 240000
);
