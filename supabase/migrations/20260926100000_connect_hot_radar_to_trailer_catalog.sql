-- Hot-movie discovery and catalogue ingestion used two incompatible title
-- normalizations.  Search documents store compact keys ("utlan2") while
-- kp_search_normalize returns tokenized keys ("ut lan 2"), so an exact movie
-- could be labelled missing and never reach SEO Studio.

create or replace function public.match_seo_hot_movie_candidate(
  p_source text,
  p_title text,
  p_release_year integer default null
)
returns table (
  movie_id uuid,
  slug text,
  movie_name text,
  movie_year integer,
  is_published boolean,
  match_method text,
  confidence numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  title_key text := public.kp_search_normalize(coalesce(p_title, ''));
  compact_title_key text := replace(public.kp_search_normalize(coalesce(p_title, '')), ' ', '');
  matched_rows integer := 0;
begin
  if length(compact_title_key) < 3 then
    return;
  end if;

  return query
    select
      movie.id,
      movie.slug,
      movie.name,
      movie.year,
      coalesce(movie.is_published, false),
      'alias'::text,
      1.0::numeric
    from public.seo_hot_movie_aliases alias
    join public.movies movie on movie.id = alias.movie_id
    where alias.source in (coalesce(nullif(trim(p_source), ''), '*'), '*')
      and replace(alias.normalized_external_title, ' ', '') = compact_title_key
      and movie.superseded_by_movie_id is null
    order by case when alias.source = p_source then 0 else 1 end, movie.slug
    limit 3;
  get diagnostics matched_rows = row_count;
  if matched_rows > 0 then return; end if;

  return query
    select
      movie.id,
      movie.slug,
      movie.name,
      movie.year,
      coalesce(movie.is_published, false),
      'exact'::text,
      1.0::numeric
    from public.movie_search_documents document
    join public.movies movie on movie.id = document.movie_id
    where movie.superseded_by_movie_id is null
      and replace(document.normalized_name, ' ', '') = compact_title_key
      and (
        p_release_year is null
        or movie.year is null
        or abs(movie.year - p_release_year) <= 2
      )
    order by
      coalesce(movie.is_published, false) desc,
      case when p_release_year is not null and movie.year = p_release_year then 0 else 1 end,
      movie.updated_at desc nulls last,
      movie.slug
    limit 3;
  get diagnostics matched_rows = row_count;
  if matched_rows > 0 then return; end if;

  return query
  with candidates as (
    select
      document.movie_id,
      document.slug,
      document.normalized_name,
      extensions.similarity(replace(document.normalized_name, ' ', ''), compact_title_key)::numeric as confidence
    from public.movie_search_documents document
    where document.is_published = true
      and document.normalized_name operator(extensions.%) compact_title_key
    order by extensions.similarity(replace(document.normalized_name, ' ', ''), compact_title_key) desc
    limit 24
  )
  select
    movie.id,
    movie.slug,
    movie.name,
    movie.year,
    coalesce(movie.is_published, false),
    'fuzzy'::text,
    round(candidate.confidence, 4)
  from candidates candidate
  join public.movies movie on movie.id = candidate.movie_id
  where candidate.confidence >= 0.72
    and movie.superseded_by_movie_id is null
    and (
      p_release_year is null
      or movie.year is null
      or abs(movie.year - p_release_year) <= 2
    )
  order by
    candidate.confidence desc,
    case when p_release_year is not null and movie.year = p_release_year then 0 else 1 end,
    movie.slug
  limit 3;
end;
$$;

revoke all on function public.match_seo_hot_movie_candidate(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.match_seo_hot_movie_candidate(text, text, integer)
  to service_role;

comment on function public.match_seo_hot_movie_candidate(text, text, integer) is
  'Matches hot-movie signals against compact catalogue title keys before allowing automatic trailer import.';
