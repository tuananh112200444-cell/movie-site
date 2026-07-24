-- Detect missing episodes inside an advertised sequence (for example only
-- episodes 3 and 4 exist) and repair by stable movie identity rather than by a
-- provider-specific slug.

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
  select distinct movie_id, episode_number
  from (
    select e.movie_id, e.episode_number
    from public.movie_episodes e
    join sequence_scan_movies m on m.id = e.movie_id
    where e.episode_number between 1 and m.current_episode
      and (coalesce(e.link_m3u8, '') <> '' or coalesce(e.link_embed, '') <> '')
    union
    select e.movie_id, e.episode_number
    from public.episodes e
    join sequence_scan_movies m on m.id = e.movie_id
    where e.episode_number between 1 and m.current_episode
      and (coalesce(e.link_m3u8, '') <> '' or coalesce(e.link_embed, '') <> '')
  ) playable;
  create index on sequence_playable(movie_id, episode_number);

  create temporary table sequence_gaps on commit drop as
  select
    m.id as movie_id,
    m.slug,
    m.source_site,
    m.current_episode,
    gap.missing
  from sequence_scan_movies m
  cross join lateral (
    select array_agg(expected order by expected) as missing
    from generate_series(1, m.current_episode) expected
    where not exists (
      select 1
      from sequence_playable playable
      where playable.movie_id = m.id
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
      'repair_contract', 'movie_identity_v2'
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
    attempts = case
      when issue.status = 'resolved' then 0
      else issue.attempts
    end;
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
    'queued', queued
  );
end;
$$;

revoke all on function public.scan_episode_sequence_gaps(integer)
  from public, anon, authenticated;
grant execute on function public.scan_episode_sequence_gaps(integer)
  to service_role;

create or replace function public.dispatch_catalog_source_repairs(p_limit integer default 3)
returns jsonb
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  item record;
  request_id bigint;
  dispatched integer := 0;
  cron_secret text;
  provider text;
begin
  perform public.reconcile_catalog_source_repairs();

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'CRON_SECRET'
  order by created_at desc
  limit 1;

  if nullif(cron_secret, '') is null then
    return jsonb_build_object('dispatched', 0, 'error', 'CRON_SECRET unavailable');
  end if;

  for item in
    select
      issue.issue_key,
      issue.movie_id,
      movie.slug,
      lower(coalesce(movie.source_site, '')) as source_site
    from public.catalog_integrity_issues issue
    join public.movies movie on movie.id = issue.movie_id
    where issue.status = 'open'
      and issue.issue_type in (
        'published_without_playback',
        'episode_count_mismatch',
        'episode_sequence_gap'
      )
      and issue.attempts < 3
      and lower(coalesce(movie.source_site, '')) in ('ophim', 'ophim1.com', 'phimapi')
      and movie.slug ~ '^[a-z0-9][a-z0-9-]{1,180}$'
    order by issue.severity desc, issue.first_detected_at, issue.issue_key
    for update of issue skip locked
    limit greatest(1, least(coalesce(p_limit, 3), 12))
  loop
    provider := case when item.source_site = 'phimapi' then 'kkphim' else 'ophim' end;

    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies'
        || '?movie_id=' || item.movie_id
        || '&provider=' || provider
        || '&episodes=1&strict_missing_detail=1',
      headers := jsonb_build_object('x-cron-secret', cron_secret),
      timeout_milliseconds := 120000
    )
    into request_id;

    update public.catalog_integrity_issues
    set
      status = 'repairing',
      attempts = attempts + 1,
      last_error = null,
      evidence = evidence || jsonb_build_object(
        'repair_provider', provider,
        'repair_request_id', request_id,
        'repair_movie_id', item.movie_id,
        'repair_dispatched_at', now()
      )
    where issue_key = item.issue_key;

    dispatched := dispatched + 1;
  end loop;

  return jsonb_build_object('dispatched', dispatched);
end;
$$;

revoke all on function public.dispatch_catalog_source_repairs(integer)
  from public, anon, authenticated;
grant execute on function public.dispatch_catalog_source_repairs(integer)
  to service_role;

do $scheduler$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job
      where jobname = 'scan-episode-sequence-gaps-every-5-minutes'
    ) then
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'scan-episode-sequence-gaps-every-5-minutes';
    end if;

    perform cron.schedule(
      'scan-episode-sequence-gaps-every-5-minutes',
      '2-59/5 * * * *',
      $cmd$
        select public.scan_episode_sequence_gaps(600);
        select public.dispatch_catalog_source_repairs(6);
      $cmd$
    );
  end if;
end;
$scheduler$;

select public.scan_episode_sequence_gaps(600);
select public.dispatch_catalog_source_repairs(6);

comment on function public.scan_episode_sequence_gaps(integer) is
  'Detects missing episode numbers inside the advertised playable sequence without deleting any existing source.';
