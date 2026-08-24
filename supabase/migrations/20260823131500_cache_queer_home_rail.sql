-- Keep the queer-universe rail inside the canonical homepage cache. Browsers
-- must not issue their own 144-row, multi-column source ILIKE query.

create or replace function public.refresh_home_queer_cache(p_limit integer default 72)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payload jsonb := '[]'::jsonb;
  item_count integer := 0;
begin
  with selected as (
    select jsonb_build_object(
      '_id', movie.id,
      'id', movie.id,
      'slug', movie.slug,
      'name', movie.name,
      'origin_name', movie.origin_name,
      'title_vi', movie.title_vi,
      'title_en', movie.title_en,
      'title_zh', movie.title_zh,
      'title_original', movie.title_original,
      'poster_url', movie.poster_url,
      'thumb_url', movie.thumb_url,
      'episode_current', movie.episode_current,
      'episode_total', movie.episode_total,
      'current_episode', movie.current_episode,
      'total_episodes', movie.total_episodes,
      'schedule_type', movie.schedule_type,
      'release_time', movie.release_time,
      'release_day', movie.release_day,
      'schedule_timezone', movie.schedule_timezone,
      'release_at', movie.release_at,
      'next_episode_at', movie.next_episode_at,
      'next_episode_name', movie.next_episode_name,
      'schedule_note', movie.schedule_note,
      'source_site', movie.source_site,
      'source_name', movie.source_name,
      'year', movie.year,
      'type', movie.type,
      'category', movie.category,
      'country', movie.country,
      'updated_at', movie.updated_at,
      'modified', jsonb_build_object('time', movie.updated_at),
      'is_published', movie.is_published,
      'tmdb_id', movie.tmdb_id
    ) as item
    from public.movies movie
    where movie.is_published is true
      and (
        movie.source_site ilike '%admin-queer%'
        or movie.source_site ilike '%blvietsub%'
        or movie.source_name ilike '%blvietsub%'
        or movie.source_site ilike '%glvietsub%'
        or movie.source_name ilike '%glvietsub%'
      )
    order by movie.updated_at desc nulls last, movie.id
    limit greatest(12, least(coalesce(p_limit, 72), 96))
  )
  select coalesce(jsonb_agg(item), '[]'::jsonb), count(*)
  into payload, item_count
  from selected;

  insert into public.home_page_cache (id, sections, source, updated_at, expires_at)
  values (
    'homepage_v3',
    jsonb_build_object('queer', payload),
    'adaptive-home-package',
    now(),
    now() + interval '30 minutes'
  )
  on conflict (id) do update
  set sections = coalesce(public.home_page_cache.sections, '{}'::jsonb)
      || jsonb_build_object('queer', payload),
      source = 'adaptive-home-package',
      updated_at = now(),
      expires_at = greatest(public.home_page_cache.expires_at, now() + interval '30 minutes');

  return item_count;
end;
$$;

revoke all on function public.refresh_home_queer_cache(integer) from public, anon, authenticated;
grant execute on function public.refresh_home_queer_cache(integer) to service_role;

do $scheduler$
declare
  protect boolean := true;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-home-queer-cache-smart';
  perform cron.schedule(
    'refresh-home-queer-cache-smart',
    '18 3,10,17 * * *',
    'select public.refresh_home_queer_cache(72);'
  );

  select mode = 'protect' into protect
  from public.runtime_capacity_state where singleton = true;
  insert into public.runtime_capacity_managed_jobs(job_name, paused_by_capacity_guard, paused_at, updated_at)
  values ('refresh-home-queer-cache-smart', protect, case when protect then now() else null end, now())
  on conflict (job_name) do update
  set paused_by_capacity_guard = excluded.paused_by_capacity_guard,
      paused_at = excluded.paused_at,
      updated_at = now();
  if protect then
    perform cron.alter_job(jobid, active := false)
    from cron.job where jobname = 'refresh-home-queer-cache-smart';
  end if;
end;
$scheduler$;

select public.refresh_home_queer_cache(72);

comment on function public.refresh_home_queer_cache(integer) is
  'Refreshes the shared cached queer rail at 00:18, 10:18, and 17:18 Vietnam time; browsers never scan movies directly.';
