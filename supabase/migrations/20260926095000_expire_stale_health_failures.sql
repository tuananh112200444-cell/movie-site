begin;

create or replace function public.capture_operations_health()
returns public.operations_health_snapshots
language plpgsql
security definer
set search_path = public, cron, pg_temp
as $$
declare
  active_jobs integer;
  failed_jobs integer;
  stale_jobs integer;
  sync_failures integer;
  player_errors integer;
  unreachable_streams integer;
  seo_ok integer;
  seo_bad integer;
  calculated_score integer;
  calculated_status text;
  failed_job_names jsonb := '[]'::jsonb;
  result public.operations_health_snapshots;
begin
  with latest_runs as materialized (
    select distinct on (d.jobid)
      d.jobid,d.status,d.start_time,d.return_message
    from cron.job_run_details d
    where d.start_time >= now() - interval '7 days'
    order by d.jobid,d.start_time desc
  ),
  job_state as (
    select j.jobname,j.schedule,r.status,r.start_time,r.return_message
    from cron.job j left join latest_runs r on r.jobid=j.jobid
    where j.active
  )
  select
    count(*),
    count(*) filter (
      where status='failed'
        and start_time >= now()-interval '30 minutes'
        and lower(coalesce(return_message,'')) not in ('job canceled','server restarted')
    ),
    count(*) filter (
      where schedule ~ '^(\*/[0-9]+|[0-9,]+) \* \* \* \*$'
        and start_time is not null
        and start_time < now()-interval '2 hours'
    ),
    coalesce(jsonb_agg(jobname order by jobname) filter (
      where status='failed'
        and start_time >= now()-interval '30 minutes'
        and lower(coalesce(return_message,'')) not in ('job canceled','server restarted')
    ),'[]'::jsonb)
  into active_jobs,failed_jobs,stale_jobs,failed_job_names
  from job_state;

  with latest_sync as (
    select distinct on (function_name) function_name,success,errors
    from public.sync_logs
    where run_at>=now()-interval '6 hours'
    order by function_name,run_at desc
  )
  select count(*) into sync_failures
  from latest_sync where success is false or coalesce(errors,0)>0;

  select count(distinct concat_ws('|',movie_slug,episode_slug,server_name,event_type))
  into player_errors
  from public.player_error_events
  where created_at>=now()-interval '1 hour'
    and event_type in ('stall_fatal','hls_fatal','hls_fatal_retry','direct_video_error','native_hls_error','iframe_blocked','chunk_load_error','app_error','unhandled_rejection');

  select count(distinct stream_id) into unreachable_streams
  from public.stream_health_logs
  where checked_at>=now()-interval '1 hour'
    and coalesce(is_reachable,false)=false
    and (http_code in (404,410) or status='dead');

  select count(*) filter(where eligible_for_index),count(*) filter(where not eligible_for_index)
  into seo_ok,seo_bad from public.movie_seo_quality_status;

  calculated_score:=greatest(0,100-failed_jobs*20-stale_jobs*15-least(sync_failures,10)*3-least(player_errors,30)-least(unreachable_streams,20));
  calculated_status:=case
    when failed_jobs>0 or stale_jobs>0 or calculated_score<60 then 'critical'
    when sync_failures>2 or player_errors>10 or unreachable_streams>5 or calculated_score<85 then 'warning'
    else 'healthy'
  end;

  insert into public.operations_health_snapshots(
    status,score,active_cron_jobs,failed_cron_jobs,stale_cron_jobs,sync_failures_6h,
    player_errors_1h,unreachable_streams_1h,seo_eligible,seo_ineligible,details
  ) values (
    calculated_status,calculated_score,active_jobs,failed_jobs,stale_jobs,sync_failures,
    player_errors,unreachable_streams,seo_ok,seo_bad,
    jsonb_build_object(
      'metric_version',4,
      'failed_jobs',failed_job_names,
      'failure_window_minutes',30,
      'restart_cancellations_ignored',true,
      'scheduler_profile','live_safe_viewer_priority'
    )
  ) returning * into result;
  return result;
end;
$$;

revoke all on function public.capture_operations_health() from public,anon,authenticated;
grant execute on function public.capture_operations_health() to service_role;

comment on function public.capture_operations_health() is
  'Live-safe operations snapshot. Only recent actionable cron failures count; old restart cancellations expire automatically.';

select public.capture_operations_health();

commit;
