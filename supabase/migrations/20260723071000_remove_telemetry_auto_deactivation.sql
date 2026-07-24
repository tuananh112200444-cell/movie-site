-- Browser failures are advisory: local connectivity, BFCache restoration,
-- VPNs and decoder differences can all produce false positives. Persistent
-- deactivation remains the responsibility of stream-health-check, which
-- performs an independent server-side probe.

do $$
declare
  job_id bigint;
begin
  select jobid into job_id
  from cron.job
  where jobname = 'reconcile-viewer-stream-failures-every-10-minutes'
  limit 1;
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end;
$$;

drop function if exists public.reconcile_viewer_failures_with_stream_health(integer, integer);
