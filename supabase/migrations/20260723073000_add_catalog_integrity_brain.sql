-- Catalogue integrity is a separate, conservative brain:
-- * detect issues in bounded batches;
-- * never delete or merge movies automatically;
-- * enqueue lifecycle/SEO reconciliation through the existing queue;
-- * leave ambiguous duplicate groups for evidence-backed review.

create table if not exists public.catalog_integrity_issues (
  issue_key text primary key,
  issue_type text not null,
  movie_id uuid references public.movies(id) on delete cascade,
  related_movie_id uuid references public.movies(id) on delete set null,
  severity smallint not null default 1 check (severity between 1 and 5),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  status text not null default 'open' check (status in ('open', 'repairing', 'resolved', 'ignored')),
  evidence jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create index if not exists catalog_integrity_open_priority_idx
  on public.catalog_integrity_issues (severity desc, last_detected_at desc)
  where status = 'open';

create index if not exists catalog_integrity_movie_idx
  on public.catalog_integrity_issues (movie_id, status, issue_type);

alter table public.catalog_integrity_issues enable row level security;
revoke all on table public.catalog_integrity_issues from public, anon, authenticated;
grant select, insert, update, delete on table public.catalog_integrity_issues to service_role;

create or replace function public.scan_catalog_integrity(p_batch_size integer default 1500)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch_size integer := greatest(100, least(coalesce(p_batch_size, 1500), 3000));
  scan_page integer := 1;
  scan_offset integer := 0;
  scanned integer := 0;
  detected integer := 0;
  queued integer := 0;
  next_page integer := 1;
begin
  select greatest(1, coalesce(page, 1))
  into scan_page
  from public.sync_cursors
  where key = 'catalog-integrity-scan'
  limit 1;

  scan_page := coalesce(scan_page, 1);
  scan_offset := (scan_page - 1) * batch_size;

  create temporary table scan_movies on commit drop as
  select
    m.id,
    m.slug,
    m.name,
    m.origin_name,
    m.normalized_name,
    m.year,
    m.source_site,
    m.source_name,
    m.status,
    m.trailer_url,
    m.episode_current,
    m.current_episode,
    m.total_episodes,
    m.thumb_url,
    m.poster_url,
    m.seo_catalog_status,
    m.updated_at
  from public.movies m
  where m.is_published is true
  order by m.id
  offset scan_offset
  limit batch_size;

  get diagnostics scanned = row_count;
  if scanned = 0 and scan_page > 1 then
    scan_page := 1;
    scan_offset := 0;
    truncate scan_movies;
    insert into scan_movies
    select
      m.id, m.slug, m.name, m.origin_name, m.normalized_name, m.year,
      m.source_site, m.source_name, m.status, m.trailer_url,
      m.episode_current, m.current_episode,
      m.total_episodes, m.thumb_url, m.poster_url, m.seo_catalog_status,
      m.updated_at
    from public.movies m
    where m.is_published is true
    order by m.id
    limit batch_size;
    get diagnostics scanned = row_count;
  end if;

  create index on scan_movies(id);

  create temporary table scan_coverage on commit drop as
  select
    movie_id,
    count(distinct episode_number) filter (where episode_number > 0) as numbered_episodes,
    max(episode_number) filter (where episode_number between 1 and 5000) as max_episode
  from (
    select e.movie_id, e.episode_number
    from public.movie_episodes e
    join scan_movies m on m.id = e.movie_id
    where coalesce(e.link_m3u8, '') <> '' or coalesce(e.link_embed, '') <> ''
    union all
    select e.movie_id, e.episode_number
    from public.episodes e
    join scan_movies m on m.id = e.movie_id
    where coalesce(e.link_m3u8, '') <> '' or coalesce(e.link_embed, '') <> ''
  ) playable
  group by movie_id;

  create temporary table detected_issues (
    issue_key text primary key,
    issue_type text not null,
    movie_id uuid,
    severity smallint,
    confidence numeric(5,4),
    evidence jsonb
  ) on commit drop;

  insert into detected_issues
  select
    'published_without_playback:' || m.id,
    'published_without_playback',
    m.id,
    5,
    0.9900,
    jsonb_build_object(
      'slug', m.slug,
      'source_site', m.source_site,
      'episode_current', m.episode_current,
      'current_episode', m.current_episode
    )
  from scan_movies m
  where lower(coalesce(m.status, '')) not in ('upcoming', 'trailer')
    and lower(coalesce(m.episode_current, '')) !~ '(trailer|sắp chiếu|sap chieu)'
    and lower(coalesce(m.source_site, '')) <> 'tmdb-catalog'
    and coalesce(m.seo_catalog_status, '') not in ('upcoming', 'trailer')
    and not exists (
      select 1 from public.movie_episodes e
      where e.movie_id = m.id
        and (coalesce(e.link_m3u8, '') <> '' or coalesce(e.link_embed, '') <> '')
    )
    and not exists (
      select 1 from public.episodes e
      where e.movie_id = m.id
        and (coalesce(e.link_m3u8, '') <> '' or coalesce(e.link_embed, '') <> '')
    )
    and not exists (
      select 1 from public.streams s
      where s.movie_id = m.id
        and s.is_active is true
        and (coalesce(s.stream_url, '') <> '' or coalesce(s.embed_url, '') <> '')
    );

  insert into detected_issues
  select
    'episode_count_mismatch:' || m.id,
    'episode_count_mismatch',
    m.id,
    4,
    0.9700,
    jsonb_build_object(
      'slug', m.slug,
      'advertised', m.current_episode,
      'detected_max', coalesce(c.max_episode, 0),
      'detected_numbered', coalesce(c.numbered_episodes, 0),
      'source_site', m.source_site
    )
  from scan_movies m
  left join scan_coverage c on c.movie_id = m.id
  where coalesce(m.current_episode, 0) > 1
    and coalesce(c.max_episode, 0) > 0
    and coalesce(m.current_episode, 0) > coalesce(c.max_episode, 0);

  insert into detected_issues
  select
    'stale_single_episode:' || m.id,
    'stale_single_episode',
    m.id,
    2,
    0.8000,
    jsonb_build_object(
      'slug', m.slug,
      'source_site', m.source_site,
      'current_episode', m.current_episode,
      'total_episodes', m.total_episodes,
      'updated_at', m.updated_at
    )
  from scan_movies m
  where (
      lower(coalesce(m.source_site, '')) like '%blvietsub%'
      or lower(coalesce(m.source_name, '')) like '%blvietsub%'
      or lower(coalesce(m.source_site, '')) like '%glvietsub%'
    )
    and coalesce(m.current_episode, 0) <= 1
    and coalesce(m.total_episodes, 0) <= 1
    and m.updated_at < now() - interval '2 hours';

  insert into detected_issues
  select
    'missing_image:' || m.id,
    'missing_image',
    m.id,
    2,
    0.9900,
    jsonb_build_object('slug', m.slug, 'source_site', m.source_site)
  from scan_movies m
  where nullif(trim(coalesce(m.thumb_url, '')), '') is null
    and nullif(trim(coalesce(m.poster_url, '')), '') is null;

  insert into detected_issues
  select
    'duplicate_identity:' || m.id || ':' || other.id,
    'duplicate_identity',
    m.id,
    3,
    0.9000,
    jsonb_build_object(
      'slug', m.slug,
      'related_movie_id', other.id,
      'related_slug', other.slug,
      'normalized_name', m.normalized_name,
      'origin_name', m.origin_name,
      'year', m.year,
      'action', 'review_only'
    )
  from scan_movies m
  join public.movies other
    on other.is_published is true
   and other.id::text > m.id::text
   and other.year = m.year
   and lower(trim(coalesce(other.normalized_name, ''))) = lower(trim(coalesce(m.normalized_name, '')))
   and lower(trim(coalesce(other.origin_name, ''))) = lower(trim(coalesce(m.origin_name, '')))
  where m.year between 1888 and 2200
    and length(trim(coalesce(m.normalized_name, ''))) >= 6
    and length(trim(coalesce(m.origin_name, ''))) >= 3;

  insert into public.catalog_integrity_issues as target (
    issue_key, issue_type, movie_id, severity, confidence, status,
    evidence, first_detected_at, last_detected_at, resolved_at
  )
  select
    issue_key, issue_type, movie_id, severity, confidence, 'open',
    evidence, now(), now(), null
  from detected_issues
  on conflict (issue_key) do update set
    severity = excluded.severity,
    confidence = excluded.confidence,
    status = case when target.status = 'ignored' then 'ignored' else 'open' end,
    evidence = excluded.evidence,
    last_detected_at = now(),
    resolved_at = null;

  get diagnostics detected = row_count;

  update public.catalog_integrity_issues issue
  set status = 'resolved',
      resolved_at = now(),
      last_detected_at = now()
  where issue.movie_id in (select id from scan_movies)
    and issue.issue_type in (
      'published_without_playback',
      'episode_count_mismatch',
      'stale_single_episode',
      'missing_image',
      'duplicate_identity'
    )
    and issue.status in ('open', 'repairing')
    and not exists (
      select 1 from detected_issues current_issue
      where current_issue.issue_key = issue.issue_key
    );

  insert into public.movie_refresh_queue as queue (
    movie_id, requested_at, next_attempt_at, reasons
  )
  select
    d.movie_id,
    now(),
    now(),
    array['catalog_integrity:' || d.issue_type]
  from detected_issues d
  where d.issue_type in ('published_without_playback', 'episode_count_mismatch', 'missing_image')
  on conflict (movie_id) do update set
    requested_at = excluded.requested_at,
    next_attempt_at = least(queue.next_attempt_at, now()),
    reasons = (
      select array_agg(distinct reason)
      from unnest(queue.reasons || excluded.reasons) reason
    );

  get diagnostics queued = row_count;

  next_page := case when scanned < batch_size then 1 else scan_page + 1 end;
  insert into public.sync_cursors(key, page, updated_at)
  values ('catalog-integrity-scan', next_page, now())
  on conflict (key) do update
  set page = excluded.page,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'scanned', scanned,
    'page', scan_page,
    'next_page', next_page,
    'detected', detected,
    'queued', queued
  );
