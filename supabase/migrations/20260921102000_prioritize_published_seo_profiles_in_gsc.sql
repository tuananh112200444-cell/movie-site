-- A published SEO profile is an editorially approved canonical watch page.
-- Inspect it automatically after the nightly publication window and once more
-- later in the day. Inspection supplies Google coverage evidence only; Google
-- still independently decides whether and when to index a page.
do $seo_scheduler$
declare
  nightly_job_id bigint;
  daily_job_id bigint;
  gsc_command text := $cmd$
    select net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/gsc-seo-feedback',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'CRON_SECRET'
          order by created_at desc
          limit 1
        )
      ),
      body := '{"inspection_limit":50}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  select jobid into nightly_job_id
  from cron.job
  where jobname = 'collect-gsc-seo-feedback-after-nightly-release'
  limit 1;
  if nightly_job_id is null then
    perform cron.schedule('collect-gsc-seo-feedback-after-nightly-release','52 20 * * *',gsc_command);
  else
    perform cron.alter_job(job_id := nightly_job_id,schedule := '52 20 * * *',command := gsc_command,active := true);
  end if;

  select jobid into daily_job_id
  from cron.job
  where jobname = 'collect-gsc-seo-feedback-daily'
  limit 1;
  if daily_job_id is null then
    perform cron.schedule('collect-gsc-seo-feedback-daily','52 3 * * *',gsc_command);
  else
    perform cron.alter_job(job_id := daily_job_id,schedule := '52 3 * * *',command := gsc_command,active := true);
  end if;
end;
$seo_scheduler$;
