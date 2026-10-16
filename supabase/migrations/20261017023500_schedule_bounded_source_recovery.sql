begin;
do $jobs$
declare current_mode text;
begin
 perform cron.unschedule(jobid) from cron.job where jobname='bounded-playback-source-recovery';
 perform cron.schedule('bounded-playback-source-recovery','4-59/5 * * * *',$cmd$
  select net.http_get(
   url:='https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/playback-source-recovery',
   headers:=jsonb_build_object('x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
   timeout_milliseconds:=120000);
 $cmd$);
 insert into public.runtime_capacity_managed_jobs(job_name,paused_by_capacity_guard,paused_at,updated_at)
 values('bounded-playback-source-recovery',false,null,now())
 on conflict(job_name) do nothing;
 select mode into current_mode from public.runtime_capacity_state where singleton;
 if current_mode<>'normal' then
  perform cron.alter_job(jobid,active:=false) from cron.job where jobname='bounded-playback-source-recovery';
  update public.runtime_capacity_managed_jobs set paused_by_capacity_guard=true,paused_at=now(),updated_at=now()
   where job_name='bounded-playback-source-recovery';
 end if;
end;$jobs$;
commit;
