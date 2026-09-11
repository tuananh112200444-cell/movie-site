begin;

-- These two bounded jobs are the only freshness lanes for the GL homepage
-- rail. They were left disabled, so a successful log entry often scanned zero
-- titles and never advanced a new episode into the public catalogue.
do $restore_glvietsub_jobs$
declare
  target_job record;
begin
  for target_job in
    select jobid
    from cron.job
    where jobname in (
      'sync-glvietsub-recent-every-15-minutes',
      'upgrade-glvietsub-raw-every-10-minutes'
    )
  loop
    perform cron.alter_job(job_id := target_job.jobid, active := true);
  end loop;
end;
$restore_glvietsub_jobs$;

-- Start one bounded recent pass now; the cron lanes keep it current after
-- this migration completes. The secret stays inside Vault.
select net.http_get(
  url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-glvietsub-feed?limit=8&recent=1',
  headers := jsonb_build_object(
    'x-cron-secret',
    (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
  ),
  timeout_milliseconds := 120000
)
where exists (
  select 1 from vault.decrypted_secrets where name = 'CRON_SECRET'
);

update public.home_page_cache
set expires_at = now()
where id = 'homepage_v3';

commit;
