-- pg_cron uses UTC.  The established Việt Nam viewing peaks are 11:00–14:59
-- and 19:00–23:59 ICT, which are 04:00–07:59 and 12:00–16:59 UTC.
-- Keep priority ingestion available at all times, but move broad scans,
-- backfills, cache rebuilds and bulk source work outside those windows.

do $scheduler$
begin
  -- Historical repair / discovery work: delayed is safe; competing with
  -- playback and search at peak time is not.
  perform cron.alter_job(jobid, schedule := '23,53 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'episode-backfill-guard-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '9,39 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'stream-health-unchecked-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '14,44 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'episode-mismatch-repair-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '8,38 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'sync-blvietsub-feed-backfill-every-30-minutes';
  perform cron.alter_job(jobid, schedule := '11,41 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'repair-blvietsub-smart-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '9,39 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'sync-glvietsub-feed-every-15-minutes';
  perform cron.alter_job(jobid, schedule := '29,49 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'sync-motchill-feed-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '4,19,34,49 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'dispatch-catalog-source-repairs-every-2-minutes';
  perform cron.alter_job(jobid, schedule := '14,44 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'sync-provider-backups-every-30-minutes';
  perform cron.alter_job(jobid, schedule := '42 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'quarantine-exhausted-catalog-playback-hourly';

  -- Warmers are useful only before a customer needs them. At peak, genuine
  -- viewer requests keep these caches warm and stale fallback remains active.
  perform cron.alter_job(jobid, schedule := '50 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'warm-search-index-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '14,44 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'warm-home-proxy-every-15-minutes';

  -- Bounded, database-local scans run only while the viewer load is low.
  perform cron.alter_job(jobid, schedule := '20 0,9,17 * * *')
  from cron.job where jobname = 'sync-tmdb-catalog-daily';
  perform cron.alter_job(jobid, schedule := '27 1,9,17 * * *')
  from cron.job where jobname = 'scan-movie-episode-truth';
  perform cron.alter_job(jobid, schedule := '52 0,3,9,17,21 * * *')
  from cron.job where jobname = 'scan-catalog-integrity-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '27 0,3,8,11,17,20,23 * * *')
  from cron.job where jobname = 'scan-episode-sequence-gaps-every-5-minutes';
  perform cron.alter_job(jobid, schedule := '2 2,8,17,23 * * *')
  from cron.job where jobname = 'sync-onlyflix-feed-hourly';
  perform cron.alter_job(jobid, schedule := '47 0,2,8,10,17,19,21,23 * * *')
  from cron.job where jobname = 'recheck-motchill-ongoing-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '27 2,17 * * *')
  from cron.job where jobname = 'backfill-audio-type-every-10-minutes';
  perform cron.alter_job(jobid, schedule := '27 3,17 * * *')
  from cron.job where jobname = 'capture-operations-health-every-5-minutes';

  -- The refresh queue reconciles movie metadata after source sync. Preserve
  -- near-real-time processing during peak with one tiny item every 15 minutes;
  -- process normal batches every five minutes outside peak.
  perform cron.alter_job(jobid, schedule := '5,10,15,20,25,30,35,40,45,50,55 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'process-movie-refresh-queue';
  perform cron.unschedule(jobid)
  from cron.job where jobname = 'process-movie-refresh-queue-peak-guard';
  perform cron.schedule(
    'process-movie-refresh-queue-peak-guard',
    '5,20,35,50 4-7,12-16 * * *',
    $cmd$select public.process_movie_refresh_queue(1);$cmd$
  );

  -- Stream checks protect viewers, so never stop them. The bulk hot queue gets
  -- full capacity off-peak and a deliberately small, frequent guard at peak.
  perform cron.alter_job(jobid, schedule := '1-59/5 0-3,8-11,17-23 * * *')
  from cron.job where jobname = 'stream-health-hot-every-5-minutes';
  perform cron.unschedule(jobid)
  from cron.job where jobname = 'stream-health-hot-peak-guard';
  perform cron.schedule(
    'stream-health-hot-peak-guard',
    '2,17,32,47 4-7,12-16 * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=hot&limit=20&movie_limit=20&concurrency=2&deactivate_after=3',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 60000
      );
    $cmd$
  );
end;
$scheduler$;
