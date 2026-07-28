-- Repair the exact 2017 LEGO movie after both URLs still published by OPhim
-- were independently confirmed as HTTP 404. The replacement is the exact
-- title/year match from the already configured KKPhim provider.
update public.streams
set
  is_active = false,
  health_status = 'dead',
  failure_count = greatest(coalesce(failure_count, 0), 2),
  last_checked_at = now(),
  last_failure_at = now(),
  last_error = 'Confirmed HTTP 404 for both OPhim HLS and embed URLs',
  updated_at = now()
where movie_id = (
    select id from public.movies
    where slug = 'phim-lego-ninjago'
    limit 1
  )
  and (
    stream_url ~* 'vip\.opstream14\.com'
    or embed_url ~* 'vip\.opstream14\.com'
  );

insert into public.streams (
  movie_id,
  server_name,
  episode_slug,
  stream_url,
  embed_url,
  source,
  quality,
  priority,
  is_active,
  health_status,
  last_checked_at,
  last_success_at,
  response_time_ms,
  failure_count,
  last_error,
  audio_type
)
select
  id,
  'KKPhim Vietsub',
  '1',
  'https://s1.phim1280.tv/20231101/gpxFU2pG/index.m3u8',
  'https://player.phimapi.com/player/?url=https://s1.phim1280.tv/20231101/gpxFU2pG/index.m3u8',
  'phimapi',
  'HD',
  90,
  true,
  'ok',
  now(),
  now(),
  600,
  0,
  '',
  'vietsub'
from public.movies
where slug = 'phim-lego-ninjago'
  and year = 2017
  and lower(trim(coalesce(origin_name, ''))) = 'the lego ninjago movie'
  and not exists (
    select 1
    from public.streams
    where movie_id = public.movies.id
      and source = 'phimapi'
      and episode_slug = '1'
      and stream_url = 'https://s1.phim1280.tv/20231101/gpxFU2pG/index.m3u8'
      and is_active = true
  );

delete from public.movie_api_cache
where slug = 'phim-lego-ninjago';

-- The emergency capacity profile disabled every queue that can discover an
-- unchecked source. Keep one small, staggered queue so newly imported sources
-- cannot remain "active + unchecked" forever.
do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.alter_job(
    jobid,
    schedule := '7,37 * * * *',
    command := $command$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=unchecked&limit=20&concurrency=2&deactivate_after=4',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret
           from vault.decrypted_secrets
           where name = 'CRON_SECRET'
           order by created_at desc
           limit 1)
        ),
        timeout_milliseconds := 45000
      );
    $command$,
    active := true
  )
  from cron.job
  where jobname = 'stream-health-unchecked-every-15-minutes';
end;
$scheduler$;
