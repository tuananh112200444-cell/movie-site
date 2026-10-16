-- Cover 00:30-02:00 Vietnam shoulder time without adding another dispatcher.
begin;
do $jobs$ declare j record;begin
 for j in select jobid from cron.job where jobname='playback-brain-shoulder' loop
 perform cron.alter_job(j.jobid,schedule:='17,47 17-18,23,0-3,7-10 * * *');
 end loop;
end;$jobs$;
commit;
