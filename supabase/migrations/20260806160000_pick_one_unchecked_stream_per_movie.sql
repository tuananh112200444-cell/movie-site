-- Return a bounded, fair health-check batch: one unchecked stream for each
-- candidate movie. Applying LIMIT to streams before this grouping lets a long
-- series monopolise every run and starves other films.
create or replace function public.pick_unchecked_stream_health_candidates(
  p_movie_ids uuid[],
  p_limit integer default 80
)
returns setof public.streams
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with per_movie as (
    select distinct on (stream.movie_id)
      stream.*
    from public.streams stream
    where stream.movie_id = any(p_movie_ids)
      and stream.is_active = true
      and stream.health_status = 'unchecked'
      and (coalesce(stream.stream_url, '') <> '' or coalesce(stream.embed_url, '') <> '')
    order by
      stream.movie_id,
      stream.priority desc nulls last,
      stream.updated_at desc nulls last,
      stream.id
  )
  select *
  from per_movie
  order by priority desc nulls last, updated_at desc nulls last, id
  limit greatest(1, least(coalesce(p_limit, 80), 150));
$function$;

revoke all on function public.pick_unchecked_stream_health_candidates(uuid[], integer) from public;
grant execute on function public.pick_unchecked_stream_health_candidates(uuid[], integer) to service_role;
