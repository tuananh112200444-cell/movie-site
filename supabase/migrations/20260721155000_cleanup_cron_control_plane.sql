-- Keep a single authoritative scheduler entry for each responsibility.
-- Inactive legacy jobs add operational ambiguity even though they do not run.
do $$
declare
  target_job_name text;
begin
  foreach target_job_name in array array[
    'stream-health-check',
    'sync-details-5min',
    'sync-kisskh-movies',
    'sync-new-movies-5min',
    'sync-ophim-every-5min',
    'thai-bl-sync-10min',
    'warm-search-index-every-15-minutes'
  ] loop
    if exists (select 1 from cron.job where jobname = target_job_name) then
      perform cron.unschedule(target_job_name);
    end if;
  end loop;
end $$;
