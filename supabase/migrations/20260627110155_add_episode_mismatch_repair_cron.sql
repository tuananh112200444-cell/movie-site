select cron.alter_job(
  jobid,
  '5,35 * * * *',
  case
    when command like '%mismatch_repair_limit=%' then
      regexp_replace(
        command,
        'mismatch_(scan_limit|repair_limit|min_displayed|max_displayed|severe_only)=[^&'']+&',
        '',
        'g'
      )
    else command
  end,
  null,
  null,
  null
)
from cron.job
where jobname = 'episode-backfill-guard-every-15-minutes';

select cron.unschedule('episode-mismatch-repair-every-15-minutes')
where exists (
  select 1 from cron.job where jobname = 'episode-mismatch-repair-every-15-minutes'
);

select cron.schedule(
  'episode-mismatch-repair-every-15-minutes',
  '10,25,40,55 * * * *',
  format(
    $$select net.http_get(url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/episode-backfill-guard?mismatch_only=1&mismatch_scan_limit=180&mismatch_repair_limit=6&mismatch_min_displayed=3&mismatch_max_displayed=80&mismatch_severe_only=1&refresh_caches=1&secret=%s', timeout_milliseconds := 90000);$$,
    coalesce((
      select substring(command from 'secret=([^&'']+)')
      from cron.job
      where jobname = 'episode-backfill-guard-every-15-minutes'
      limit 1
    ), '')
  )
);
