-- A promotional trailer is not playback. Keep genuine preview pages public,
-- quarantine released titles whose sources are exhausted, and let a freshly
-- verified stream restore them through the existing health-change trigger.

create or replace function public.movie_is_preview_only(p_movie public.movies)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    lower(trim(coalesce(p_movie.status, ''))) in ('upcoming', 'trailer')
    or lower(trim(coalesce(p_movie.seo_catalog_status, ''))) in ('upcoming', 'trailer')
    or lower(trim(coalesce(p_movie.episode_current, ''))) ~ '(trailer|sắp chiếu|sap chieu)'
    or (
      nullif(trim(coalesce(p_movie.trailer_url, '')), '') is not null
      and coalesce(p_movie.current_episode, 0) <= 0
      and coalesce(p_movie.episode_current, '') !~ '[0-9]'
      and lower(trim(coalesce(p_movie.status, ''))) not in ('completed', 'ongoing', 'released')
    );
$$;

revoke all on function public.movie_is_preview_only(public.movies)
  from public, anon, authenticated;
grant execute on function public.movie_is_preview_only(public.movies)
  to service_role;

create or replace function public.enforce_movie_publication_truth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.is_published, false) is not true then
    return new;
  end if;

  if not public.movie_is_preview_only(new)
     and not public.movie_has_usable_persisted_playback(new.id)
  then
    new.is_published := false;
    if lower(coalesce(new.seo_catalog_status, '')) not in ('hidden', 'draft', 'superseded') then
      new.seo_catalog_status := 'awaiting_playback';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_movie_publication_truth()
  from public, anon, authenticated;

create or replace function public.reconcile_movie_release_state(p_movie_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if not found then
    return 0;
  end if;

  perform set_config('app.movie_refresh_processing', '1', true);

  if max_episode > 0 and has_usable_playback then
    update public.movies
    set
      is_published = case
        when current_seo_status = 'awaiting_playback' then true
        else is_published
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
          then now()
        else updated_at
      end
    where id = p_movie_id;
  elsif not preview_only and currently_published then
    update public.movies
    set
      is_published = false,
      seo_catalog_status = case
        when current_seo_status in ('hidden', 'draft', 'superseded') then seo_catalog_status
        else 'awaiting_playback'
      end,
      current_episode = 0,
      episode_current = 'Đang cập nhật',
      updated_at = now()
    where id = p_movie_id;
  end if;

  return case when has_usable_playback then max_episode else 0 end;
end;
$$;

revoke all on function public.reconcile_movie_release_state(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_movie_release_state(uuid)
  to service_role;

create or replace function public.quarantine_exhausted_catalog_playback()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  detected_count integer := 0;
  quarantined_slugs text[] := array[]::text[];
  quarantined_count integer := 0;
begin
  perform public.reconcile_catalog_source_repairs();

  insert into public.catalog_integrity_issues as issue (
    issue_key, issue_type, movie_id, severity, confidence, status,
    evidence, first_detected_at, last_detected_at, resolved_at, attempts,
    last_error
  )
  select
    'published_without_playback:' || movie.id,
    'published_without_playback',
    movie.id,
    5,
    0.9990,
    'open',
    jsonb_build_object(
      'slug', movie.slug,
      'source_site', movie.source_site,
      'episode_current', movie.episode_current,
      'current_episode', movie.current_episode,
      'health_exhausted_at', now(),
      'preview_contract', 'released_trailer_is_not_playback_v2'
    ),
    now(), now(), null, 0,
    'No usable persisted playback candidate; hidden pending repair'
  from public.movies movie
  where movie.is_published is true
    and not public.movie_is_preview_only(movie)
    and not public.movie_has_usable_persisted_playback(movie.id)
  order by movie.updated_at desc nulls last
  limit 250
  on conflict (issue_key) do update set
    status = 'open',
    severity = 5,
    confidence = 0.9990,
    evidence = issue.evidence || excluded.evidence,
    last_detected_at = now(),
    resolved_at = null,
    last_error = excluded.last_error;
  get diagnostics detected_count = row_count;

  with candidates as materialized (
    select movie.id, movie.slug
    from public.catalog_integrity_issues issue
    join public.movies movie on movie.id = issue.movie_id
    where issue.status = 'open'
      and issue.issue_type = 'published_without_playback'
      and movie.is_published is true
      and not public.movie_is_preview_only(movie)
      and not public.movie_has_usable_persisted_playback(movie.id)
    order by issue.last_detected_at desc nulls last
    limit 500
  ), updated as (
    update public.movies movie
    set
      is_published = false,
      seo_catalog_status = case
        when lower(coalesce(movie.seo_catalog_status, '')) in ('hidden', 'draft', 'superseded')
          then movie.seo_catalog_status
        else 'awaiting_playback'
      end,
      current_episode = 0,
      episode_current = 'Đang cập nhật',
      updated_at = now()
    from candidates candidate
    where movie.id = candidate.id
    returning movie.slug
  )
  select coalesce(array_agg(slug), array[]::text[]), count(*)
  into quarantined_slugs, quarantined_count
  from updated;

  if quarantined_count > 0 then
    update public.movie_api_cache
    set expires_at = now()
    where slug = any(quarantined_slugs);
    update public.home_page_cache set expires_at = now();
  end if;

  return jsonb_build_object(
    'detected', detected_count,
    'quarantined', quarantined_count,
    'preview_contract', 'released_trailer_is_not_playback_v2'
  );
end;
$$;

revoke all on function public.quarantine_exhausted_catalog_playback()
  from public, anon, authenticated;
grant execute on function public.quarantine_exhausted_catalog_playback()
  to service_role;

-- Run one bounded pass now. The existing capacity-aware cron continues the
-- catalogue until no released title remains publicly advertised without a
-- usable source.
select public.quarantine_exhausted_catalog_playback();

comment on function public.movie_is_preview_only(public.movies) is
  'Canonical preview truth: a trailer URL alone never exempts a released title from playback requirements.';
comment on function public.quarantine_exhausted_catalog_playback() is
  'Quarantines released titles without health-aware playback, including completed movies that retain promotional trailers.';
