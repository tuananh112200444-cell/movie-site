select jobid, active, schedule, command
from cron.job
where jobname = 'stream-health-check-every-15-minutes';
