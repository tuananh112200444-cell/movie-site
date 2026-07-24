-- Ten items complete in well under one second on production, but active sync
-- can enqueue more than ten distinct movies per minute. Process 25 evenly per
-- minute to prevent backlog growth while remaining far below the removed
-- burst of 1,500 synchronous refreshes.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'process-movie-refresh-queue';

    perform cron.schedule(
      'process-movie-refresh-queue',
      '* * * * *',
      $cmd$select public.process_movie_refresh_queue(25);$cmd$
    );
  end if;
end $$;
