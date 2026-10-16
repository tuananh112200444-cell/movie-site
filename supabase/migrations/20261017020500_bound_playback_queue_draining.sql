-- Keep one bounded queue worker instead of night-only draining and duplicate schedules.
begin;set local lock_timeout='3s';set local statement_timeout='20s';
create table if not exists private.playback_maintenance_runs (
 id bigint generated always as identity primary key,ran_at timestamptz not null default now(),
 profile text not null,result jsonb not null
);
create index if not exists playback_maintenance_runs_time_idx on private.playback_maintenance_runs(ran_at);
revoke all on private.playback_maintenance_runs from public,anon,authenticated;
create or replace function private.run_bounded_playback_maintenance()
returns jsonb language plpgsql security invoker set search_path=public,private,pg_catalog,pg_temp as $run$
declare profile text;mode text;busy integer;audit_limit integer;result jsonb;refreshed integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('bounded-playback-maintenance-v1',0)) then return jsonb_build_object('skipped','already_running');end if;
 select s.mode into mode from public.runtime_capacity_state s where singleton;
 select count(*) into busy from pg_stat_activity where datname=current_database() and backend_type='client backend' and state='active' and pid<>pg_backend_pid();
 profile:=public.current_viewer_load_profile();
 if mode is distinct from 'normal' or busy>=5 then
  result:=jsonb_build_object('skipped','capacity','mode',mode,'active_queries',busy);
 else
  audit_limit:=case profile when 'night' then 20 when 'shoulder' then 8 else 2 end;
  result:=public.process_movie_playback_audit_queue(audit_limit);
  if profile<>'peak' then refreshed:=public.process_movie_refresh_queue(case when profile='night' then 4 else 1 end);end if;
  result:=result||jsonb_build_object('refreshed',refreshed);
 end if;
 insert into private.playback_maintenance_runs(profile,result) values(profile,result);
 delete from private.playback_maintenance_runs where ran_at<now()-interval '14 days';
 return result;
end;$run$;
revoke all on function private.run_bounded_playback_maintenance() from public,anon,authenticated;
-- Only replace these queue-draining schedules. Preserve all provider sync and NguonC policies.
do $jobs$ declare j record;begin
 for j in select jobid from cron.job where jobname in('process-playback-audit-night','process-movie-refresh-night','process-movie-refresh-shoulder') loop
 perform cron.alter_job(j.jobid,active:=false);
 end loop;
 -- Prevent the capacity guard from bringing superseded jobs back.
 delete from public.runtime_capacity_managed_jobs
 where job_name in('process-playback-audit-night','process-movie-refresh-night','process-movie-refresh-shoulder');
 perform cron.schedule('bounded-playback-maintenance','2-59/5 * * * *','select private.run_bounded_playback_maintenance();');
end;$jobs$;
commit;
