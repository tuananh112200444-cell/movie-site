select cron.alter_job(
  jobid,
  '7,37 * * * *',
  regexp_replace(regexp_replace(regexp_replace(command, 'limit=120', 'limit=60', 'g'), 'concurrency=6', 'concurrency=3', 'g'), 'timeout_milliseconds := 90000', 'timeout_milliseconds := 60000', 'g'),
  null,
  null,
  null
)
from cron.job
where jobname = 'stream-health-unchecked-every-15-minutes';

select cron.alter_job(
  jobid,
  '12,42 * * * *',
  regexp_replace(regexp_replace(regexp_replace(command, 'limit=80', 'limit=40', 'g'), 'concurrency=5', 'concurrency=3', 'g'), 'timeout_milliseconds := 90000', 'timeout_milliseconds := 60000', 'g'),
  null,
  null,
  null
)
from cron.job
where jobname = 'stream-health-problem-every-15-minutes';

select cron.alter_job(
  jobid,
  '22 * * * *',
  regexp_replace(regexp_replace(regexp_replace(command, 'limit=120', 'limit=60', 'g'), 'concurrency=5', 'concurrency=3', 'g'), 'timeout_milliseconds := 180000', 'timeout_milliseconds := 90000', 'g'),
  null,
  null,
  null
)
from cron.job
where jobname = 'stream-health-check-every-15-minutes';

select cron.alter_job(
  jobid,
  '52 * * * *',
  regexp_replace(regexp_replace(regexp_replace(command, 'limit=80', 'limit=40', 'g'), 'concurrency=5', 'concurrency=3', 'g'), 'timeout_milliseconds := 90000', 'timeout_milliseconds := 60000', 'g'),
  null,
  null,
  null
)
from cron.job
where jobname = 'stream-health-stale-hourly';

select cron.alter_job(
  jobid,
  '5,35 * * * *',
  regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(command, 'latest_pages=2', 'latest_pages=1', 'g'), 'latest_limit=36', 'latest_limit=24', 'g'), 'backfill_limit=24', 'backfill_limit=12', 'g'), 'blvietsub_latest_limit=150', 'blvietsub_latest_limit=90', 'g'), 'blvietsub_backfill_limit=100', 'blvietsub_backfill_limit=60', 'g'), 'timeout_milliseconds := 240000', 'timeout_milliseconds := 150000', 'g'),
  null,
  null,
  null
)
from cron.job
where jobname = 'episode-backfill-guard-every-15-minutes';

select cron.alter_job(
  jobid,
  '14,44 * * * *',
  regexp_replace(regexp_replace(command, 'limit=6', 'limit=4', 'g'), 'timeout_milliseconds := 60000', 'timeout_milliseconds := 45000', 'g'),
  null,
  null,
  null
)
from cron.job
where jobname = 'auto-repair-player-issues-every-10-minutes';

select cron.alter_job(jobid, '*/30 * * * *', command, null, null, null)
from cron.job
where jobname in ('warm-search-index-every-15-minutes', 'warm-home-proxy-every-15-minutes');

select cron.schedule(
  'cleanup-pg-net-http-response-hourly',
  '25 * * * *',
  $$delete from net._http_response where created < now() - interval '2 hours';$$
)
where not exists (
  select 1 from cron.job where jobname = 'cleanup-pg-net-http-response-hourly'
);

