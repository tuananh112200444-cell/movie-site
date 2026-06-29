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
    raise notice 'No sync secret found; episode-backfill-guard cron was not changed.';
    return;
  end if;

  perform cron.alter_job(
    jobid,
    '4,19,34,49 * * * *',
    format(
      $cmd$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/episode-backfill-guard?latest_pages=1&latest_limit=12&backfill_pages=1&backfill_limit=4&skip_direct_ophim=1&skip_blvietsub=1&mismatch_repair_limit=0&refresh_caches=0&child_timeout_ms=25000&secret=%s', timeout_milliseconds := 120000);$cmd$,
      sync_secret
    ),
    null,
    null,
    null
  )
  from cron.job
  where jobname = 'episode-backfill-guard-every-15-minutes';
end $outer$;
