create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'warm-search-index-every-15-minutes') then
    perform cron.unschedule('warm-search-index-every-15-minutes');
  end if;
  if exists (select 1 from cron.job where jobname = 'warm-home-proxy-every-15-minutes') then
    perform cron.unschedule('warm-home-proxy-every-15-minutes');
  end if;
end $$;

select cron.schedule(
  'warm-search-index-every-15-minutes',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/search-index-proxy?limit=5000'
  );
  $$
);

select cron.schedule(
  'warm-home-proxy-every-15-minutes',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/home-proxy?sections=trending,phim-le,phim-bo,hoat-hinh,han-quoc,au-my'
  );
  $$
);

select jobid, jobname, schedule, active
from cron.job
where jobname in ('warm-search-index-every-15-minutes', 'warm-home-proxy-every-15-minutes')
order by jobname;
