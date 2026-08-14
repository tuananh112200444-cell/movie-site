-- Keep provider coverage refreshes compatible with the table's NOT NULL
-- invariant when a movie/provider pair has no pre-existing coverage row.
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
    case
      when coalesce(aggregate.playable_stream_count, 0) > 0 then ''
      else coalesce(coverage.last_error, '')
    end,
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
