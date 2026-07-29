create index if not exists streams_viewer_telemetry_hot_queue_idx
on public.streams (updated_at desc)
where is_active = true
  and last_error like 'Viewer telemetry:%';

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'stream-health-hot-every-5-minutes';

  perform cron.schedule(
    'stream-health-hot-every-5-minutes',
    '1-59/5 * * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=hot&limit=80&movie_limit=80&concurrency=5&deactivate_after=3',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret
           from vault.decrypted_secrets
           where name = 'CRON_SECRET'
           order by created_at desc
           limit 1)
        ),
        timeout_milliseconds := 90000
      );
    $cmd$
  );
end
$$;
