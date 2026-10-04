-- Re-enable the conservative TMDB enrichment queue in the active Singapore
-- project. The runtime capacity row said the job was available, but pg_cron
-- had the job inactive, so retired artwork could never heal in the background.

do $scheduler$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'enrich-tmdb-metadata-offpeak';

    perform cron.schedule(
      'enrich-tmdb-metadata-offpeak',
      '7-57/10 17-22 * * *',
      $job$
        select net.http_post(
          url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/enrich-tmdb-metadata',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
          ),
          body := '{"limit":15}'::jsonb,
          timeout_milliseconds := 120000
        );
      $job$
    );

    -- Start one bounded batch now so this migration verifies the complete
    -- database -> Edge Function path without waiting for the next window.
    perform net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/enrich-tmdb-metadata',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
      ),
      body := '{"limit":15}'::jsonb,
      timeout_milliseconds := 120000
    );
  end if;

  if to_regclass('public.runtime_capacity_managed_jobs') is not null then
    insert into public.runtime_capacity_managed_jobs (
      job_name, paused_by_capacity_guard, paused_at, updated_at
    ) values (
      'enrich-tmdb-metadata-offpeak', false, null, now()
    )
    on conflict (job_name) do update set
      paused_by_capacity_guard = false,
      paused_at = null,
      updated_at = now();
  end if;
end;
$scheduler$;
