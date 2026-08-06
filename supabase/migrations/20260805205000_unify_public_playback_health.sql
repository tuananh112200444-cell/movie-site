-- Keep the existing catalogue repair brain, but make every publication path
-- use the same stream-health truth as movie-detail-proxy.

create or replace function public.movie_has_usable_persisted_playback(p_movie_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with legacy_links as materialized (
    select
      lower(trim(coalesce(episode.server_name, ''))) as server_name,
      lower(trim(coalesce(episode.slug, ''))) as episode_slug,
      rtrim(replace(trim(coalesce(episode.link_m3u8, '')), '&amp;', '&'), '/') as direct_url,
      rtrim(replace(trim(coalesce(episode.link_embed, '')), '&amp;', '&'), '/') as embed_url
    from public.movie_episodes episode
    where episode.movie_id = p_movie_id
      and lower(trim(coalesce(episode.source, ''))) <> 'hidden'
      and (coalesce(trim(episode.link_m3u8), '') ~* '^https?://' or coalesce(trim(episode.link_embed), '') ~* '^https?://')
    union all
    select
      lower(trim(coalesce(episode.server_name, ''))),
      lower(trim(coalesce(episode.episode_slug, ''))),
      rtrim(replace(trim(coalesce(episode.link_m3u8, '')), '&amp;', '&'), '/'),
      rtrim(replace(trim(coalesce(episode.link_embed, '')), '&amp;', '&'), '/')
    from public.episodes episode
    where episode.movie_id = p_movie_id
      and (coalesce(trim(episode.link_m3u8), '') ~* '^https?://' or coalesce(trim(episode.link_embed), '') ~* '^https?://')
  ), stream_health as materialized (
    select
      stream.is_active,
      lower(trim(coalesce(stream.server_name, ''))) as server_name,
      lower(trim(coalesce(stream.episode_slug, ''))) as episode_slug,
      rtrim(replace(trim(coalesce(stream.stream_url, '')), '&amp;', '&'), '/') as direct_url,
      rtrim(replace(trim(coalesce(stream.embed_url, '')), '&amp;', '&'), '/') as embed_url,
      lower(trim(coalesce(stream.health_status, 'unchecked'))) as health_status,
      coalesce(stream.failure_count, 0) as failure_count,
      coalesce(stream.last_error, '') as last_error
    from public.streams stream
    where stream.movie_id = p_movie_id
  ), usable_streams as materialized (
    select *
    from stream_health stream
    where stream.is_active is true
      and (stream.direct_url ~* '^https?://' or stream.embed_url ~* '^https?://')
      and stream.health_status <> 'dead'
      and stream.last_error not like 'Provider verification pending:%'
      and not (stream.health_status = 'failed' and stream.failure_count >= 3)
      and not (
        stream.health_status = 'blocked'
        and stream.embed_url !~* '^https?://player\.phimapi\.com/player/'
        and stream.embed_url !~* '^https?://[^/]*streamc\.xyz/'
      )
  )
  select
    exists (select 1 from usable_streams)
    or exists (
      select 1
      from legacy_links legacy
      where
        not exists (
          select 1
          from stream_health stream
          where (legacy.direct_url <> '' and legacy.direct_url in (stream.direct_url, stream.embed_url))
             or (legacy.embed_url <> '' and legacy.embed_url in (stream.direct_url, stream.embed_url))
             or (
               legacy.server_name <> '' and legacy.episode_slug <> ''
               and legacy.server_name = stream.server_name
               and legacy.episode_slug = stream.episode_slug
             )
        )
        or exists (
          select 1
          from usable_streams stream
          where (legacy.direct_url <> '' and legacy.direct_url in (stream.direct_url, stream.embed_url))
             or (legacy.embed_url <> '' and legacy.embed_url in (stream.direct_url, stream.embed_url))
             or (
               legacy.server_name <> '' and legacy.episode_slug <> ''
               and legacy.server_name = stream.server_name
               and legacy.episode_slug = stream.episode_slug
             )
        )
    );
$$;

revoke all on function public.movie_has_usable_persisted_playback(uuid)
  from public, anon, authenticated;
grant execute on function public.movie_has_usable_persisted_playback(uuid)
  to service_role;

create or replace function public.reconcile_catalog_source_repairs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
  reopened_count integer := 0;
begin
  update public.catalog_integrity_issues issue
  set
    status = 'resolved',
    resolved_at = now(),
    last_detected_at = now(),
    last_error = null
  where issue.status in ('open', 'repairing')
    and (
      (
        issue.issue_type = 'published_without_playback'
        and public.movie_has_usable_persisted_playback(issue.movie_id)
      )
      or (
        issue.issue_type = 'episode_count_mismatch'
        and coalesce(
          (select movie.current_episode from public.movies movie where movie.id = issue.movie_id),
          (issue.evidence->>'advertised')::integer,
          0
        ) <= greatest(
          coalesce((
            select max(episode.episode_number)
            from public.movie_episodes episode
            where episode.movie_id = issue.movie_id
              and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
          ), 0),
          coalesce((
            select max(episode.episode_number)
            from public.episodes episode
            where episode.movie_id = issue.movie_id
              and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
          ), 0)
        )
      )
      or (
        issue.issue_type = 'episode_sequence_gap'
        and jsonb_typeof(issue.evidence->'missing') = 'array'
        and not exists (
          select 1
          from jsonb_array_elements_text(issue.evidence->'missing') missing(value)
          where missing.value ~ '^[0-9]+$'
            and not exists (
              select 1
              from public.movie_episodes episode
              where episode.movie_id = issue.movie_id
                and episode.episode_number = missing.value::integer
                and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
              union all
              select 1
              from public.episodes episode
              where episode.movie_id = issue.movie_id
                and episode.episode_number = missing.value::integer
                and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
            )
        )
      )
    );
  get diagnostics resolved_count = row_count;

  update public.catalog_integrity_issues
  set
    status = 'open',
    last_error = case
      when attempts >= 3 then 'Targeted source repair exhausted; upstream detail or playable episode is unavailable'
      else 'Targeted source repair did not produce the required playable coverage; retry scheduled'
    end
  where status = 'repairing'
    and coalesce((evidence->>'repair_dispatched_at')::timestamptz, last_detected_at)
      < now() - interval '10 minutes';
  get diagnostics reopened_count = row_count;

  return jsonb_build_object('resolved', resolved_count, 'reopened', reopened_count);
end;
$$;

revoke all on function public.reconcile_catalog_source_repairs()
  from public, anon, authenticated;
grant execute on function public.reconcile_catalog_source_repairs()
  to service_role;

create or replace function public.quarantine_exhausted_catalog_playback()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  detected_count integer := 0;
  quarantined_ids uuid[] := array[]::uuid[];
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
    and lower(coalesce(movie.episode_current, '')) !~ '(dang cap nhat|coming|updating|ng c.p nh.t)'
    and lower(coalesce(movie.episode_current, '')) !~ '(trailer|sáº¯p chiáº¿u|sap chieu)'
    and coalesce(movie.seo_catalog_status, '') not in ('upcoming', 'trailer')
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
      and lower(coalesce(movie.episode_current, '')) !~ '(dang cap nhat|coming|updating|ng c.p nh.t)'
      and lower(coalesce(movie.episode_current, '')) !~ '(trailer|sáº¯p chiáº¿u|sap chieu)'
      and not public.movie_has_usable_persisted_playback(movie.id)
    limit 500
  ), updated as (
    update public.movies movie
    set is_published = false,
        updated_at = now()
    from candidates candidate
    where movie.id = candidate.id
    returning movie.id, movie.slug
  )
  select
    coalesce(array_agg(id), array[]::uuid[]),
    coalesce(array_agg(slug), array[]::text[]),
    count(*)
  into quarantined_ids, quarantined_slugs, quarantined_count
  from updated;

  if quarantined_count > 0 then
    update public.movie_api_cache
    set expires_at = now()
    where slug = any(quarantined_slugs);

    update public.home_page_cache set expires_at = now();
  end if;

  return jsonb_build_object(
    'detected', detected_count,
    'quarantined', quarantined_count
  );
end;
$$;

revoke all on function public.quarantine_exhausted_catalog_playback()
  from public, anon, authenticated;
grant execute on function public.quarantine_exhausted_catalog_playback()
  to service_role;

comment on function public.movie_has_usable_persisted_playback(uuid) is
  'One playback truth shared by publication and repair: legacy episode URLs cannot override a matching suppressed stream-health row.';
