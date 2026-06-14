create extension if not exists pg_trgm with schema extensions;

create index if not exists movies_search_blob_trgm_idx
  on public.movies using gin (
    (
      lower(
        coalesce(name, '') || ' ' ||
        coalesce(origin_name, '') || ' ' ||
        coalesce(title_vi, '') || ' ' ||
        coalesce(title_en, '') || ' ' ||
        coalesce(title_zh, '') || ' ' ||
        coalesce(title_original, '') || ' ' ||
        coalesce(normalized_name, '') || ' ' ||
        coalesce(slug, '') || ' ' ||
        coalesce(episode_current, '') || ' ' ||
        coalesce(episode_total, '')
      )
    ) gin_trgm_ops
  )
  where is_published = true;

create or replace function public.search_movies_fast(
  search_query text,
  result_limit integer default 36
)
returns table (
  id uuid,
  slug text,
  name text,
  origin_name text,
  title_vi text,
  title_en text,
  title_zh text,
  title_original text,
  normalized_name text,
  thumb_url text,
  poster_url text,
  type text,
  year integer,
  quality text,
  lang text,
  episode_current text,
  episode_total text,
  current_episode integer,
  total_episodes integer,
  schedule_type text,
  release_time text,
  release_day integer,
  schedule_timezone text,
  category jsonb,
  country jsonb,
  is_published boolean,
  updated_at timestamptz,
  ophim_id text,
  tmdb_id bigint,
  source_site text,
  source_name text,
  release_at timestamptz,
  next_episode_at timestamptz,
  next_episode_name text,
  schedule_note text,
  search_score numeric
)
language sql
stable
set search_path = public, extensions
as $$
  with params as (
    select
      lower(trim(coalesce(search_query, ''))) as raw_query,
      trim(regexp_replace(regexp_replace(lower(trim(coalesce(search_query, ''))), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')) as token_query,
      replace(trim(regexp_replace(regexp_replace(lower(trim(coalesce(search_query, ''))), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')), ' ', '-') as slug_query,
      least(greatest(coalesce(result_limit, 36), 1), 100) as limit_value
  ),
  query_parts as (
    select
      raw_query,
      token_query,
      slug_query,
      limit_value,
      nullif((regexp_match(token_query, '(^| )(season|ss|phan|mua|part|s) *([0-9]{1,2})( |$)'))[3], '') as wanted_season
    from params
  ),
  candidates as (
    select
      m.*,
      trim(regexp_replace(regexp_replace(lower(
          coalesce(m.name, '') || ' ' ||
          coalesce(m.origin_name, '') || ' ' ||
          coalesce(m.title_vi, '') || ' ' ||
          coalesce(m.title_en, '') || ' ' ||
          coalesce(m.title_zh, '') || ' ' ||
          coalesce(m.title_original, '') || ' ' ||
          coalesce(m.normalized_name, '') || ' ' ||
          coalesce(m.slug, '') || ' ' ||
          coalesce(m.episode_current, '') || ' ' ||
          coalesce(m.episode_total, '')
        ), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')) as search_blob,
      qp.raw_query,
      qp.token_query,
      qp.slug_query,
      qp.wanted_season,
      qp.limit_value
    from public.movies m
    cross join query_parts qp
    where
      m.is_published = true
      and qp.raw_query <> ''
      and (
        lower(coalesce(m.slug, '')) ilike '%' || qp.slug_query || '%'
        or lower(coalesce(m.normalized_name, '')) ilike '%' || qp.token_query || '%'
        or lower(coalesce(m.normalized_name, '')) ilike '%' || qp.slug_query || '%'
        or lower(coalesce(m.name, '')) ilike '%' || qp.raw_query || '%'
        or lower(coalesce(m.origin_name, '')) ilike '%' || qp.raw_query || '%'
        or lower(coalesce(m.title_vi, '')) ilike '%' || qp.raw_query || '%'
        or lower(coalesce(m.title_en, '')) ilike '%' || qp.raw_query || '%'
        or lower(coalesce(m.title_zh, '')) ilike '%' || qp.raw_query || '%'
        or trim(regexp_replace(regexp_replace(lower(
            coalesce(m.name, '') || ' ' ||
            coalesce(m.origin_name, '') || ' ' ||
            coalesce(m.title_vi, '') || ' ' ||
            coalesce(m.title_en, '') || ' ' ||
            coalesce(m.title_zh, '') || ' ' ||
            coalesce(m.title_original, '') || ' ' ||
            coalesce(m.normalized_name, '') || ' ' ||
            coalesce(m.slug, '')
          ), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')) ilike '%' || qp.token_query || '%'
        or similarity(
          trim(regexp_replace(regexp_replace(lower(
              coalesce(m.name, '') || ' ' ||
              coalesce(m.origin_name, '') || ' ' ||
              coalesce(m.title_vi, '') || ' ' ||
              coalesce(m.title_en, '') || ' ' ||
              coalesce(m.normalized_name, '') || ' ' ||
              coalesce(m.slug, '')
            ), '[^[:alnum:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')),
          qp.token_query
        ) > 0.18
      )
  ),
  scored as (
    select
      c.*,
      nullif((regexp_match(c.search_blob, '(^| )(season|ss|phan|mua|part|s) *([0-9]{1,2})( |$)'))[3], '') as movie_season,
      (
        case when lower(coalesce(c.slug, '')) = c.slug_query then 2000 else 0 end +
        case when lower(coalesce(c.normalized_name, '')) = c.token_query then 1800 else 0 end +
        case when c.search_blob = c.token_query then 1750 else 0 end +
        case when lower(coalesce(c.name, '')) = c.raw_query then 1600 else 0 end +
        case when lower(coalesce(c.title_vi, '')) = c.raw_query then 1500 else 0 end +
        case when lower(coalesce(c.origin_name, '')) = c.raw_query then 1400 else 0 end +
        case when lower(coalesce(c.title_en, '')) = c.raw_query then 1400 else 0 end +
        case when lower(coalesce(c.slug, '')) like c.slug_query || '%' then 900 else 0 end +
        case when lower(coalesce(c.normalized_name, '')) like c.token_query || '%' then 850 else 0 end +
        case when lower(coalesce(c.name, '')) like c.raw_query || '%' then 800 else 0 end +
        case when c.search_blob like c.token_query || '%' then 780 else 0 end +
        case when c.search_blob ilike '%' || c.token_query || '%' then 650 else 0 end +
        (similarity(c.search_blob, c.token_query) * 700) +
        case when c.poster_url is not null or c.thumb_url is not null then 20 else 0 end +
        case when c.episode_current is not null and lower(c.episode_current) <> 'trailer' then 30 else 0 end
      )::numeric as base_score
    from candidates c
  )
  select
    s.id,
    s.slug,
    s.name,
    s.origin_name,
    s.title_vi,
    s.title_en,
    s.title_zh,
    s.title_original,
    s.normalized_name,
    s.thumb_url,
    s.poster_url,
    s.type,
    s.year,
    s.quality,
    s.lang,
    s.episode_current,
    s.episode_total,
    s.current_episode,
    s.total_episodes,
    s.schedule_type,
    s.release_time,
    s.release_day,
    s.schedule_timezone,
    s.category,
    s.country,
    s.is_published,
    s.updated_at,
    s.ophim_id,
    s.tmdb_id,
    s.source_site,
    s.source_name,
    s.release_at,
    s.next_episode_at,
    s.next_episode_name,
    s.schedule_note,
    (
      s.base_score +
      case
        when s.wanted_season is not null and s.movie_season = s.wanted_season then 500
        when s.wanted_season is not null and s.movie_season is not null and s.movie_season <> s.wanted_season then -350
        else 0
      end
    ) as search_score
  from scored s
  order by search_score desc, s.year desc nulls last, s.updated_at desc nulls last, s.name asc
  limit (select limit_value from query_parts);
$$;

grant execute on function public.search_movies_fast(text, integer) to anon, authenticated;
