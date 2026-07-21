-- Full 5k-row search index rebuilds are expensive and source syncs already
-- request refresh after actual changes. Keep a periodic safety refresh twice an
-- hour rather than rebuilding every ten minutes regardless of changes.
do $$
declare
  target_id bigint;
begin
  select jobid into target_id from cron.job where jobname = 'warm-search-index-every-10-minutes';
  if target_id is not null then
    perform cron.alter_job(target_id, schedule := '17,47 * * * *');
  end if;
end $$;
