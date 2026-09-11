-- Restore the bounded Google Search Console feedback loop on the current
-- Supabase project. This job inspects index coverage; it does not misuse the
-- Google Indexing API or promise that a URL will be indexed.
do $seo_scheduler$
declare
  gsc_job_id bigint;
  quality_job_id bigint;
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
      body := '{"inspection_limit":25}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  select jobid into gsc_job_id
  from cron.job
  where jobname = 'collect-gsc-seo-feedback-daily'
  limit 1;

  if gsc_job_id is null then
    perform cron.schedule(
      'collect-gsc-seo-feedback-daily',
      '52 3 * * *',
      gsc_command
    );
  else
    perform cron.alter_job(
      job_id := gsc_job_id,
      schedule := '52 3 * * *',
      command := gsc_command,
      active := true
    );
  end if;

  -- The derived quality table is stale for a large part of the catalogue.
  -- Resume its bounded, off-peak-only repair job; it processes at most twenty
  -- rows per run and yields when the normal movie queue is under pressure.
  select jobid into quality_job_id
  from cron.job
  where jobname = 'process-movie-seo-quality-backfill-offpeak'
  limit 1;

  if quality_job_id is not null then
    perform cron.alter_job(
      job_id := quality_job_id,
      schedule := '3-58/5 17-22 * * *',
      active := true
    );
  end if;
end;
$seo_scheduler$;

comment on function public.process_movie_seo_quality_backfill(integer) is
  'Bounded off-peak SEO-quality repair. Current sitemap and GSC inspection paths apply an additional high-value cohort gate before exposing URLs to Google.';
