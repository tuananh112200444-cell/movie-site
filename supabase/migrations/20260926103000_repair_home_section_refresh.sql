-- Rebuild the canonical homepage package twice per hour. The old job name
-- claimed a 15-minute cadence but had been reduced to two runs per day and
-- sent only the refresh marker, so home-proxy treated it as an ordinary
-- public read and never created homepage_v4_vsmov_4k.

do $scheduler$
declare
  target_job_id bigint;
  refresh_command text := $cmd$
    select net.http_get(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/home-proxy?refresh=1&sections=top-rated,vsmov-4k,trending,phim-chieu-rap,phim-le,phim-bo,hoat-hinh,han-quoc,au-my,trung-quoc,thai-lan,queer',
      headers := jsonb_build_object(
        'x-home-proxy-refresh', '1',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'CRON_SECRET' order by created_at desc limit 1
        )
      ),
      timeout_milliseconds := 120000
    );
  $cmd$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  select jobid into target_job_id
  from cron.job
  where jobname = 'warm-home-proxy-every-15-minutes'
  limit 1;

  if target_job_id is null then
    perform cron.schedule(
      'warm-home-proxy-every-15-minutes',
      '5,35 * * * *',
      refresh_command
    );
  else
    perform cron.alter_job(
      job_id := target_job_id,
      schedule := '5,35 * * * *',
      command := refresh_command,
      active := true
    );
  end if;
end;
$scheduler$;

comment on table public.home_page_cache is
  'Canonical homepage section package; refreshed every 30 minutes with authenticated taxonomy validation.';