end;
$$;

revoke all on function public.scan_catalog_integrity(integer) from public, anon, authenticated;
grant execute on function public.scan_catalog_integrity(integer) to service_role;

create or replace function public.catalog_integrity_summary()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'open_total', count(*) filter (where status = 'open'),
    'critical', count(*) filter (where status = 'open' and severity >= 4),
    'by_type', coalesce(
      (
        select jsonb_object_agg(issue_type, issue_count)
        from (
          select issue_type, count(*) as issue_count
          from public.catalog_integrity_issues
          where status = 'open'
          group by issue_type
        ) grouped
      ),
      '{}'::jsonb
    ),
    'oldest_open', min(first_detected_at) filter (where status = 'open'),
    'last_scan', (
      select updated_at
      from public.sync_cursors
      where key = 'catalog-integrity-scan'
    )
  )
  from public.catalog_integrity_issues;
$$;

revoke all on function public.catalog_integrity_summary() from public, anon, authenticated;
grant execute on function public.catalog_integrity_summary() to service_role;

do $scheduler$
declare
  cobe_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- The current CobePhim discovery endpoint returns zero URLs on every run.
    -- Pause the connector instead of spending a database/function slot twice
    -- an hour while falsely logging successful ingestion.
    select jobid into cobe_job_id
    from cron.job
    where jobname = 'sync-cobephim-backup-every-10-minutes'
    limit 1;
    if cobe_job_id is not null then
      perform cron.alter_job(cobe_job_id, active := false);
    end if;

    if exists (select 1 from cron.job where jobname = 'scan-catalog-integrity-every-10-minutes') then
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'scan-catalog-integrity-every-10-minutes';
    end if;

    perform cron.schedule(
      'scan-catalog-integrity-every-10-minutes',
      '0,10,20,30,40,50 * * * *',
      $cmd$select public.scan_catalog_integrity(1500);$cmd$
    );
  end if;
end;
$scheduler$;

-- Seed the first bounded batch without blocking migration deployment.
select public.scan_catalog_integrity(1500);

comment on table public.catalog_integrity_issues is
  'Conservative catalogue issue queue. Detection and lifecycle reconciliation are automatic; ambiguous merges remain review-only.';
