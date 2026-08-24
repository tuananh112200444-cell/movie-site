-- One queue and one scheduler own provider repair decisions. The existing
-- provider functions remain adapters: they discover/ingest data but no longer
-- compete as independent repair brains.

create index if not exists catalog_integrity_unified_provider_claim_idx
  on public.catalog_integrity_issues (severity desc, first_detected_at, issue_key)
  where status = 'open'
    and issue_type in (
      'published_without_playback',
      'episode_count_mismatch',
      'episode_sequence_gap'
    );

create or replace function public.claim_unified_provider_repairs(p_limit integer default 2)
returns table (
  issue_key text,
  issue_type text,
  movie_id uuid,
  slug text,
  source_site text,
  source_name text,
  current_episode integer,
  total_episodes integer,
  attempts integer,
  evidence jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public.reconcile_catalog_source_repairs();

  -- Seed only a bounded recent slice. This catches quarantined trailer rows
  -- without turning every scheduler tick into a full catalogue scan.
  with recent_source_movies as materialized (
    select movie.id,
           movie.slug,
           movie.source_site,
           movie.source_name,
           movie.current_episode,
           movie.total_episodes,
           movie.episode_current,
           movie.status,
           movie.seo_catalog_status,
           movie.updated_at
    from public.movies movie
    where lower(coalesce(movie.source_site, '')) in (
      'ophim', 'ophim1.com', 'kkphim', 'phimapi', 'vsmov', 'nguonc'
    )
      and movie.slug ~ '^[a-z0-9][a-z0-9-]{1,180}$'
      and lower(coalesce(movie.seo_catalog_status, '')) not in ('hidden', 'draft', 'superseded')
    order by movie.updated_at desc nulls last, movie.id
    limit 240
  ), hidden_candidates as materialized (
    select movie.*
    from recent_source_movies movie
    where not public.movie_has_usable_persisted_playback(movie.id)
      and (
        lower(coalesce(movie.seo_catalog_status, '')) = 'awaiting_playback'
        or lower(coalesce(movie.episode_current, '')) ~ '(trailer|updating|đang cập nhật|dang cap nhat)'
        or coalesce(movie.current_episode, 0) = 0
      )
    order by movie.updated_at desc nulls last, movie.id
    limit 80
  )
  insert into public.catalog_integrity_issues (
    issue_key,
    issue_type,
    movie_id,
    severity,
    confidence,
    status,
    evidence,
    first_detected_at,
    last_detected_at
  )
  select
    'published_without_playback:' || movie.id::text,
    'published_without_playback',
    movie.id,
    5,
    1,
    'open',
    jsonb_build_object(
      'detector', 'unified_provider_brain',
      'source_site', movie.source_site,
      'advertised', greatest(coalesce(movie.current_episode, 0), coalesce(movie.total_episodes, 0)),
      'unified_contract', 'four_provider_brain_v1'
    ),
    now(),
    now()
  from hidden_candidates movie
  on conflict on constraint catalog_integrity_issues_pkey do update
  set last_detected_at = now(),
      severity = greatest(public.catalog_integrity_issues.severity, excluded.severity),
      evidence = public.catalog_integrity_issues.evidence || excluded.evidence,
      status = case
        when public.catalog_integrity_issues.status = 'resolved' then 'open'
        else public.catalog_integrity_issues.status
      end,
      resolved_at = case
        when public.catalog_integrity_issues.status = 'resolved' then null
        else public.catalog_integrity_issues.resolved_at
      end;

  return query
  with candidates as materialized (
    select issue.issue_key
    from public.catalog_integrity_issues issue
    join public.movies movie on movie.id = issue.movie_id
    where issue.status = 'open'
      and issue.issue_type in (
        'published_without_playback',
        'episode_count_mismatch',
        'episode_sequence_gap'
      )
      and movie.slug ~ '^[a-z0-9][a-z0-9-]{1,180}$'
      and lower(coalesce(movie.seo_catalog_status, '')) not in ('hidden', 'draft', 'superseded')
      and coalesce(
        nullif(issue.evidence->>'unified_next_attempt_at', '')::timestamptz,
        '-infinity'::timestamptz
      ) <= now()
    order by issue.severity desc, issue.first_detected_at, issue.issue_key
    for update of issue skip locked
    limit greatest(1, least(coalesce(p_limit, 2), 4))
  ), claimed as (
    update public.catalog_integrity_issues issue
    set status = 'repairing',
        attempts = issue.attempts + 1,
        last_error = null,
        evidence = issue.evidence || jsonb_build_object(
          'unified_claimed_at', now(),
          'unified_contract', 'four_provider_brain_v1'
        )
    from candidates candidate
    where issue.issue_key = candidate.issue_key
    returning issue.issue_key,
              issue.issue_type,
              issue.movie_id,
              issue.attempts,
              issue.evidence
  )
  select claimed.issue_key,
         claimed.issue_type,
         movie.id,
         movie.slug,
         movie.source_site,
         movie.source_name,
         movie.current_episode,
         movie.total_episodes,
         claimed.attempts,
         claimed.evidence
  from claimed
  join public.movies movie on movie.id = claimed.movie_id
  order by claimed.issue_key;
end;
$$;

revoke all on function public.claim_unified_provider_repairs(integer)
  from public, anon, authenticated;
grant execute on function public.claim_unified_provider_repairs(integer)
  to service_role;

comment on function public.claim_unified_provider_repairs(integer) is
  'Claims bounded playback repair work for the single OPhim/KKPhim/VSMOV/NguonC orchestrator using SKIP LOCKED and a persistent provider cursor.';

insert into public.runtime_capacity_managed_jobs (job_name)
values ('unified-provider-brain-every-30-minutes')
on conflict (job_name) do update
set paused_by_capacity_guard = false,
    paused_at = null,
    updated_at = now();

do $scheduler$
declare
  should_pause boolean := false;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  -- Deactivate rather than delete the old schedules so the cutover is
  -- reversible and their execution history remains inspectable.
  perform cron.alter_job(jobid, active := false)
  from cron.job
  where jobname in (
    'dispatch-catalog-source-repairs-every-2-minutes',
    'dispatch-catalog-source-repairs-peak-guard',
    'sync-gap-playback-providers-offpeak'
  );

  -- These jobs may have been marked as capacity-paused before this migration.
  -- Clear that marker so the capacity controller cannot resurrect them when
  -- the database returns from protect mode.
  update public.runtime_capacity_managed_jobs
  set paused_by_capacity_guard = false,
      paused_at = null,
      updated_at = now()
  where job_name in (
    'dispatch-catalog-source-repairs-every-2-minutes',
    'dispatch-catalog-source-repairs-peak-guard',
    'sync-gap-playback-providers-offpeak'
  );

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'unified-provider-brain-every-30-minutes';

  perform cron.schedule(
    'unified-provider-brain-every-30-minutes',
    '13,43 * * * *',
    $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/unified-provider-brain?limit=2&provider_budget=2',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret
           from vault.decrypted_secrets
           where name = 'CRON_SECRET'
           order by created_at desc
           limit 1)
        ),
        timeout_milliseconds := 120000
      );
    $cmd$
  );

  select exists (
    select 1
    from public.runtime_capacity_state
    where singleton = true and mode = 'protect'
  ) into should_pause;

  if should_pause then
    perform cron.alter_job(jobid, active := false)
    from cron.job
    where jobname = 'unified-provider-brain-every-30-minutes';

    update public.runtime_capacity_managed_jobs
    set paused_by_capacity_guard = true,
        paused_at = now(),
        updated_at = now()
    where job_name = 'unified-provider-brain-every-30-minutes';
  end if;
end;
$scheduler$;
