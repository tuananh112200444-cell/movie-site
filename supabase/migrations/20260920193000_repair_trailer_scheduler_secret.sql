-- A dedicated scheduler secret avoids coupling trailer discovery to legacy
-- cron credentials. The Edge Functions still verify this value themselves.
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
    perform cron.alter_job((select jobid from cron.job where jobname = 'sync-tmdb-catalog-daily'), schedule := '20 1,9,17 * * *', command := tmdb_command);
    perform cron.alter_job((select jobid from cron.job where jobname = 'sync-vietnam-cinema-trailers'), schedule := '7 */2 * * *', command := cinema_command);
  end if;
end $$;
