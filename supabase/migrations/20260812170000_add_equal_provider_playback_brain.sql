-- Pre-compute provider-neutral playback quality so a watch request only needs
-- to read the best stored source. Provider names never affect this score.

create or replace function public.playback_provider_key(
  p_source text,
  p_stream_url text,
  p_embed_url text
)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when lower(concat_ws(' ', p_source, p_stream_url, p_embed_url)) ~ 'streamvsmov|vsmov' then 'vsmov'
    when lower(concat_ws(' ', p_source, p_stream_url, p_embed_url)) ~ 'streamc\.xyz|nguonc' then 'nguonc'
    when lower(concat_ws(' ', p_source, p_stream_url, p_embed_url)) ~ 'phimapi|kkphim|phim1280' then 'kkphim'
    when lower(concat_ws(' ', p_source, p_stream_url, p_embed_url)) ~ 'ophim|opstream' then 'ophim'
    else null
  end
$$;

create or replace function public.calculate_playback_score(
  p_health_status text,
  p_response_time_ms integer,
  p_failure_count integer,
  p_stream_url text,
  p_embed_url text,
  p_last_error text
)
returns integer
language sql
immutable
parallel safe
as $$
  select greatest(0, least(1000,
    case lower(coalesce(p_health_status, 'unchecked'))
      when 'ok' then 700
      when 'degraded' then 540
      when 'unchecked' then 400
      when 'blocked' then case
        when lower(coalesce(p_embed_url, '')) ~ 'streamc\.xyz|player\.phimapi\.com' then 360
        else 100
      end
      when 'failed' then 100
      when 'dead' then 0
      else 300
    end
    + case
        when nullif(trim(coalesce(p_stream_url, '')), '') is not null then 100
        when nullif(trim(coalesce(p_embed_url, '')), '') is not null then 55
        else -1000
      end
    + case
        when coalesce(p_response_time_ms, 0) <= 0 then 0
        when p_response_time_ms <= 800 then 140
        when p_response_time_ms <= 1500 then 110
        when p_response_time_ms <= 3000 then 70
        when p_response_time_ms <= 5000 then 25
        when p_response_time_ms <= 8000 then -30
        else -90
      end
    - least(500, greatest(0, coalesce(p_failure_count, 0)) * 110)
    - case
        when coalesce(p_last_error, '') like 'Viewer telemetry:%' then 220
        when coalesce(p_last_error, '') like 'Provider verification pending:%' then 300
        else 0
      end
  ))::integer
$$;

alter table public.streams
  add column if not exists provider_key text,
  add column if not exists playback_score integer;

create or replace function public.set_stream_playback_brain_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  new.provider_key := public.playback_provider_key(new.source, new.stream_url, new.embed_url);
  new.playback_score := public.calculate_playback_score(
    new.health_status,
    new.response_time_ms,
    new.failure_count,
    new.stream_url,
    new.embed_url,
    new.last_error
  );
  return new;
end;
$$;

drop trigger if exists set_stream_playback_brain_fields on public.streams;
create trigger set_stream_playback_brain_fields
before insert or update of source, stream_url, embed_url, health_status, response_time_ms, failure_count, last_error
on public.streams
for each row execute function public.set_stream_playback_brain_fields();

create index if not exists streams_best_precomputed_playback_idx
  on public.streams (movie_id, episode_slug, playback_score desc, response_time_ms asc)
  where is_active = true and playback_score is not null;

create index if not exists streams_provider_coverage_idx
  on public.streams (movie_id, provider_key, playback_score desc)
  where is_active = true and provider_key is not null;

create table if not exists public.movie_provider_coverage (
  movie_id uuid not null references public.movies(id) on delete cascade,
  provider text not null check (provider in ('ophim', 'kkphim', 'vsmov', 'nguonc')),
  state text not null default 'missing' check (state in ('missing', 'pending', 'ready', 'degraded', 'unavailable', 'error')),
  episode_count integer not null default 0,
  playable_stream_count integer not null default 0,
  best_playback_score integer not null default 0,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_retry_at timestamptz,
  last_error text not null default '',
  updated_at timestamptz not null default now(),
  primary key (movie_id, provider)
);

create index if not exists movie_provider_coverage_backfill_queue_idx
  on public.movie_provider_coverage (provider, state, next_retry_at nulls first, updated_at asc);

alter table public.movie_provider_coverage enable row level security;
revoke all on table public.movie_provider_coverage from public, anon, authenticated;
grant select, insert, update, delete on table public.movie_provider_coverage to service_role;

insert into public.runtime_capacity_managed_jobs (job_name)
values
  ('refresh-playback-provider-coverage-every-10-minutes'),
  ('backfill-stream-playback-brain-offpeak')
on conflict (job_name) do nothing;

