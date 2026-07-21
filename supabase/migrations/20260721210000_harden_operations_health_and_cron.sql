-- Replace a legacy/stuck repair job with one canonical 30-minute job.
do $$
begin
  if exists (select 1 from cron.job where jobname='auto-repair-player-issues-every-10-minutes') then
    perform cron.unschedule('auto-repair-player-issues-every-10-minutes');
  end if;
  if exists (select 1 from cron.job where jobname='auto-repair-player-issues-every-30-minutes') then
    perform cron.unschedule('auto-repair-player-issues-every-30-minutes');
  end if;
  if exists (select 1 from cron.job where jobname='sync-blvietsub-smart-repair-every-30-minutes') then
    perform cron.unschedule('sync-blvietsub-smart-repair-every-30-minutes');
  end if;

  perform cron.schedule('auto-repair-player-issues-every-30-minutes','14,44 * * * *',$cmd$
    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/auto-repair-player-issues?hours=12&limit=8&threshold=2&event_limit=2000',
      headers := jsonb_build_object('x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
      timeout_milliseconds := 45000
    );
  $cmd$);
end $$;

-- Health must measure failures that affect viewers, not successful recovery
-- attempts or hosts that intentionally reject HEAD/health probes with 403.
create or replace function public.capture_operations_health()
returns public.operations_health_snapshots
language plpgsql
security definer
set search_path = public, cron, pg_temp
as $$
declare
  active_jobs integer; failed_jobs integer; stale_jobs integer; sync_failures integer;
  player_errors integer; unreachable_streams integer; seo_ok integer; seo_bad integer;
  calculated_score integer; calculated_status text; result public.operations_health_snapshots;
begin
  select count(*) into active_jobs from cron.job where active;
  with latest as (
    select j.jobid,j.jobname,j.schedule,r.status,r.start_time
    from cron.job j left join lateral (
      select status,start_time from cron.job_run_details d where d.jobid=j.jobid order by start_time desc limit 1
    ) r on true where j.active
  )
  select count(*) filter(where status='failed'),
         count(*) filter(where schedule ~ '^(\*/[0-9]+|[0-9,]+) \* \* \* \*$' and start_time is not null and start_time<now()-interval '2 hours')
  into failed_jobs,stale_jobs from latest;

  with latest_sync as (
    select distinct on(function_name) function_name,success,errors from public.sync_logs
    where run_at>=now()-interval '6 hours' order by function_name,run_at desc
  ) select count(*) into sync_failures from latest_sync where success is false or coalesce(errors,0)>0;

  select count(distinct concat_ws('|',movie_slug,episode_slug,server_name,event_type)) into player_errors
  from public.player_error_events where created_at>=now()-interval '1 hour'
    and event_type in ('stall_fatal','hls_fatal','direct_video_error','native_hls_error','iframe_blocked','chunk_load_error','app_error','unhandled_rejection');

  select count(distinct stream_id) into unreachable_streams from public.stream_health_logs
  where checked_at>=now()-interval '1 hour' and coalesce(is_reachable,false)=false
    and (http_code in (404,410) or status='dead');

  select count(*) filter(where eligible_for_index),count(*) filter(where not eligible_for_index)
    into seo_ok,seo_bad from public.movie_seo_quality_status;
  calculated_score := greatest(0,100-failed_jobs*20-stale_jobs*15-least(sync_failures,10)*3-least(player_errors,30)-least(unreachable_streams,20));
  calculated_status := case when failed_jobs>0 or stale_jobs>0 or calculated_score<60 then 'critical'
    when sync_failures>2 or player_errors>10 or unreachable_streams>5 or calculated_score<85 then 'warning' else 'healthy' end;
  insert into public.operations_health_snapshots(status,score,active_cron_jobs,failed_cron_jobs,stale_cron_jobs,sync_failures_6h,player_errors_1h,unreachable_streams_1h,seo_eligible,seo_ineligible,details)
  values(calculated_status,calculated_score,active_jobs,failed_jobs,stale_jobs,sync_failures,player_errors,unreachable_streams,seo_ok,seo_bad,
    jsonb_build_object('metric_version',2,'failed_jobs',(select coalesce(jsonb_agg(jobname),'[]'::jsonb) from (select j.jobname from cron.job j join lateral (select status from cron.job_run_details d where d.jobid=j.jobid order by start_time desc limit 1) r on true where j.active and r.status='failed') x)))
  returning * into result;
  return result;
end;
$$;

revoke all on function public.capture_operations_health() from public,anon,authenticated;
grant execute on function public.capture_operations_health() to service_role;
select public.capture_operations_health();
