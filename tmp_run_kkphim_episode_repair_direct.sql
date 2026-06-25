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
    url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies?provider=kkphim&pages=4&limit=80&episodes=1&secret=' || cron_secret,
    timeout_milliseconds := 240000
  )
  into request_id;

  perform pg_sleep(90);
end $$;

select
  id,
  status_code,
  timed_out,
  error_msg,
  left(content, 2000) as content_sample,
  created
from net._http_response
where created > now() - interval '10 minutes'
  and content like '%"provider":"phimapi"%'
order by id desc
limit 5;
