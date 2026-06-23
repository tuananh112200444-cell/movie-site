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
      public.kp_search_normalize(search_query) as token_query,
      replace(public.kp_search_normalize(search_query), ' ', '-') as slug_query,
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
  candidate_rows as (
    select * from (
      select m.*
      from public.movies m, query_parts qp
      where m.is_published = true
        and qp.token_query <> ''
        and lower(coalesce(m.slug, '')) ilike '%' || qp.slug_query || '%'
      order by m.updated_at desc nulls last
      limit 180
    ) slug_matches
    union all
    select * from (
      select m.*
      from public.movies m, query_parts qp
      where m.is_published = true
        and qp.token_query <> ''
        and (
          lower(coalesce(m.normalized_name, '')) ilike '%' || qp.token_query || '%'
          or lower(coalesce(m.normalized_name, '')) ilike '%' || qp.slug_query || '%'
        )
      order by m.updated_at desc nulls last
      limit 180
    ) normalized_matches
    union all
    select * from (
      select m.*
      from public.movies m, query_parts qp
      where m.is_published = true
        and qp.raw_query <> ''
        and (
          lower(coalesce(m.name, '')) ilike '%' || qp.raw_query || '%'
          or lower(coalesce(m.origin_name, '')) ilike '%' || qp.raw_query || '%'
          or lower(coalesce(m.title_vi, '')) ilike '%' || qp.raw_query || '%'
          or lower(coalesce(m.title_en, '')) ilike '%' || qp.raw_query || '%'
          or lower(coalesce(m.title_zh, '')) ilike '%' || qp.raw_query || '%'
        )
      order by m.updated_at desc nulls last
      limit 180
    ) raw_title_matches
    union all
    select * from (
      select m.*
      from public.movies m, query_parts qp
      where m.is_published = true
        and qp.token_query <> ''
        and public.kp_search_normalize(
          coalesce(m.name, '') || ' ' ||
          coalesce(m.origin_name, '') || ' ' ||
          coalesce(m.title_vi, '') || ' ' ||
          coalesce(m.title_en, '') || ' ' ||
          coalesce(m.title_zh, '') || ' ' ||
          coalesce(m.title_original, '') || ' ' ||
          coalesce(m.normalized_name, '') || ' ' ||
          coalesce(m.slug, '') || ' ' ||
          coalesce(m.source_name, '') || ' ' ||
          coalesce(m.source_site, '')
        ) ilike '%' || qp.token_query || '%'
      order by m.updated_at desc nulls last
      limit 180
    ) normalized_blob_matches
  ),
  candidates as (
    select distinct on (m.id)
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
      public.kp_search_normalize(m.name) as normalized_title_name,
      public.kp_search_normalize(m.title_vi) as normalized_title_vi,
      public.kp_search_normalize(m.origin_name) as normalized_origin_name,
      public.kp_search_normalize(m.title_en) as normalized_title_en,
      public.kp_search_normalize(m.title_original) as normalized_title_original,
      public.kp_search_normalize(coalesce(m.normalized_name, '')) as normalized_name_clean,
      replace(public.kp_search_normalize(coalesce(m.slug, '')), ' ', '-') as slug_clean,
      qp.raw_query,
      qp.token_query,
      qp.slug_query,
      qp.wanted_season,
      qp.limit_value
    from candidate_rows m
    cross join query_parts qp
    order by m.id, m.updated_at desc nulls last
  ),
  scored as (
    select
      c.*,
      nullif((regexp_match(c.search_blob, '(^| )(season|ss|phan|mua|part|s) *([0-9]{1,2})( |$)'))[3], '') as movie_season,
      (
        case when c.normalized_title_name = c.token_query then 2600 else 0 end +
        case when c.normalized_title_vi = c.token_query then 2500 else 0 end +
        case when c.normalized_origin_name = c.token_query then 2300 else 0 end +
        case when c.normalized_title_en = c.token_query then 2300 else 0 end +
        case when c.slug_clean = c.slug_query then 2100 else 0 end +
        case when c.normalized_name_clean = c.token_query then 2000 else 0 end +
        case when lower(coalesce(c.slug, '')) = c.slug_query then 1800 else 0 end +
        case when lower(coalesce(c.normalized_name, '')) = c.token_query then 1700 else 0 end +
        case when c.search_blob = c.token_query then 1600 else 0 end +
        case when lower(coalesce(c.name, '')) = c.raw_query then 1500 else 0 end +
        case when lower(coalesce(c.title_vi, '')) = c.raw_query then 1400 else 0 end +
        case when lower(coalesce(c.origin_name, '')) = c.raw_query then 1300 else 0 end +
        case when lower(coalesce(c.title_en, '')) = c.raw_query then 1300 else 0 end +
        case when c.normalized_title_name like c.token_query || '%' then 900 else 0 end +
        case when lower(coalesce(c.slug, '')) like c.slug_query || '%' then 850 else 0 end +
        case when lower(coalesce(c.normalized_name, '')) like c.token_query || '%' then 800 else 0 end +
        case when lower(coalesce(c.name, '')) like c.raw_query || '%' then 760 else 0 end +
        case when c.search_blob like c.token_query || '%' then 720 else 0 end +
        case when c.search_blob ilike '%' || c.token_query || '%' then 620 else 0 end +
        (similarity(c.normalized_title_name, c.token_query) * 700) +
        (similarity(c.search_blob, c.token_query) * 500) +
        case when c.poster_url is not null or c.thumb_url is not null then 20 else 0 end +
        case when c.episode_current is not null and lower(c.episode_current) <> 'trailer' then 30 else 0 end +
        case when lower(coalesce(c.source_site, '')) in ('blvietsub', 'admin-queer') then 15 else 0 end
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
