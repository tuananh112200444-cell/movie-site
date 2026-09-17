-- SEO editorial work is approved during the day and becomes public in one
-- bounded Pages build at 03:30 Asia/Ho_Chi_Minh. Urgent repairs keep a small
-- fast lane without forcing every normal movie into an immediate deployment.

alter table public.seo_static_release_requests
  add column if not exists release_lane text not null default 'nightly';

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'seo_static_release_requests_lane_check'
      and conrelid = 'public.seo_static_release_requests'::regclass
  ) then
    alter table public.seo_static_release_requests
      add constraint seo_static_release_requests_lane_check
      check (release_lane in ('nightly', 'urgent'));
  end if;
end;
$constraint$;

create index if not exists seo_static_release_lane_pending_idx
  on public.seo_static_release_requests(release_lane, status, requested_at)
  where status in ('pending', 'processing');

do $schedule$
declare
  nightly_job_id bigint;
  urgent_job_id bigint;
  nightly_command text := $cmd$
    select net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/seo-static-release',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'CRON_SECRET' order by created_at desc limit 1
        )
      ),
      body := '{"mode":"nightly"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$;
  urgent_command text := $cmd$
    select net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/seo-static-release',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'CRON_SECRET' order by created_at desc limit 1
        )
      ),
      body := '{"mode":"urgent"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  select jobid into nightly_job_id from cron.job
  where jobname = 'process-seo-static-release-requests' limit 1;
  if nightly_job_id is null then
    perform cron.schedule('process-seo-static-release-requests', '30 20 * * *', nightly_command);
  else
    perform cron.alter_job(
      job_id := nightly_job_id,
      schedule := '30 20 * * *',
      command := nightly_command,
      active := true
    );
  end if;

  select jobid into urgent_job_id from cron.job
  where jobname = 'process-seo-static-release-urgent' limit 1;
  if urgent_job_id is null then
    perform cron.schedule('process-seo-static-release-urgent', '*/10 * * * *', urgent_command);
  else
    perform cron.alter_job(
      job_id := urgent_job_id,
      schedule := '*/10 * * * *',
      command := urgent_command,
      active := true
    );
  end if;
end;
$schedule$;

comment on column public.seo_static_release_requests.release_lane is
  'nightly batches approved drafts at 03:30 Asia/Ho_Chi_Minh; urgent is checked every ten minutes.';
