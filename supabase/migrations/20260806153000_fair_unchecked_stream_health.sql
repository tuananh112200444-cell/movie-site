-- New catalogue imports arrive continuously. The hot queue used to recheck
-- the same recently-updated streams, leaving many active single-source films
-- unverified even though health capacity was available. The Edge Function now
-- spends that queue only on unchecked streams and spreads work by movie.
--
-- Give the historical unchecked lane a small, staggered increase as well.
-- At 160 probes/hour with concurrency 3 it remains far below the existing
-- hot queue capacity and does not create a broad database scan.
do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.alter_job(
    jobid,
    schedule := '9,24,39,54 * * * *',
    command := $command$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=unchecked&limit=40&concurrency=3&deactivate_after=4',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret
           from vault.decrypted_secrets
           where name = 'CRON_SECRET'
           order by created_at desc
           limit 1)
        ),
        timeout_milliseconds := 60000
      );
    $command$,
    active := true
  )
  from cron.job
  where jobname = 'stream-health-unchecked-every-15-minutes';
end;
$scheduler$;
