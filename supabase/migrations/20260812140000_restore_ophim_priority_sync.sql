-- The latest OPhim ingestion job was found inactive while the runtime
-- capacity controller was healthy and did not own that job. Restore the
-- bounded priority feed without enabling any historical/bulk backfill.
do $scheduler$
declare
  target_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  select jobid into target_job_id
  from cron.job
  where jobname = 'sync-ophim-priority-every-15-minutes'
  order by jobid desc
  limit 1;

  if target_job_id is null then
    perform cron.schedule(
      'sync-ophim-priority-every-15-minutes',
      '1,16,31,46 * * * *',
      $cmd$
        select net.http_get(
          url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-ophim-movies?provider=ophim&pages=1&limit=8&episodes=1',
          headers := jsonb_build_object(
            'x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
          ),
          timeout_milliseconds := 150000
        );
      $cmd$
    );
  else
    perform cron.alter_job(
      target_job_id,
      schedule := '1,16,31,46 * * * *',
      command := $cmd$
        select net.http_get(
          url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-ophim-movies?provider=ophim&pages=1&limit=8&episodes=1',
          headers := jsonb_build_object(
            'x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
          ),
          timeout_milliseconds := 150000
        );
      $cmd$,
      active := true
    );
  end if;
end;
$scheduler$;
