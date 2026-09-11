begin;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'cleanup-retired-ophim-transport'),
  schedule := '30 seconds',
  command := 'select private.cleanup_retired_ophim_transport_batch(100);',
  active := true
);

commit;
