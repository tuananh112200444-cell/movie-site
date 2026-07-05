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
    raise notice 'No sync secret found; episode mismatch repair cron was not changed.';
  else
    perform cron.alter_job(
      jobid,
      '10,25,40,55 * * * *',
      format(
        $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/episode-backfill-guard?mismatch_only=1&mismatch_scan_limit=260&mismatch_repair_limit=4&mismatch_min_displayed=2&mismatch_max_displayed=250&mismatch_severe_only=0&refresh_caches=1&child_timeout_ms=30000&secret=%s', timeout_milliseconds := 180000);$cmd$,
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
