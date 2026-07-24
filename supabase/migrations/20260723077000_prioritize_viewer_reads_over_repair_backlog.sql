-- Keep viewer-facing movie/detail/search reads ahead of historical catalogue
-- repair work. New releases are still handled by the source ingestion jobs;
-- this only bounds the large, non-urgent repair backlog.

do $scheduler$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.alter_job(
      jobid,
      schedule := '17 3 * * *',
      command := 'select public.scan_catalog_integrity(750);',
      active := true
    )
    from cron.job
    where jobname = 'scan-catalog-integrity-every-10-minutes';

    perform cron.alter_job(
      jobid,
      schedule := '2-59/5 * * * *',
      command := 'select public.dispatch_catalog_source_repairs(1);',
      active := true
    )
    from cron.job
    where jobname = 'dispatch-catalog-source-repairs-every-2-minutes';

    perform cron.alter_job(
      jobid,
      schedule := '*/2 * * * *',
      command := 'select public.process_movie_refresh_queue(10);',
      active := true
    )
    from cron.job
    where jobname = 'process-movie-refresh-queue';
  end if;
end;
$scheduler$;

comment on function public.dispatch_catalog_source_repairs(integer) is
  'Low-concurrency historical repair dispatcher. Viewer traffic and new-release ingestion have priority.';