create or replace function public.refresh_movie_provider_coverage(
  p_movie_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  affected integer := 0;
begin
  with target_movies as materialized (
    select movie.id
    from public.movies movie
    where movie.is_published is true
      and (p_movie_ids is null or movie.id = any(p_movie_ids))
  ), providers(provider) as (
    values ('ophim'::text), ('kkphim'), ('vsmov'), ('nguonc')
  ), aggregate_streams as materialized (
    select
      stream.movie_id,
      stream.provider_key as provider,
      count(distinct lower(trim(coalesce(stream.episode_slug, 'full'))))::integer as episode_count,
      count(*) filter (
        where stream.is_active is true
          and stream.playback_score > 0
          and coalesce(
            nullif(trim(coalesce(stream.stream_url, '')), ''),
            nullif(trim(coalesce(stream.embed_url, '')), '')
          ) is not null
      )::integer as playable_stream_count,
      coalesce(max(stream.playback_score) filter (where stream.is_active is true), 0)::integer as best_playback_score,
      max(stream.last_success_at) as last_success_at
    from public.streams stream
    join target_movies target on target.id = stream.movie_id
    where stream.provider_key is not null
    group by stream.movie_id, stream.provider_key
  )
  insert into public.movie_provider_coverage (
    movie_id,
    provider,
    state,
    episode_count,
    playable_stream_count,
    best_playback_score,
    last_success_at,
    last_error,
    updated_at
  )
  select
    target.id,
    provider.provider,
    case
      when coalesce(aggregate.playable_stream_count, 0) = 0 then 'missing'
      when aggregate.best_playback_score >= 650 then 'ready'
      when aggregate.best_playback_score >= 300 then 'pending'
      else 'degraded'
    end,
    coalesce(aggregate.episode_count, 0),
    coalesce(aggregate.playable_stream_count, 0),
    coalesce(aggregate.best_playback_score, 0),
    aggregate.last_success_at,
    case when coalesce(aggregate.playable_stream_count, 0) > 0 then '' else coverage.last_error end,
    now()
  from target_movies target
  cross join providers provider
  left join aggregate_streams aggregate
    on aggregate.movie_id = target.id and aggregate.provider = provider.provider
  left join public.movie_provider_coverage coverage
    on coverage.movie_id = target.id and coverage.provider = provider.provider
  on conflict (movie_id, provider) do update set
    state = case
      when excluded.playable_stream_count > 0 then excluded.state
      when movie_provider_coverage.state in ('unavailable', 'error')
        and coalesce(movie_provider_coverage.next_retry_at, now()) > now()
        then movie_provider_coverage.state
      else 'missing'
    end,
    episode_count = excluded.episode_count,
    playable_stream_count = excluded.playable_stream_count,
    best_playback_score = excluded.best_playback_score,
    last_success_at = coalesce(excluded.last_success_at, movie_provider_coverage.last_success_at),
    last_error = excluded.last_error,
    updated_at = now();

  get diagnostics affected = row_count;
  return jsonb_build_object('success', true, 'rows', affected, 'checked_at', now());
end;
$$;

revoke all on function public.refresh_movie_provider_coverage(uuid[]) from public, anon, authenticated;
grant execute on function public.refresh_movie_provider_coverage(uuid[]) to service_role;

insert into public.movie_provider_coverage (movie_id, provider, state)
select movie.id, provider.provider, 'missing'
from public.movies movie
cross join (values ('ophim'::text), ('kkphim'), ('vsmov'), ('nguonc')) provider(provider)
where movie.is_published is true
on conflict (movie_id, provider) do nothing;

create or replace function public.backfill_stream_playback_brain(p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  affected integer := 0;
  affected_movies uuid[] := array[]::uuid[];
begin
  with batch as materialized (
    select stream.id
    from public.streams stream
    where stream.playback_score is null
      or (
        stream.provider_key is null
        and public.playback_provider_key(stream.source, stream.stream_url, stream.embed_url) is not null
      )
    order by stream.updated_at desc nulls last, stream.id
    limit greatest(1, least(coalesce(p_limit, 5000), 10000))
    for update skip locked
  ), updated as (
    update public.streams stream
    set provider_key = public.playback_provider_key(stream.source, stream.stream_url, stream.embed_url),
        playback_score = public.calculate_playback_score(
          stream.health_status,
          stream.response_time_ms,
          stream.failure_count,
          stream.stream_url,
          stream.embed_url,
          stream.last_error
        )
    from batch
    where stream.id = batch.id
    returning stream.movie_id
  )
  select count(*), coalesce(array_agg(distinct movie_id), array[]::uuid[])
  into affected, affected_movies
  from updated;

  if cardinality(affected_movies) > 0 then
    perform public.refresh_movie_provider_coverage(affected_movies);
  end if;

  return jsonb_build_object('success', true, 'rows', affected, 'movies', cardinality(affected_movies), 'checked_at', now());
end;
$$;

revoke all on function public.backfill_stream_playback_brain(integer) from public, anon, authenticated;
grant execute on function public.backfill_stream_playback_brain(integer) to service_role;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'refresh-playback-provider-coverage-every-10-minutes';

  perform cron.schedule(
    'refresh-playback-provider-coverage-every-10-minutes',
    '3,13,23,33,43,53 * * * *',
    $cmd$
      select public.refresh_movie_provider_coverage(
        array(
          select distinct stream.movie_id
          from public.streams stream
          where stream.updated_at >= now() - interval '20 minutes'
          limit 2000
        )
      );
    $cmd$
  );

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'backfill-stream-playback-brain-offpeak';

  perform cron.schedule(
    'backfill-stream-playback-brain-offpeak',
    '*/2 0-3,8-11,17-23 * * *',
    $cmd$select public.backfill_stream_playback_brain(5000);$cmd$
  );

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'sync-gap-playback-providers-offpeak';

  perform cron.schedule(
    'sync-gap-playback-providers-offpeak',
    '9,39 0-3,8-11,17-23 * * *',
    $cmd$
      select net.http_get(
        url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-gap-playback-providers?limit=2&scan_limit=12&cooldown_hours=24&providers=vsmov,nguonc',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 90000
      );
    $cmd$
  );
end;
$scheduler$;

comment on column public.streams.playback_score is
  'Provider-neutral, precomputed playback score derived only from measured health, latency, failures and URL readiness.';
comment on table public.movie_provider_coverage is
  'Per-movie discovery and readiness state for the equal OPhim, KKPhim, VSMOV and NguonC provider pool.';
