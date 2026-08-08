create or replace function public.get_tmdb_metadata_enrichment_candidates(p_limit integer default 15)
returns setof public.movies
language sql
security definer
set search_path = public, pg_temp
as $$
  select m.*
  from public.movies m
  left join public.movie_tmdb_enrichment_status s on s.movie_id = m.id
  where m.is_published is true
    and m.tmdb_id is not null
    and (
      length(trim(regexp_replace(coalesce(m.content, ''), '<[^>]+>', ' ', 'g'))) < 80
      or coalesce(array_length(m.actor, 1), 0) = 0
      or coalesce(array_length(m.director, 1), 0) = 0
      or coalesce(jsonb_array_length(m.category), 0) = 0
      or coalesce(jsonb_array_length(m.country), 0) = 0
      or length(trim(coalesce(m.poster_url, m.thumb_url, ''))) = 0
    )
    and (
      s.movie_id is null
      or (s.status in ('enriched', 'verified_no_change') and m.updated_at > s.attempted_at)
      or (s.status = 'retryable_error' and s.attempted_at < now() - interval '6 hours')
      or (s.status = 'skipped_identity' and s.attempted_at < now() - interval '30 days')
    )
  order by m.updated_at asc nulls first, m.id
  limit greatest(1, least(coalesce(p_limit, 15), 15));
$$;

revoke all on function public.get_tmdb_metadata_enrichment_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_tmdb_metadata_enrichment_candidates(integer) to service_role;

comment on function public.get_tmdb_metadata_enrichment_candidates(integer) is
  'Returns the next conservative TMDB-enrichment batch without repeatedly selecting recently skipped or enriched movies.';
