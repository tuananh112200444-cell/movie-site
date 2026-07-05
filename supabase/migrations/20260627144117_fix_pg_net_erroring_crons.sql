do $outer$
declare
  sync_secret text;
begin
  select substring(command from 'secret=([^&'']+)')
  into sync_secret
  from cron.job
  where jobname = 'episode-backfill-guard-every-15-minutes'
  limit 1;

  if sync_secret is null or length(sync_secret) = 0 then
    raise notice 'No sync secret found from episode-backfill-guard-every-15-minutes; leaving secret-bearing jobs unchanged.';
  else
    perform cron.alter_job(
      jobid,
      '5,35 * * * *',
      format(
        $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/episode-backfill-guard?latest_pages=1&latest_limit=8&backfill_pages=1&backfill_limit=4&skip_direct_ophim=1&skip_blvietsub=1&mismatch_repair_limit=0&refresh_caches=0&child_timeout_ms=20000&secret=%s', timeout_milliseconds := 120000);$cmd$,
        sync_secret
      ),
      null,
      null,
      null
    )
    from cron.job
    where jobname = 'episode-backfill-guard-every-15-minutes';

    perform cron.alter_job(
      jobid,
      '*/15 * * * *',
      format(
        $cron$
  select
    net.http_post(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/schedule-email-alerts?secret=%s',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $cron$,
        sync_secret
      ),
      null,
      null,
      null
    )
    from cron.job
    where jobname = 'schedule-email-alerts-every-5-minutes';

    perform cron.alter_job(
      jobid,
      '10,25,40,55 * * * *',
      format(
        $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/episode-backfill-guard?mismatch_only=1&mismatch_scan_limit=180&mismatch_repair_limit=6&mismatch_min_displayed=3&mismatch_max_displayed=80&mismatch_severe_only=1&refresh_caches=1&child_timeout_ms=12000&secret=%s', timeout_milliseconds := 90000);$cmd$,
        sync_secret
      ),
      null,
      null,
      null
    )
    from cron.job
    where jobname = 'episode-mismatch-repair-every-15-minutes';
  end if;
end $outer$;
