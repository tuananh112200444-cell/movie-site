-- Viewer-facing source recovery must outrun the generic historical backlog.
-- Keep batches bounded to avoid the memory pressure that motivated the older
-- throttling migration, but run problem repair and telemetry repair more often.

create index if not exists streams_active_health_queue_v2_idx
on public.streams (health_status, last_checked_at asc nulls first, priority desc)
where is_active = true;

select cron.alter_job(
  jobid,
  '2-59/5 * * * *',
  $cmd$select net.http_get(
    url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=problem&limit=80&concurrency=5&deactivate_after=3',
    headers := jsonb_build_object('x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
    timeout_milliseconds := 90000
  );$cmd$,
  null,
  null,
  null
)
from cron.job
where jobname = 'stream-health-problem-every-15-minutes';

do $$
begin
  if exists (select 1 from cron.job where jobname='auto-repair-player-issues-every-30-minutes') then
    perform cron.unschedule('auto-repair-player-issues-every-30-minutes');
  end if;
  if exists (select 1 from cron.job where jobname='auto-repair-player-issues-every-10-minutes') then
    perform cron.unschedule('auto-repair-player-issues-every-10-minutes');
  end if;

  perform cron.schedule('auto-repair-player-issues-every-10-minutes','4-59/10 * * * *',$cmd$
    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/auto-repair-player-issues?hours=12&limit=12&threshold=2&event_limit=4000',
      headers := jsonb_build_object('x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
      timeout_milliseconds := 75000
    );
  $cmd$);
end $$;
