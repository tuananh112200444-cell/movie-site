select
  jobid,
  jobname,
  schedule,
  active,
  command
from cron.job
where command ilike '%sync-ophim%'
   or command ilike '%auto-sync-ophim%'
   or command ilike '%sync-blvietsub%'
   or command ilike '%episode-backfill-guard%'
order by jobname;
