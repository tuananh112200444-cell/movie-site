do $$
declare
  cron_secret text;
  request_id bigint;
begin
  select (regexp_match(command, 'secret=([^&''\s]+)'))[1]
  into cron_secret
  from cron.job
  where active = true
    and jobname = 'episode-backfill-guard-every-15-minutes'
    and command ilike '%secret=%'
  order by jobid desc
  limit 1;

  if cron_secret is null then
    raise exception 'Could not find episode-backfill-guard cron secret';
  end if;

  select net.http_get(
    url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/episode-backfill-guard?latest_pages=2&latest_limit=30&backfill_pages=1&backfill_limit=10&direct_ophim_limit=20&blvietsub_latest_limit=20&blvietsub_backfill_limit=20&blvietsub_page_size=20&refresh_caches=1&secret=' || cron_secret,
    timeout_milliseconds := 240000
  )
  into request_id;

  perform pg_sleep(45);
end $$;

select
  id,
  status_code,
  timed_out,
  error_msg,
  left(content, 6000) as content_sample,
  created
from net._http_response
where created > now() - interval '5 minutes'
  and content like '%"calls"%'
order by id desc
limit 3;
