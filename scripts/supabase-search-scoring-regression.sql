-- Compares installed search results to the prior exact-order contract; rolls back all helpers.
begin isolation level repeatable read; set local statement_timeout='45s';
CREATE OR REPLACE FUNCTION pg_temp.incident_old_search(search_query text, result_limit integer DEFAULT 36)
 RETURNS TABLE(id uuid, slug text, name text, origin_name text, title_vi text, title_en text, title_zh text, title_original text, normalized_name text, thumb_url text, poster_url text, type text, year integer, quality text, lang text, episode_current text, episode_total text, current_episode integer, total_episodes integer, schedule_type text, release_time text, release_day integer, schedule_timezone text, category jsonb, country jsonb, is_published boolean, updated_at timestamp with time zone, ophim_id text, tmdb_id bigint, source_site text, source_name text, release_at timestamp with time zone, next_episode_at timestamp with time zone, next_episode_name text, schedule_note text, search_score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with params as (
    select
      lower(trim(coalesce(search_query, ''))) as raw_query,
      public.kp_search_normalize(search_query) as token_query,
      replace(public.kp_search_normalize(search_query), ' ', '-') as slug_query,
      regexp_split_to_array(public.kp_search_normalize(search_query), '\s+') as tokens,
      least(greatest(coalesce(result_limit, 36), 1), 100) as limit_value
  ),
  query_parts as (
    select
      p.*,
      cardinality(p.tokens) as token_count,
      (select token from unnest(p.tokens) with ordinality as words(token, position)
       order by length(token) desc, position asc limit 1) as anchor_token,
      nullif((regexp_match(p.token_query, '(^| )(season|ss|phan|mua|part|s) *([0-9]{1,2})( |$)'))[3], '') as wanted_season
    from params p
  ),
  movie_search_docs as not materialized (
    select d.movie_id as id, d.slug, d.normalized_name, d.search_blob, d.updated_at
    from public.movie_search_documents d
    where d.is_published = true
  ),
  exact_ids as (
    select distinct id
    from (
      select d.id, d.updated_at
      from movie_search_docs d cross join query_parts q
      where q.token_query <> '' and (
        d.slug ilike '%' || q.slug_query || '%' or
        d.normalized_name ilike '%' || q.token_query || '%' or
        d.search_blob ilike '%' || q.token_query || '%'
      )
      order by d.updated_at desc nulls last
      limit (select least(greatest(limit_value * 6, 80), 360) from query_parts)
    ) exact_matches
  ),
  token_ids as (
    select distinct id
    from (
      select d.id, d.updated_at
      from movie_search_docs d cross join query_parts q
      where q.token_count >= 2
        and (select count(*) from exact_ids) < q.limit_value
        and length(coalesce(q.anchor_token, '')) >= 2
        and d.search_blob ilike '%' || q.anchor_token || '%'
        and not exists (
          select 1 from unnest(q.tokens) token
          where length(token) >= 2 and d.search_blob not ilike '%' || token || '%'
        )
      order by d.updated_at desc nulls last
      limit (select least(greatest(limit_value * 8, 120), 500) from query_parts)
    ) token_matches
  ),
  candidate_ids as (
    select id from exact_ids
    union
    select id from token_ids
  ),
  candidates as (
    select
      m.id, m.slug, m.name, m.origin_name, m.title_vi, m.title_en,
      m.title_zh, m.title_original, m.normalized_name, m.thumb_url,
      m.poster_url, m.type, m.year, m.quality, m.lang, m.episode_current,
      m.episode_total, m.current_episode, m.total_episodes, m.schedule_type,
      m.release_time, m.release_day, m.schedule_timezone, m.category,
      m.country, m.is_published, m.updated_at, m.ophim_id, m.tmdb_id,
      m.source_site, m.source_name, m.release_at, m.next_episode_at,
      m.next_episode_name, m.schedule_note,
      d.search_blob,
      public.kp_search_normalize(m.name) as normalized_title_name,
      public.kp_search_normalize(m.title_vi) as normalized_title_vi,
      public.kp_search_normalize(m.origin_name) as normalized_origin_name,
      public.kp_search_normalize(m.title_en) as normalized_title_en,
      public.kp_search_normalize(m.title_original) as normalized_title_original,
      public.kp_search_normalize(coalesce(m.normalized_name, '')) as normalized_name_clean,
      replace(public.kp_search_normalize(coalesce(m.slug, '')), ' ', '-') as slug_clean,
      q.raw_query, q.token_query, q.slug_query, q.wanted_season, q.limit_value
    from candidate_ids ids
    join movie_search_docs d using (id)
    join public.movies m on m.id = ids.id and m.is_published = true
    cross join query_parts q
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
        case when c.normalized_title_name like c.token_query || '%' then 900 else 0 end +
        case when c.slug_clean like c.slug_query || '%' then 850 else 0 end +
        case when c.normalized_name_clean like c.token_query || '%' then 800 else 0 end +
        case when c.search_blob like c.token_query || '%' then 720 else 0 end +
        case when c.search_blob ilike '%' || c.token_query || '%' then 620 else 0 end +
        (similarity(c.normalized_title_name, c.token_query) * 700) +
        (similarity(c.search_blob, c.token_query) * 500) +
        case when c.poster_url is not null or c.thumb_url is not null then 20 else 0 end +
        case when c.episode_current is not null and lower(c.episode_current) <> 'trailer' then 30 else 0 end
      )::numeric as base_score
    from candidates c
  )
  select
    s.id, s.slug, s.name, s.origin_name, s.title_vi, s.title_en, s.title_zh,
    s.title_original, s.normalized_name, s.thumb_url, s.poster_url, s.type,
    s.year, s.quality, s.lang, s.episode_current, s.episode_total,
    s.current_episode, s.total_episodes, s.schedule_type, s.release_time,
    s.release_day, s.schedule_timezone, s.category, s.country, s.is_published,
    s.updated_at, s.ophim_id, s.tmdb_id, s.source_site, s.source_name,
    s.release_at, s.next_episode_at, s.next_episode_name, s.schedule_note,
    (s.base_score + case
      when s.wanted_season is not null and s.movie_season = s.wanted_season then 500
      when s.wanted_season is not null and s.movie_season is not null and s.movie_season <> s.wanted_season then -350
      else 0
    end)::numeric as search_score
  from scored s
  order by search_score desc, s.year desc nulls last, s.updated_at desc nulls last, s.name asc
  limit (select limit_value from query_parts);
$function$
;
do $load$ begin execute replace(pg_get_functiondef('public.search_movies_fast(text,integer)'::regprocedure),'public.search_movies_fast(', 'pg_temp.incident_new_search(');end;$load$;
create temp table incident_search_bench(q text,version text,ms numeric);
do $test$ declare q text;a jsonb;b jsonb;v text;p jsonb;begin
 foreach q in array array['conan','hope','one piece','harry potter','phim hay','xyznotfound123'] loop
  select jsonb_agg(to_jsonb(r)) into a from pg_temp.incident_old_search(q,36) r;
  select jsonb_agg(to_jsonb(r)) into b from pg_temp.incident_new_search(q,36) r;
  if a is distinct from b then raise exception 'Search mismatch %',q;end if;
  foreach v in array array['old','new'] loop
   execute format('explain(analyze,buffers,format json) select * from pg_temp.incident_%s_search(%L,36)',v,q) into p;
   insert into incident_search_bench values(q,v,(p->0->>'Execution Time')::numeric);
  end loop;
 end loop;
end; $test$;
select jsonb_agg(t) results from incident_search_bench t;rollback;
