-- Fair playback task dispatch and preserve published movie identity during inconclusive checks.
begin;set local lock_timeout='3s';set local statement_timeout='20s';
CREATE OR REPLACE FUNCTION public.claim_system_brain_tasks(p_brain text, p_limit integer DEFAULT 1)
 RETURNS TABLE(task_key text, handler text, params jsonb, attempts bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
begin
  if p_brain not in ('catalog', 'playback') then
    raise exception 'Unsupported brain: %', p_brain using errcode = '22023';
  end if;

  return query
  with candidates as materialized (
    select task.task_key
    from public.system_brain_tasks task
    where task.brain = p_brain
      and task.enabled is true
      and task.next_run_at <= now()
      and (task.lease_until is null or task.lease_until <= now())
    order by case when p_brain='playback' then task.next_run_at end asc nulls last, task.priority desc, task.next_run_at, task.task_key
    for update of task skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 2))
  ), claimed as (
    update public.system_brain_tasks task
    set status = 'running',
        lease_until = now() + interval '3 minutes',
        last_started_at = now(),
        attempts = task.attempts + 1,
        updated_at = now()
    from candidates candidate
    where task.task_key = candidate.task_key
    returning task.task_key, task.handler, task.params, task.attempts
  )
  select claimed.task_key, claimed.handler, claimed.params, claimed.attempts
  from claimed
  order by claimed.task_key;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reconcile_movie_release_state(p_movie_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  max_episode integer := 0;
  declared_total integer := 0;
  advertised_episode integer := 0;
  normalized_status text := '';
  normalized_label text := '';
  raw_suffix text := '';
  current_seo_status text := '';
  currently_published boolean := false;
  preview_only boolean := false;
  has_usable_playback boolean := false;
begin
  max_episode := public.get_movie_playable_max_episode(p_movie_id);
  has_usable_playback := public.movie_has_usable_persisted_playback(p_movie_id);

  select
    greatest(
      coalesce(movie.total_episodes, 0),
      coalesce(nullif(substring(coalesce(movie.episode_total, '') from '([0-9]+)'), '')::integer, 0)
    ),
    greatest(
      coalesce(movie.current_episode, 0),
      coalesce(nullif(substring(coalesce(movie.episode_current, '') from '([0-9]+)'), '')::integer, 0)
    ),
    lower(coalesce(movie.status, '')),
    lower(coalesce(movie.episode_current, '')),
    case when lower(coalesce(movie.episode_current, '')) like '%raw%' then ' RAW' else '' end,
    lower(coalesce(movie.seo_catalog_status, '')),
    coalesce(movie.is_published, false),
    public.movie_is_preview_only(movie)
  into declared_total, advertised_episode, normalized_status, normalized_label,
       raw_suffix, current_seo_status, currently_published, preview_only
  from public.movies movie
  where movie.id = p_movie_id;

  if not found then return 0; end if;
  perform set_config('app.movie_refresh_processing', '1', true);

  if max_episode > 0 and has_usable_playback then
    update public.movies
    set
      is_published = case
        when current_seo_status in ('hidden', 'draft', 'superseded') then is_published
        else true
      end,
      seo_catalog_status = case
        when current_seo_status in ('hidden', 'draft', 'superseded') then seo_catalog_status
        else 'published'
      end,
      status = case
        when declared_total > 0 and max_episode = declared_total then 'completed'
        when declared_total <> max_episode
          or normalized_status in ('upcoming', 'trailer', 'returning series', 'in production')
          then 'ongoing'
        else status
      end,
      episode_current = case
        when declared_total > 0 and max_episode = declared_total
          then 'Hoàn Tất (' || max_episode::text || '/' || declared_total::text || ')'
        when advertised_episode is distinct from max_episode
          or normalized_label ~ '(trailer|sap chieu|đang cập nhật|dang cap nhat|hoàn tất|hoan tat)'
          then 'Tập ' || max_episode::text || raw_suffix
        else episode_current
      end,
      current_episode = max_episode,
      updated_at = case
        when advertised_episode is distinct from max_episode
          or normalized_status in ('upcoming', 'trailer', 'returning series', 'in production')
          or normalized_label ~ '(trailer|sap chieu|đang cập nhật|dang cap nhat|hoàn tất|hoan tat)'
          or currently_published is false
          then now()
        else updated_at
      end
    where id = p_movie_id;
  elsif not preview_only and currently_published then
    -- Missing/region-blocked candidates require provider verification. Do not
    -- turn a single machine's verdict into site-wide removal or lost episode counts.
    return 0;
  end if;

  return case when has_usable_playback then max_episode else 0 end;
end;
$function$
;
commit;
