-- Detect playback holes from durable provider episode rows as well as mutable
-- movie metadata. Health reconciliation may lower current_episode to the last
-- usable source; using that lowered value alone hid newer dead/missing rows.

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
  with candidate_movies as materialized (
    select movie.id, movie.slug, movie.source_site, movie.current_episode,
           movie.last_synced_at, movie.updated_at
    from public.movies movie
    where movie.is_published is true
      and not public.movie_is_preview_only(movie)
    order by coalesce(movie.last_synced_at, '-infinity'::timestamptz), movie.updated_at desc
    limit scan_limit * 3
  ), stored_coverage as materialized (
    select candidate.movie_id, max(candidate.episode_number)::integer as max_episode
    from (
      select episode.movie_id, episode.episode_number
      from public.movie_episodes episode
      where episode.movie_id in (select id from candidate_movies)
        and episode.episode_number between 1 and 500
        and lower(trim(coalesce(episode.source, ''))) <> 'hidden'
        and (
          coalesce(trim(episode.link_m3u8), '') ~* '^https?://'
          or coalesce(trim(episode.link_embed), '') ~* '^https?://'
        )
      union all
      select episode.movie_id, episode.episode_number
      from public.episodes episode
      where episode.movie_id in (select id from candidate_movies)
        and episode.episode_number between 1 and 500
        and (
          coalesce(trim(episode.link_m3u8), '') ~* '^https?://'
          or coalesce(trim(episode.link_embed), '') ~* '^https?://'
        )
    ) candidate
    group by candidate.movie_id
  )
  select
    movie.id,
    movie.slug,
    movie.source_site,
    coalesce(movie.current_episode, 0)::integer as metadata_episode,
    coalesce(stored.max_episode, 0)::integer as stored_episode,
    greatest(
      coalesce(movie.current_episode, 0),
      coalesce(stored.max_episode, 0)
    )::integer as advertised_episode
  from candidate_movies movie
  left join stored_coverage stored on stored.movie_id = movie.id
  where greatest(
      coalesce(movie.current_episode, 0),
      coalesce(stored.max_episode, 0)
    ) between 2 and 500
  order by
    case when coalesce(stored.max_episode, 0) > coalesce(movie.current_episode, 0) then 0 else 1 end,
    coalesce(movie.last_synced_at, '-infinity'::timestamptz),
    movie.updated_at desc
  limit scan_limit;
  get diagnostics scanned = row_count;

  create index on sequence_scan_movies(id);

  create temporary table sequence_playable on commit drop as
  select distinct movie.id as movie_id, playable.episode_number
  from sequence_scan_movies movie
  cross join lateral public.get_movie_playable_episode_numbers(movie.id) playable
  where playable.episode_number between 1 and movie.advertised_episode;
  create index on sequence_playable(movie_id, episode_number);

  create temporary table sequence_gaps on commit drop as
  select
    movie.id as movie_id,
    movie.slug,
    movie.source_site,
    movie.metadata_episode,
    movie.stored_episode,
    movie.advertised_episode,
    gap.missing
  from sequence_scan_movies movie
  cross join lateral (
    select array_agg(expected order by expected) as missing
    from generate_series(1, movie.advertised_episode) expected
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
    0.9980,
    'open',
    jsonb_build_object(
      'slug', gap.slug,
      'source_site', gap.source_site,
      'advertised', gap.advertised_episode,
      'metadata_episode', gap.metadata_episode,
      'stored_episode', gap.stored_episode,
      'missing', to_jsonb(gap.missing),
      'repair_contract', 'health_aware_stored_coverage_v4'
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
    'truth', 'health_aware_stored_coverage_v4'
  );
end;
$$;

revoke all on function public.scan_episode_sequence_gaps(integer)
  from public, anon, authenticated;
grant execute on function public.scan_episode_sequence_gaps(integer)
  to service_role;

select public.scan_episode_sequence_gaps(600);

comment on function public.scan_episode_sequence_gaps(integer) is
  'Detects missing/dead episode numbers through the larger of metadata and durable provider coverage, so health-driven metadata downgrades cannot hide gaps.';
