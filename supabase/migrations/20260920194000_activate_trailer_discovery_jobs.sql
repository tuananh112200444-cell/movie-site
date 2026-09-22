-- Legacy TMDB catalogue job may have been left paused. Activate both discovery
-- jobs after their commands have been rebuilt with the dedicated scheduler key.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'sync-tmdb-catalog-daily'),
      active := true
    );
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'sync-vietnam-cinema-trailers'),
      active := true
    );
  end if;
end $$;
