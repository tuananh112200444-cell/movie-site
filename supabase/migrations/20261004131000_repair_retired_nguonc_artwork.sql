-- NguonC retired phim.nguonc.com/public/images. wsrv now redirects to that
-- empty origin, which browsers reject with ERR_BLOCKED_BY_ORB. Promote already
-- verified TMDB hero artwork immediately and queue the remaining rows for the
-- strict title/year/media-type enrichment worker.

update public.movies
set
  poster_url = case
    when length(trim(coalesce(poster_url, ''))) = 0
      or poster_url ~* '^https://phim\.nguonc\.com/public/images/'
    then coalesce(nullif(trim(hero_poster_url), ''), nullif(trim(hero_backdrop_url), ''), poster_url)
    else poster_url
  end,
  thumb_url = case
    when length(trim(coalesce(thumb_url, ''))) = 0
      or thumb_url ~* '^https://phim\.nguonc\.com/public/images/'
    then coalesce(nullif(trim(hero_backdrop_url), ''), nullif(trim(hero_poster_url), ''), thumb_url)
    else thumb_url
  end,
  updated_at = now()
where is_published is true
  and (poster_url ~* '^https://phim\.nguonc\.com/public/images/'
    or thumb_url ~* '^https://phim\.nguonc\.com/public/images/')
  and (nullif(trim(hero_poster_url), '') is not null
    or nullif(trim(hero_backdrop_url), '') is not null);

delete from public.movie_tmdb_enrichment_status s
using public.movies m
where s.movie_id = m.id
  and m.is_published is true
  and (
    (length(trim(coalesce(m.poster_url, ''))) = 0
      or m.poster_url ~* '^https://phim\.nguonc\.com/public/images/')
    and (length(trim(coalesce(m.thumb_url, ''))) = 0
      or m.thumb_url ~* '^https://phim\.nguonc\.com/public/images/')
  );

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
      or ((length(trim(coalesce(m.poster_url, ''))) = 0
          or m.poster_url ~* '^https://phim\.nguonc\.com/public/images/')
        and (length(trim(coalesce(m.thumb_url, ''))) = 0
          or m.thumb_url ~* '^https://phim\.nguonc\.com/public/images/'))
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
    case when (length(trim(coalesce(m.poster_url, ''))) = 0
        or m.poster_url ~* '^https://phim\.nguonc\.com/public/images/')
      and (length(trim(coalesce(m.thumb_url, ''))) = 0
        or m.thumb_url ~* '^https://phim\.nguonc\.com/public/images/') then 0 else 1 end,
    coalesce(q.eligible_for_index, false) desc,
    case when m.tmdb_id is null then 1 else 0 end,
    m.updated_at desc nulls last,
    m.id
  limit greatest(1, least(coalesce(p_limit, 15), 15));
$$;

revoke all on function public.get_tmdb_metadata_enrichment_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_tmdb_metadata_enrichment_candidates(integer) to service_role;

comment on function public.get_tmdb_metadata_enrichment_candidates(integer) is
  'Prioritizes missing and retired NguonC artwork; the worker still requires one strict TMDB identity match before replacing images.';
