-- Ensure legacy backfill makes monotonic progress. Non-target providers are
-- allowed to keep a null provider_key after receiving a playback score and
-- must not be selected again forever.

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

  return jsonb_build_object(
    'success', true,
    'rows', affected,
    'movies', cardinality(affected_movies),
    'checked_at', now()
  );
end;
$$;

revoke all on function public.backfill_stream_playback_brain(integer) from public, anon, authenticated;
grant execute on function public.backfill_stream_playback_brain(integer) to service_role;
