-- Aggregate viewer rankings once per two minutes instead of on every page view.
-- The scoring algorithm and public result shape remain unchanged.
begin;
set local lock_timeout='3s';
set local statement_timeout='25s';
CREATE OR REPLACE FUNCTION public.compute_top10_movies_today(p_limit integer DEFAULT 10)
 RETURNS TABLE(item jsonb, rank integer, viewers_today bigint, watch_seconds_today bigint, score double precision, signal_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '600ms'
AS $function$
  with params as (
    select
      greatest(1, least(coalesce(p_limit, 10), 10)) as wanted,
      (date_trunc('day', timezone('Asia/Ho_Chi_Minh', now())) at time zone 'Asia/Ho_Chi_Minh') as today_start,
      now() as checked_at
  ),
  watch_stats as (
    select
      s.movie_id,
      count(distinct s.session_id)::bigint as viewers_today,
      sum(s.watched_seconds)::bigint as watch_seconds_today,
      count(distinct s.session_id) filter (
        where s.last_seen_at >= greatest(p.today_start, p.checked_at - interval '2 hours')
      )::bigint as viewers_2h
    from public.movie_watch_sessions s
    cross join params p
    where s.last_seen_at >= p.today_start
      and s.last_seen_at <= p.checked_at
    group by s.movie_id
  ),
  fallback_ids as (
    select m.id
    from public.movies m
    join public.movie_seo_quality_status quality on quality.movie_id = m.id
    where coalesce(m.is_published, false) = true
      and m.superseded_by_movie_id is null
      and lower(coalesce(m.seo_catalog_status, 'published')) not in ('superseded', 'hidden', 'draft')
      and quality.has_playable_episode = true
      and quality.eligible_for_index = true
      and coalesce(nullif(trim(m.poster_url), ''), nullif(trim(m.thumb_url), '')) is not null
      and lower(coalesce(m.status, '')) not in ('trailer', 'upcoming')
      and lower(coalesce(m.episode_current, '')) not like '%trailer%'
      and coalesce(m.category::text, '') !~* '(adult|18\\+|phim 18)'
    order by coalesce(m.tmdb_popularity, 0) desc, m.updated_at desc nulls last
    limit 160
  ),
  candidate_ids as (
    select movie_id as id from watch_stats
    union
    select id from fallback_ids
  ),
  eligible as (
    select
      m.id as movie_id,
      to_jsonb(m) || jsonb_build_object(
        '_id', m.id,
        'modified', jsonb_build_object('time', m.updated_at)
      ) as item,
      lower(coalesce(m.type, 'single')) as movie_type,
      coalesce(ws.viewers_today, 0)::bigint as viewers_today,
      coalesce(ws.watch_seconds_today, 0)::bigint as watch_seconds_today,
      coalesce(ws.viewers_2h, 0)::bigint as viewers_2h,
      greatest(0, coalesce(m.tmdb_popularity, 0))::double precision as tmdb_popularity,
      coalesce(m.year, 0)::integer as release_year,
      p.today_start,
      p.checked_at
    from candidate_ids candidates
    join public.movies m on m.id = candidates.id
    join public.movie_seo_quality_status quality on quality.movie_id = m.id
    left join watch_stats ws on ws.movie_id = m.id
    cross join params p
    where coalesce(m.is_published, false) = true
      and m.superseded_by_movie_id is null
      and lower(coalesce(m.seo_catalog_status, 'published')) not in ('superseded', 'hidden', 'draft')
      and quality.has_playable_episode = true
      and quality.eligible_for_index = true
      and coalesce(nullif(trim(m.poster_url), ''), nullif(trim(m.thumb_url), '')) is not null
      and lower(coalesce(m.status, '')) not in ('trailer', 'upcoming')
      and lower(coalesce(m.episode_current, '')) not like '%trailer%'
      and coalesce(m.category::text, '') !~* '(adult|18\\+|phim 18)'
  ),
  maxima as (
    select
      greatest(1, max(viewers_today))::double precision as max_viewers,
      greatest(30, max(watch_seconds_today))::double precision as max_watch_seconds,
      greatest(1, max(tmdb_popularity))::double precision as max_popularity
    from eligible
  ),
  scored as (
    select
      e.*,
      (
        55 * (ln(1 + e.viewers_today::double precision) / ln(1 + maxima.max_viewers))
        + 20 * (ln(1 + e.watch_seconds_today::double precision) / ln(1 + maxima.max_watch_seconds))
        + 15 * case
            when e.viewers_today <= 0 then 0
            else least(
              1,
              (e.viewers_2h::double precision / greatest(1, e.viewers_today)::double precision)
              * greatest(1, extract(epoch from (e.checked_at - e.today_start)) / 7200)
            )
          end
        + 7 * (ln(1 + e.tmdb_popularity) / ln(1 + maxima.max_popularity))
        + 3 * case
            when e.release_year >= extract(year from e.checked_at)::integer then 1
            when e.release_year = extract(year from e.checked_at)::integer - 1 then 0.8
            when e.release_year >= extract(year from e.checked_at)::integer - 3 then 0.55
            else 0.2
          end
      )::double precision as ranking_score
    from eligible e
    cross join maxima
  ),
  type_balanced as (
    select
      scored.*,
      row_number() over (
        partition by case
          when movie_type in ('series', 'tvshows', 'phim-bo', 'hoathinh') then 'series'
          else 'single'
        end
        order by ranking_score desc, viewers_today desc, watch_seconds_today desc, movie_id
      ) as type_rank
    from scored
  ),
  final_ranked as (
    select
      type_balanced.*,
      row_number() over (
        order by ranking_score desc, viewers_today desc, watch_seconds_today desc, movie_id
      )::integer as final_rank
    from type_balanced
    where type_rank <= 6
  )
  select
    ranked.item,
    ranked.final_rank as rank,
    ranked.viewers_today,
    ranked.watch_seconds_today,
    ranked.ranking_score as score,
    case when ranked.viewers_today > 0 then 'first_party_views' else 'tmdb_fallback' end as signal_source
  from final_ranked ranked
  order by ranked.final_rank
  limit greatest(1, least(coalesce(p_limit, 10), 10));
$function$
;
revoke all on function public.compute_top10_movies_today(integer) from public,anon,authenticated;
grant execute on function public.compute_top10_movies_today(integer) to service_role;
create table if not exists public.movie_top10_today_cache (
 singleton boolean primary key default true check(singleton),
 viewer_date date not null,
 computed_at timestamptz not null,
 results jsonb not null check(jsonb_typeof(results)='array')
);
alter table public.movie_top10_today_cache enable row level security;
revoke all on public.movie_top10_today_cache from public,anon,authenticated;
grant select,insert,update on public.movie_top10_today_cache to service_role;
create or replace function public.refresh_top10_today_cache()
returns void language plpgsql security definer set search_path='' as $refresh$
declare payload jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('khophim:top10-today-cache',0)) then return; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.rank),'[]'::jsonb) into payload
 from public.compute_top10_movies_today(10) r;
 insert into public.movie_top10_today_cache(singleton,viewer_date,computed_at,results)
 values(true,(now() at time zone 'Asia/Ho_Chi_Minh')::date,now(),payload)
 on conflict(singleton) do update set viewer_date=excluded.viewer_date,computed_at=excluded.computed_at,results=excluded.results;
end; $refresh$;
revoke all on function public.refresh_top10_today_cache() from public,anon,authenticated;
grant execute on function public.refresh_top10_today_cache() to service_role;
select public.refresh_top10_today_cache();
create or replace function public.get_top10_movies_today(p_limit integer default 10)
returns table(item jsonb,rank integer,viewers_today bigint,watch_seconds_today bigint,score double precision,signal_source text)
language sql stable security definer set search_path='' set statement_timeout='600ms'
as $read$
 select r.item,r.rank,r.viewers_today,r.watch_seconds_today,r.score,r.signal_source
 from public.movie_top10_today_cache c
 cross join lateral jsonb_to_recordset(c.results) as r(item jsonb,rank integer,viewers_today bigint,watch_seconds_today bigint,score double precision,signal_source text)
 where c.singleton and c.viewer_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date
 order by r.rank limit greatest(1,least(coalesce(p_limit,10),10));
$read$;
select cron.schedule('refresh-top10-today-cache','1-59/2 * * * *','select public.refresh_top10_today_cache();');
commit;
