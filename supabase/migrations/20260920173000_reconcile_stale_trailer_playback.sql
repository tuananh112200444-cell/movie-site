-- Keep the upcoming/trailer SEO cohort honest after playable episodes arrive.
-- Some provider updates write episode rows successfully but leave the catalogue
-- label as Trailer/Sap chieu until the generic scanner reaches that movie.

create or replace function public.reconcile_stale_trailer_playback(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  repaired integer := 0;
  batch_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  perform set_config('app.movie_refresh_processing', '1', true);

  for item in
    select m.id
    from public.movies m
    where m.is_published is true
      and public.get_movie_playable_max_episode(m.id) > 0
      and (
        lower(coalesce(m.status, '')) in ('upcoming', 'trailer', 'in production', 'returning series')
        or lower(coalesce(m.seo_catalog_status, '')) in ('upcoming', 'trailer')
        or lower(coalesce(m.schedule_type, '')) = 'upcoming'
        or lower(coalesce(m.episode_current, '')) ~ '(trailer|teaser|sap chieu|sắp chiếu|dang cap nhat|đang cập nhật)'
      )
    order by coalesce(m.updated_at, m.created_at) asc nulls first
    limit batch_limit
  loop
    perform public.reconcile_movie_release_state(item.id);
    perform public.refresh_movie_seo_quality(item.id);
    repaired := repaired + 1;
  end loop;

  return repaired;
end;
$$;

revoke all on function public.reconcile_stale_trailer_playback(integer) from public, anon, authenticated;
grant execute on function public.reconcile_stale_trailer_playback(integer) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'reconcile-stale-trailer-playback';

    perform cron.schedule(
      'reconcile-stale-trailer-playback',
      '7-59/10 * * * *',
      'select public.reconcile_stale_trailer_playback(100);'
    );
  end if;
end;
$$;

select public.reconcile_stale_trailer_playback(100);

comment on function public.reconcile_stale_trailer_playback(integer) is
  'Repairs public movies that still look like trailer/upcoming items after playable episodes or streams exist.';
