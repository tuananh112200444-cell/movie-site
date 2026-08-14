-- A stored URL is not proof that an episode is playable. Use one health-aware
-- episode truth for release reconciliation, gap detection, and repair closure.

create or replace function public.get_movie_playable_episode_numbers(p_movie_id uuid)
returns table(episode_number integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with legacy_links as materialized (
    select
      episode.episode_number::integer as episode_number,
      rtrim(replace(trim(coalesce(episode.link_m3u8, '')), '&amp;', '&'), '/') as direct_url,
      rtrim(replace(trim(coalesce(episode.link_embed, '')), '&amp;', '&'), '/') as embed_url
    from public.movie_episodes episode
    where episode.movie_id = p_movie_id
      and episode.episode_number between 1 and 10000
      and lower(trim(coalesce(episode.source, ''))) <> 'hidden'
      and (
        coalesce(trim(episode.link_m3u8), '') ~* '^https?://'
        or coalesce(trim(episode.link_embed), '') ~* '^https?://'
      )
    union all
    select
      episode.episode_number::integer,
      rtrim(replace(trim(coalesce(episode.link_m3u8, '')), '&amp;', '&'), '/'),
      rtrim(replace(trim(coalesce(episode.link_embed, '')), '&amp;', '&'), '/')
    from public.episodes episode
    where episode.movie_id = p_movie_id
      and episode.episode_number between 1 and 10000
      and (
        coalesce(trim(episode.link_m3u8), '') ~* '^https?://'
        or coalesce(trim(episode.link_embed), '') ~* '^https?://'
      )
  ), stream_health as materialized (
    select
      case
        when lower(trim(coalesce(stream.episode_slug, ''))) = 'full' then 1
        when trim(coalesce(stream.episode_slug, '')) ~* '^(tap[-_ ]*)?[0-9]{1,4}($|[-_ ])'
          then substring(trim(stream.episode_slug) from '([0-9]{1,4})')::integer
        else null
      end as episode_number,
      rtrim(replace(trim(coalesce(stream.stream_url, '')), '&amp;', '&'), '/') as direct_url,
      rtrim(replace(trim(coalesce(stream.embed_url, '')), '&amp;', '&'), '/') as embed_url,
      public.stream_row_is_publicly_usable(stream) as is_usable
    from public.streams stream
    where stream.movie_id = p_movie_id
  ), playable as (
    select stream.episode_number
    from stream_health stream
    where stream.is_usable is true
      and stream.episode_number between 1 and 10000
    union
    select legacy.episode_number
    from legacy_links legacy
    where
      not exists (
        select 1
        from stream_health stream
        where (legacy.direct_url <> '' and legacy.direct_url in (stream.direct_url, stream.embed_url))
           or (legacy.embed_url <> '' and legacy.embed_url in (stream.direct_url, stream.embed_url))
      )
      or exists (
        select 1
        from stream_health stream
        where stream.is_usable is true
          and (
            (legacy.direct_url <> '' and legacy.direct_url in (stream.direct_url, stream.embed_url))
            or (legacy.embed_url <> '' and legacy.embed_url in (stream.direct_url, stream.embed_url))
          )
      )
  )
  select distinct playable.episode_number::integer
  from playable
  where playable.episode_number between 1 and 10000;
$$;

revoke all on function public.get_movie_playable_episode_numbers(uuid)
  from public, anon, authenticated;
grant execute on function public.get_movie_playable_episode_numbers(uuid)
  to service_role;

create or replace function public.get_movie_playable_max_episode(p_movie_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(playable.episode_number), 0)::integer
  from public.get_movie_playable_episode_numbers(p_movie_id) playable;
$$;

revoke all on function public.get_movie_playable_max_episode(uuid)
  from public, anon, authenticated;
grant execute on function public.get_movie_playable_max_episode(uuid)
  to service_role;

create or replace function public.scan_episode_sequence_gaps(p_limit integer default 600)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  scan_limit integer := greatest(50, least(coalesce(p_limit, 600), 1500));
  scanned integer := 0;
  detected integer := 0;
  queued integer := 0;
begin
  create temporary table sequence_scan_movies on commit drop as
  select m.id, m.slug, m.source_site, m.current_episode
  from public.movies m
  where m.is_published is true
    and lower(coalesce(m.status, 'ongoing')) not in ('upcoming', 'trailer')
    and coalesce(m.current_episode, 0) between 2 and 500
    and lower(coalesce(m.source_site, '')) in ('ophim', 'ophim1.com', 'phimapi')
  order by coalesce(m.last_synced_at, '-infinity'::timestamptz), m.updated_at desc
  limit scan_limit;
  get diagnostics scanned = row_count;

  create index on sequence_scan_movies(id);

  create temporary table sequence_playable on commit drop as
  select distinct movie.id as movie_id, playable.episode_number
  from sequence_scan_movies movie
  cross join lateral public.get_movie_playable_episode_numbers(movie.id) playable
  where playable.episode_number between 1 and movie.current_episode;
  create index on sequence_playable(movie_id, episode_number);

  create temporary table sequence_gaps on commit drop as
  select
    movie.id as movie_id,
    movie.slug,
    movie.source_site,
    movie.current_episode,
    gap.missing
  from sequence_scan_movies movie
  cross join lateral (
    select array_agg(expected order by expected) as missing
    from generate_series(1, movie.current_episode) expected
    where not exists (
      select 1
      from sequence_playable playable
      where playable.movie_id = movie.id
        and playable.episode_number = expected
    )
  ) gap
  where coalesce(array_length(gap.missing, 1), 0) > 0;

  insert into public.catalog_integrity_issues as issue (
    issue_key, issue_type, movie_id, severity, confidence, status,
    evidence, first_detected_at, last_detected_at, resolved_at
  )
  select
    'episode_sequence_gap:' || gap.movie_id,
    'episode_sequence_gap',
    gap.movie_id,
    5,
    0.9950,
    'open',
    jsonb_build_object(
      'slug', gap.slug,
      'source_site', gap.source_site,
      'advertised', gap.current_episode,
      'missing', to_jsonb(gap.missing),
      'repair_contract', 'health_aware_movie_identity_v3'
    ),
    now(),
    now(),
    null
  from sequence_gaps gap
  on conflict (issue_key) do update set
    severity = excluded.severity,
    confidence = excluded.confidence,
    status = case when issue.status = 'ignored' then 'ignored' else 'open' end,
    evidence = excluded.evidence,
    last_detected_at = now(),
    resolved_at = null,
    attempts = case when issue.status = 'resolved' then 0 else issue.attempts end;
  get diagnostics detected = row_count;

  update public.catalog_integrity_issues issue
  set status = 'resolved',
      resolved_at = now(),
      last_detected_at = now(),
      last_error = null
  where issue.issue_type = 'episode_sequence_gap'
    and issue.status in ('open', 'repairing')
    and issue.movie_id in (select id from sequence_scan_movies)
    and not exists (
      select 1 from sequence_gaps gap where gap.movie_id = issue.movie_id
    );

  insert into public.movie_refresh_queue as queue (
    movie_id, requested_at, next_attempt_at, reasons
  )
  select
    gap.movie_id,
    now(),
    now(),
    array['catalog_integrity:episode_sequence_gap']
  from sequence_gaps gap
  on conflict (movie_id) do update set
    requested_at = excluded.requested_at,
    next_attempt_at = least(queue.next_attempt_at, now()),
    reasons = (
      select array_agg(distinct reason)
      from unnest(queue.reasons || excluded.reasons) reason
    );
  get diagnostics queued = row_count;

  return jsonb_build_object(
    'scanned', scanned,
    'detected', detected,
    'queued', queued,
    'truth', 'health_aware_v3'
  );
end;
$$;

revoke all on function public.scan_episode_sequence_gaps(integer)
  from public, anon, authenticated;
grant execute on function public.scan_episode_sequence_gaps(integer)
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
  with candidates as materialized (
    select issue_key
    from public.catalog_integrity_issues
    where status in ('open', 'repairing')
      and issue_type in (
        'published_without_playback',
        'episode_count_mismatch',
        'episode_sequence_gap'
      )
    order by last_detected_at asc nulls first, issue_key
    for update skip locked
    limit 20
  ), resolved as (
    update public.catalog_integrity_issues issue
    set
      status = 'resolved',
      resolved_at = now(),
      last_detected_at = now(),
      last_error = null
    from candidates
    where issue.issue_key = candidates.issue_key
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
          ) <= public.get_movie_playable_max_episode(issue.movie_id)
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
                from public.get_movie_playable_episode_numbers(issue.movie_id) playable
                where playable.episode_number = missing.value::integer
              )
          )
        )
      )
    returning 1
  )
  select count(*) into resolved_count from resolved;

  with stale_repairing as materialized (
    select issue_key
    from public.catalog_integrity_issues
    where status = 'repairing'
      and coalesce((evidence->>'repair_dispatched_at')::timestamptz, last_detected_at)
        < now() - interval '10 minutes'
    order by last_detected_at asc nulls first, issue_key
    for update skip locked
    limit 20
  ), reopened as (
    update public.catalog_integrity_issues issue
    set
      status = 'open',
      last_error = case
        when attempts >= 3 then 'Targeted source repair exhausted; upstream detail or playable episode is unavailable'
        else 'Targeted source repair did not produce playable coverage; retry scheduled'
      end
    from stale_repairing
    where issue.issue_key = stale_repairing.issue_key
    returning 1
  )
  select count(*) into reopened_count from reopened;

  return jsonb_build_object(
    'resolved', resolved_count,
    'reopened', reopened_count,
    'batch_limit', 20,
    'truth', 'health_aware_v3'
  );
end;
$$;

revoke all on function public.reconcile_catalog_source_repairs()
  from public, anon, authenticated;
grant execute on function public.reconcile_catalog_source_repairs()
  to service_role;

-- Re-evaluate the two verified examples with the canonical truth immediately.
select public.reconcile_movie_release_state('dfdfe36f-56df-4826-b593-f7ed9616d3e9'::uuid);
select public.reconcile_movie_release_state('941028ad-1f20-4478-809a-701ea4342a83'::uuid);

comment on function public.get_movie_playable_episode_numbers(uuid) is
  'Canonical episode truth: a healthy stream or a legacy URL not contradicted by matching failed stream health.';
comment on function public.get_movie_playable_max_episode(uuid) is
  'Highest episode from the shared health-aware playable episode truth.';
comment on function public.scan_episode_sequence_gaps(integer) is
  'Bounded missing-episode scanner that does not count known dead URLs as playable episodes.';
