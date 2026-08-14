create table if not exists public.playback_audit_state (
  key text primary key,
  status text not null default 'running' check (status in ('running', 'complete', 'paused', 'error')),
  cursor_updated_at timestamptz,
  cursor_movie_id uuid,
  snapshot_at timestamptz not null default now(),
  total_movies integer not null default 0,
  claimed_movies integer not null default 0,
  checked_streams integer not null default 0,
  ok_streams integer not null default 0,
  failed_streams integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.playback_audit_pending (
  stream_id uuid primary key references public.streams(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  attempts integer not null default 1
);

create index if not exists playback_audit_pending_claimed_at_idx
  on public.playback_audit_pending (claimed_at);

alter table public.playback_audit_state enable row level security;
alter table public.playback_audit_pending enable row level security;
revoke all on table public.playback_audit_state from public, anon, authenticated;
revoke all on table public.playback_audit_pending from public, anon, authenticated;
grant select, insert, update on table public.playback_audit_state to service_role;
grant select, insert, update, delete on table public.playback_audit_pending to service_role;

insert into public.playback_audit_state (key, status, total_movies)
values (
  'newest-first-v1',
  'running',
  (select count(*)::integer from public.movies where is_published is true)
)
on conflict (key) do update set
  status = 'running',
  total_movies = excluded.total_movies,
  completed_at = null,
  updated_at = now();

create or replace function public.claim_newest_playback_audit_batch(
  p_movie_limit integer default 20,
  p_stream_limit integer default 80
)
returns setof public.streams
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  audit public.playback_audit_state%rowtype;
  claimed_ids uuid[] := array[]::uuid[];
  last_updated_at timestamptz;
  last_movie_id uuid;
  claimed_count integer := 0;
begin
  select * into audit
  from public.playback_audit_state
  where key = 'newest-first-v1'
  for update;

  if not found or audit.status <> 'running' then return; end if;

  -- A function invocation can be interrupted after claiming but before it
  -- records results. Re-lease that exact batch instead of silently skipping it.
  if exists (
    select 1 from public.playback_audit_pending
    where claimed_at < now() - interval '3 minutes'
  ) then
    return query
    with retry as materialized (
      select pending.stream_id
      from public.playback_audit_pending pending
      where pending.claimed_at < now() - interval '3 minutes'
      order by pending.claimed_at, pending.stream_id
      limit greatest(1, least(coalesce(p_stream_limit, 80), 120))
      for update skip locked
    ), leased as (
      update public.playback_audit_pending pending
      set claimed_at = now(), attempts = pending.attempts + 1
      from retry
      where pending.stream_id = retry.stream_id
      returning pending.stream_id
    )
    select stream.*
    from public.streams stream
    join leased on leased.stream_id = stream.id;
    return;
  end if;

  select
    coalesce(array_agg(movie.id order by movie.updated_at desc nulls last, movie.id desc), array[]::uuid[]),
    min(movie.updated_at),
    (array_agg(movie.id order by movie.updated_at asc nulls first, movie.id asc))[1],
    count(*)::integer
  into claimed_ids, last_updated_at, last_movie_id, claimed_count
  from (
    select id, updated_at
    from public.movies
    where is_published is true
      and updated_at <= audit.snapshot_at
      and (
        audit.cursor_updated_at is null
        or (updated_at, id) < (audit.cursor_updated_at, audit.cursor_movie_id)
      )
    order by updated_at desc nulls last, id desc
    limit greatest(1, least(coalesce(p_movie_limit, 20), 40))
  ) movie;

  if claimed_count = 0 then
    if not exists (select 1 from public.playback_audit_pending) then
      update public.playback_audit_state
      set status = 'complete', completed_at = now(), updated_at = now()
      where key = 'newest-first-v1';
    end if;
    return;
  end if;

  update public.playback_audit_state
  set
    cursor_updated_at = last_updated_at,
    cursor_movie_id = last_movie_id,
    claimed_movies = claimed_movies + claimed_count,
    updated_at = now()
  where key = 'newest-first-v1';

  return query
  with candidate as materialized (
    select
      stream.id,
      stream.movie_id,
      coalesce(stream.provider_key, public.playback_provider_key(stream.source, stream.stream_url, stream.embed_url), 'other') as learned_provider,
      row_number() over (
        partition by stream.movie_id,
          coalesce(stream.provider_key, public.playback_provider_key(stream.source, stream.stream_url, stream.embed_url), 'other')
        order by
          -- Probe the most recent numbered episode for series. A one-shot
          -- movie naturally falls back to its full/0 source.
          coalesce(nullif(regexp_replace(coalesce(stream.episode_slug, ''), '[^0-9]', '', 'g'), ''), '0')::integer desc,
          case when regexp_replace(lower(trim(coalesce(stream.episode_slug, 'full'))), '^(tap|episode)-', '') in ('full', '0') then 0 else 1 end,
          case lower(coalesce(stream.health_status, 'unchecked')) when 'ok' then 0 when 'healthy' then 0 when 'unchecked' then 1 when 'degraded' then 2 else 3 end,
          stream.playback_score desc nulls last,
          stream.priority desc nulls last,
          stream.updated_at desc nulls last,
          stream.id
      ) as provider_rank
    from public.streams stream
    join public.movies movie on movie.id = stream.movie_id
    where stream.movie_id = any(claimed_ids)
      and stream.is_active is true
      and (nullif(trim(coalesce(stream.stream_url, '')), '') is not null or nullif(trim(coalesce(stream.embed_url, '')), '') is not null)
  ), picked as materialized (
    select candidate.id
    from candidate
    where candidate.provider_rank = 1
    order by candidate.movie_id, candidate.learned_provider
    limit greatest(1, least(coalesce(p_stream_limit, 80), 120))
  ), leased as (
    insert into public.playback_audit_pending (stream_id)
    select picked.id from picked
    on conflict (stream_id) do update
      set claimed_at = now(), attempts = public.playback_audit_pending.attempts + 1
    returning stream_id
  )
  select stream.*
  from public.streams stream
  join leased on leased.stream_id = stream.id;
end;
$$;

revoke all on function public.claim_newest_playback_audit_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_newest_playback_audit_batch(integer, integer) to service_role;

create or replace function public.record_newest_playback_audit_batch(
  p_ok_ids uuid[],
  p_failed_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  removed_ok integer := 0;
  removed_failed integer := 0;
begin
  with removed as (
    delete from public.playback_audit_pending pending
    where pending.stream_id = any(coalesce(p_ok_ids, array[]::uuid[]))
    returning pending.stream_id
  ) select count(*)::integer into removed_ok from removed;

  with removed as (
    delete from public.playback_audit_pending pending
    where pending.stream_id = any(coalesce(p_failed_ids, array[]::uuid[]))
    returning pending.stream_id
  ) select count(*)::integer into removed_failed from removed;

  update public.playback_audit_state
  set
    checked_streams = checked_streams + removed_ok + removed_failed,
    ok_streams = ok_streams + removed_ok,
    failed_streams = failed_streams + removed_failed,
    updated_at = now()
  where key = 'newest-first-v1';
end;
$$;

revoke all on function public.record_newest_playback_audit_batch(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.record_newest_playback_audit_batch(uuid[], uuid[]) to service_role;

insert into public.runtime_capacity_managed_jobs (job_name)
values
  ('playback-audit-newest-a'),
  ('playback-audit-newest-b'),
  ('playback-audit-newest-c')
on conflict (job_name) do nothing;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('playback-audit-newest-a', 'playback-audit-newest-b', 'playback-audit-newest-c');

  perform cron.schedule(
    'playback-audit-newest-a', '* * * * *',
    $cmd$select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=newest&limit=80&movie_limit=20&concurrency=10&deactivate_after=3',
      headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
      timeout_milliseconds := 90000
    );$cmd$
  );
  perform cron.schedule(
    'playback-audit-newest-b', '* * * * *',
    $cmd$select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=newest&limit=80&movie_limit=20&concurrency=10&deactivate_after=3',
      headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
      timeout_milliseconds := 90000
    );$cmd$
  );
  perform cron.schedule(
    'playback-audit-newest-c', '* * * * *',
    $cmd$select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/stream-health-check?queue=newest&limit=80&movie_limit=20&concurrency=10&deactivate_after=3',
      headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)),
      timeout_milliseconds := 90000
    );$cmd$
  );
end;
$scheduler$;

comment on table public.playback_audit_state is
  'Checkpoint for the newest-first overnight playback source audit. Real viewers continue learning exact episode quality after this baseline pass.';
