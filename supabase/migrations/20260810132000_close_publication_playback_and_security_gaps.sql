-- Viewer-first integrity closeout.
-- Keep trailer/upcoming pages public, but never expose a watchable catalogue
-- promise without persisted usable playback. Background work stays bounded.

create index if not exists catalog_integrity_issues_related_movie_id_idx
  on public.catalog_integrity_issues (related_movie_id)
  where related_movie_id is not null;

create or replace function public.enforce_movie_publication_truth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trailer_or_upcoming boolean := false;
begin
  if coalesce(new.is_published, false) is not true then
    return new;
  end if;

  trailer_or_upcoming :=
    lower(coalesce(new.status, '')) in ('upcoming', 'trailer')
    or lower(coalesce(new.seo_catalog_status, '')) in ('upcoming', 'trailer')
    or lower(coalesce(new.episode_current, '')) ~ '(trailer|sắp chiếu|sap chieu)'
    or nullif(trim(coalesce(new.trailer_url, '')), '') is not null;

  if not trailer_or_upcoming
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

drop trigger if exists enforce_movie_publication_truth_trigger on public.movies;
create trigger enforce_movie_publication_truth_trigger
before insert or update of is_published, status, episode_current, trailer_url, seo_catalog_status
on public.movies
for each row execute function public.enforce_movie_publication_truth();

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
  trailer_or_upcoming boolean := false;
  has_usable_playback boolean := false;
begin
  max_episode := public.get_movie_playable_max_episode(p_movie_id);
  has_usable_playback := public.movie_has_usable_persisted_playback(p_movie_id);

  select
    greatest(
      coalesce(total_episodes, 0),
      coalesce(nullif(substring(coalesce(episode_total, '') from '([0-9]+)'), '')::integer, 0)
    ),
    greatest(
      coalesce(current_episode, 0),
      coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::integer, 0)
    ),
    lower(coalesce(status, '')),
    lower(coalesce(episode_current, '')),
    case when lower(coalesce(episode_current, '')) like '%raw%' then ' RAW' else '' end,
    lower(coalesce(seo_catalog_status, '')),
    coalesce(is_published, false),
    lower(coalesce(status, '')) in ('upcoming', 'trailer')
      or lower(coalesce(seo_catalog_status, '')) in ('upcoming', 'trailer')
      or lower(coalesce(episode_current, '')) ~ '(trailer|sắp chiếu|sap chieu)'
      or nullif(trim(coalesce(trailer_url, '')), '') is not null
  into declared_total, advertised_episode, normalized_status, normalized_label,
       raw_suffix, current_seo_status, currently_published, trailer_or_upcoming
  from public.movies
  where id = p_movie_id;

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
  elsif not trailer_or_upcoming and currently_published then
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

create or replace function public.process_movie_refresh_queue(p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  processed integer := 0;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  perform set_config('app.movie_refresh_processing', '1', true);

  for item in
    with oldest_due as materialized (
      select q.movie_id
      from public.movie_refresh_queue q
      where q.next_attempt_at <= now()
        and q.requested_at < now() - interval '6 hours'
      order by q.requested_at asc, q.movie_id
      limit 1
    ), selected as materialized (
      select
        q.movie_id,
        case when q.movie_id = (select movie_id from oldest_due) then 0 else 1 end as queue_class,
        q.requested_at
      from public.movie_refresh_queue q
      where q.next_attempt_at <= now()
      order by
        case when q.movie_id = (select movie_id from oldest_due) then 0 else 1 end,
        (q.requested_at >= now() - interval '6 hours') desc,
        case when q.requested_at >= now() - interval '6 hours' then q.requested_at end desc nulls last,
        case when q.requested_at < now() - interval '6 hours' then q.requested_at end asc nulls last,
        q.movie_id
      limit safe_limit
    )
    select q.movie_id
    from public.movie_refresh_queue q
    join selected s on s.movie_id = q.movie_id
    order by s.queue_class, s.requested_at, q.movie_id
    for update of q skip locked
  loop
    begin
      perform public.reconcile_movie_release_state(item.movie_id);
      perform public.refresh_movie_seo_quality(item.movie_id);
      delete from public.movie_refresh_queue where movie_id = item.movie_id;
      processed := processed + 1;
    exception when others then
      update public.movie_refresh_queue
      set
        attempts = attempts + 1,
        last_error = left(sqlerrm, 1000),
        next_attempt_at = now() + make_interval(
          mins => least(60, greatest(1, power(2, least(attempts, 5))::integer))
        )
      where movie_id = item.movie_id;
    end;
  end loop;

  perform set_config('app.movie_refresh_processing', '0', true);
  return processed;
end;
$$;

revoke all on function public.process_movie_refresh_queue(integer)
  from public, anon, authenticated;
grant execute on function public.process_movie_refresh_queue(integer)
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
      'health_exhausted_at', now()
    ),
    now(), now(), null, 0,
    'No usable persisted playback candidate; hidden pending repair'
  from public.movies movie
  where movie.is_published is true
    and lower(coalesce(movie.status, '')) not in ('upcoming', 'trailer')
    and lower(coalesce(movie.episode_current, '')) !~ '(trailer|sắp chiếu|sap chieu)'
    and nullif(trim(coalesce(movie.trailer_url, '')), '') is null
    and lower(coalesce(movie.seo_catalog_status, '')) not in ('upcoming', 'trailer')
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
      and lower(coalesce(movie.status, '')) not in ('upcoming', 'trailer')
      and lower(coalesce(movie.episode_current, '')) !~ '(trailer|sắp chiếu|sap chieu)'
      and nullif(trim(coalesce(movie.trailer_url, '')), '') is null
      and lower(coalesce(movie.seo_catalog_status, '')) not in ('upcoming', 'trailer')
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

  return jsonb_build_object('detected', detected_count, 'quarantined', quarantined_count);
end;
$$;

revoke all on function public.quarantine_exhausted_catalog_playback()
  from public, anon, authenticated;
grant execute on function public.quarantine_exhausted_catalog_playback()
  to service_role;

-- Raw stream candidates are internal health-check data, never a public RPC.
revoke all on function public.pick_unchecked_stream_health_candidates(uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.pick_unchecked_stream_health_candidates(uuid[], integer)
  to service_role;

-- Trigger helpers execute through their triggers and need no public RPC grant.
revoke all on function public.enqueue_movie_refresh_after_episode_change()
  from public, anon, authenticated;
revoke all on function public.enqueue_movie_refresh_after_movie_change()
  from public, anon, authenticated;
revoke all on function public.reconcile_movie_after_episode_change()
  from public, anon, authenticated;
revoke all on function public.refresh_movie_search_document()
  from public, anon, authenticated;
revoke all on function public.refresh_movie_seo_quality_after_movie_change()
  from public, anon, authenticated;

-- Apply the same truth gate immediately to the small currently visible set.
select public.quarantine_exhausted_catalog_playback();
