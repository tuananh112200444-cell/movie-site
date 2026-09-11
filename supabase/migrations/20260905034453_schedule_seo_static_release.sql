do $seo_static_release_schedule$
declare
  target_job_id bigint;
  command_text text := $cmd$
    select net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/seo-static-release',
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
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cmd$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  select jobid into target_job_id
  from cron.job
  where jobname = 'process-seo-static-release-requests'
  limit 1;

  if target_job_id is null then
    perform cron.schedule(
      'process-seo-static-release-requests',
      '7,22,37,52 * * * *',
      command_text
    );
  else
    perform cron.alter_job(
      job_id := target_job_id,
      schedule := '7,22,37,52 * * * *',
      command := command_text,
      active := true
    );
  end if;
end;
$seo_static_release_schedule$;
