-- Keep the fast exact/token search as the primary path, then use the existing
-- trigram indexes only when it returns no candidate. This makes small typing
-- errors discoverable without turning every search into a catalogue scan.
create or replace function public.search_movies_smart(
  search_query text,
  result_limit integer default 36
)
returns table (
  id uuid, slug text, name text, origin_name text, title_vi text, title_en text,
  title_zh text, title_original text, normalized_name text, thumb_url text,
  poster_url text, type text, year integer, quality text, lang text,
  episode_current text, episode_total text, current_episode integer,
  total_episodes integer, schedule_type text, release_time text,
  release_day integer, schedule_timezone text, category jsonb, country jsonb,
  is_published boolean, updated_at timestamptz, ophim_id text, tmdb_id bigint,
  source_site text, source_name text, release_at timestamptz,
  next_episode_at timestamptz, next_episode_name text, schedule_note text,
  search_score numeric
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with params as (
    select
      public.kp_search_normalize(search_query) as token_query,
      replace(public.kp_search_normalize(search_query), ' ', '-') as slug_query,
      least(greatest(coalesce(result_limit, 36), 1), 100) as limit_value
  ),
  exact_rows as materialized (
    select *
    from public.search_movies_fast(search_query, (select limit_value from params))
  ),
  fuzzy_ids as materialized (
    select
      d.movie_id,
      greatest(
        similarity(d.normalized_name, p.token_query),
        similarity(d.slug, p.slug_query),
        word_similarity(p.token_query, d.search_blob)
      ) as fuzzy_score
    from public.movie_search_documents d
    cross join params p
    where d.is_published = true
      and length(p.token_query) >= 4
      and not exists (select 1 from exact_rows)
      and (
        d.normalized_name % p.token_query
        or d.slug % p.slug_query
        or d.search_blob %> p.token_query
      )
    order by fuzzy_score desc, d.updated_at desc
    limit 120
  ),
  fuzzy_rows as (
    select
      m.id, m.slug, m.name, m.origin_name, m.title_vi, m.title_en,
      m.title_zh, m.title_original, m.normalized_name, m.thumb_url,
      m.poster_url, m.type, m.year, m.quality, m.lang, m.episode_current,
      m.episode_total, m.current_episode, m.total_episodes, m.schedule_type,
      m.release_time::text as release_time, m.release_day, m.schedule_timezone, m.category,
      m.country, m.is_published, m.updated_at, m.ophim_id, m.tmdb_id,
      m.source_site, m.source_name, m.release_at, m.next_episode_at,
      m.next_episode_name, m.schedule_note,
      (
        f.fuzzy_score * 3000
        + similarity(public.kp_search_normalize(m.name), p.token_query) * 1800
        + similarity(public.kp_search_normalize(coalesce(m.title_vi, '')), p.token_query) * 1600
        + similarity(public.kp_search_normalize(coalesce(m.origin_name, '')), p.token_query) * 1400
        + case when m.poster_url is not null or m.thumb_url is not null then 20 else 0 end
        + case when m.episode_current is not null and lower(m.episode_current) <> 'trailer' then 30 else 0 end
      )::numeric as search_score
    from fuzzy_ids f
    join public.movies m on m.id = f.movie_id and m.is_published = true
    cross join params p
    order by search_score desc, m.year desc nulls last, m.updated_at desc nulls last
    limit (select limit_value from params)
  ),
  combined as (
    select e.*, 0 as source_order from exact_rows e
    union all
    select f.*, 1 as source_order from fuzzy_rows f
    where not exists (select 1 from exact_rows e where e.id = f.id)
  )
  select
    c.id, c.slug, c.name, c.origin_name, c.title_vi, c.title_en,
    c.title_zh, c.title_original, c.normalized_name, c.thumb_url,
    c.poster_url, c.type, c.year, c.quality, c.lang, c.episode_current,
    c.episode_total, c.current_episode, c.total_episodes, c.schedule_type,
    c.release_time, c.release_day, c.schedule_timezone, c.category,
    c.country, c.is_published, c.updated_at, c.ophim_id, c.tmdb_id,
    c.source_site, c.source_name, c.release_at, c.next_episode_at,
    c.next_episode_name, c.schedule_note, c.search_score
  from combined c
  order by c.source_order, c.search_score desc, c.year desc nulls last,
    c.updated_at desc nulls last, c.name asc
  limit (select least(limit_value * 2, 200) from params);
$$;

grant execute on function public.search_movies_smart(text, integer) to anon, authenticated;
