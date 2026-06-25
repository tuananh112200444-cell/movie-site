do $$
declare
  cron_secret text;
  target_slug text;
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

  foreach target_slug in array array[
    'ichijouma-mankitsugurashi',
    'mao',
    'lai-bi-giet-nua-a-thua-tham-tu-mata-korosarete-shimatta-no-desu-ne-tanteisama'
  ]
  loop
    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies?provider=kkphim&episodes=1&slug=' || target_slug || '&secret=' || cron_secret,
      timeout_milliseconds := 180000
    )
    into request_id;
  end loop;

  perform pg_sleep(45);
end $$;

select
  id,
  status_code,
  timed_out,
  error_msg,
  left(content, 2500) as content_sample,
  created
from net._http_response
where created > now() - interval '5 minutes'
  and content like '%"target_slug"%'
order by id desc
limit 10;
