do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron')
     and exists (select 1 from pg_extension where extname='pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname='collect-gsc-seo-feedback-daily';
    perform cron.schedule('collect-gsc-seo-feedback-daily','23 3 * * *',$cmd$
      select net.http_post(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/gsc-seo-feedback',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)
        ),
        body := '{"inspection_limit":25}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$);

    perform cron.unschedule(jobid) from cron.job where jobname='cleanup-gsc-seo-history-weekly';
    perform cron.schedule('cleanup-gsc-seo-history-weekly','41 3 * * 0',$cmd$
      delete from public.seo_search_metrics where collected_at < now() - interval '180 days';
      delete from public.seo_gsc_runs where started_at < now() - interval '365 days';
    $cmd$);
  end if;
end $$;
