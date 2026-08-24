create or replace function public.get_tmdb_metadata_enrichment_candidates(p_limit integer default 15)
returns setof public.movies
language sql
security definer
set search_path = public, pg_temp
as $$
  select m.*
  from public.movies m
  left join public.movie_tmdb_enrichment_status s on s.movie_id = m.id
  left join public.movie_seo_quality_status q on q.movie_id = m.id
  where m.is_published is true
    and (
      m.tmdb_id is null
      or length(trim(regexp_replace(coalesce(m.content, ''), '<[^>]+>', ' ', 'g'))) < 80
      or coalesce(array_length(m.actor, 1), 0) = 0
      or coalesce(array_length(m.director, 1), 0) = 0
      or coalesce(jsonb_array_length(m.category), 0) = 0
      or coalesce(jsonb_array_length(m.country), 0) = 0
      or (length(trim(coalesce(m.poster_url, ''))) = 0 and length(trim(coalesce(m.thumb_url, ''))) = 0)
      or (
        (coalesce(m.source_site, '') ilike '%blvietsub%'
          or coalesce(m.source_name, '') ilike '%blvietsub%'
          or coalesce(m.source_site, '') ilike '%glvietsub%'
          or coalesce(m.source_name, '') ilike '%glvietsub%')
        and (
          length(trim(coalesce(m.title_en, ''))) = 0
          or lower(trim(m.title_en)) = lower(trim(coalesce(nullif(m.title_vi, ''), m.name, '')))
        )
      )
    )
    and (
      s.movie_id is null
      or (s.status in ('enriched', 'verified_no_change') and m.updated_at > s.attempted_at)
      or (s.status = 'retryable_error' and s.attempted_at < now() - interval '6 hours')
      or (s.status = 'skipped_identity' and s.attempted_at < now() - interval '30 days')
    )
  order by
    case when (coalesce(m.source_site, '') ilike '%blvietsub%'
      or coalesce(m.source_name, '') ilike '%blvietsub%'
      or coalesce(m.source_site, '') ilike '%glvietsub%'
      or coalesce(m.source_name, '') ilike '%glvietsub%') then 0 else 1 end,
    coalesce(q.eligible_for_index, false) desc,
    case when m.tmdb_id is null then 0 else 1 end,
    m.updated_at desc nulls last,
    m.id
  limit greatest(1, least(coalesce(p_limit, 15), 15));
$$;

revoke all on function public.get_tmdb_metadata_enrichment_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_tmdb_metadata_enrichment_candidates(integer) to service_role;

delete from public.movie_tmdb_enrichment_status s
using public.movies m
where m.id = s.movie_id
  and (coalesce(m.source_site, '') ilike '%blvietsub%'
    or coalesce(m.source_name, '') ilike '%blvietsub%'
    or coalesce(m.source_site, '') ilike '%glvietsub%'
    or coalesce(m.source_name, '') ilike '%glvietsub%')
  and (
    length(trim(coalesce(m.title_en, ''))) = 0
    or lower(trim(m.title_en)) = lower(trim(coalesce(nullif(m.title_vi, ''), m.name, '')))
  );

comment on function public.get_tmdb_metadata_enrichment_candidates(integer) is
  'Prioritizes missing Vietnamese/English aliases for BLVietsub and GLVietsub, but the TMDB worker still requires one exact title, year and media-type match before any write.';
