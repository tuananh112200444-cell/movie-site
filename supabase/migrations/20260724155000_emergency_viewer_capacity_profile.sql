-- Viewer-first emergency profile.
-- The database was timing out while background repair/sync jobs were competing
-- for connections. Keep new-release ingestion, but sharply bound historical
-- repair and broad health scans until viewer reads are healthy again.

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.alter_job(
    jobid,
    schedule := '5,15,25,35,45,55 * * * *',
    command := 'select public.process_movie_refresh_queue(5);',
    active := true
  )
  from cron.job
  where jobname = 'process-movie-refresh-queue';

  perform cron.alter_job(jobid, active := false)
  from cron.job
  where jobname in (
    'stream-health-check-every-15-minutes',
    'stream-health-unchecked-every-15-minutes',
    'stream-health-stale-hourly'
  );

  perform cron.alter_job(jobid, schedule := '12,42 * * * *', active := true)
  from cron.job
  where jobname = 'stream-health-problem-every-15-minutes';

  perform cron.alter_job(
    jobid,
    schedule := '18,48 * * * *',
    command := $command$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/auto-repair-player-issues?hours=12&limit=2&threshold=3&event_limit=500',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret
           from vault.decrypted_secrets
           where name = 'CRON_SECRET'
           order by created_at desc
           limit 1)
        ),
        timeout_milliseconds := 45000
      );
    $command$,
    active := true
  )
  from cron.job
  where jobname = 'auto-repair-player-issues-every-10-minutes';

  perform cron.alter_job(jobid, active := false)
  from cron.job
  where jobname in (
    'sync-cobephim-backup-every-10-minutes',
    'scan-catalog-integrity-every-10-minutes'
  );
end;
$scheduler$;

comment on function public.process_movie_refresh_queue(integer) is
  'Viewer-first bounded refresh queue. Emergency capacity profile processes five movies every ten minutes.';
