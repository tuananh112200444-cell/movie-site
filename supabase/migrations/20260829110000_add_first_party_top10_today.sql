-- First-party, privacy-preserving daily watch ranking for KhoPhim.
-- A view is recorded only after 30 seconds of engaged playback. We store
-- anonymous UUIDs only: no IP address, user agent, account or device data.

begin;

create table if not exists public.movie_watch_sessions (
  playback_id uuid primary key,
  movie_id uuid not null references public.movies(id) on delete cascade,
  session_id uuid not null,
  watched_seconds integer not null default 30,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint movie_watch_sessions_watched_seconds_check
    check (watched_seconds between 30 and 21600)
);

create index if not exists movie_watch_sessions_recent_movie_idx
  on public.movie_watch_sessions (last_seen_at desc, movie_id);

create index if not exists movie_watch_sessions_session_recent_idx
  on public.movie_watch_sessions (session_id, last_seen_at desc);

alter table public.movie_watch_sessions enable row level security;
revoke all on table public.movie_watch_sessions from public, anon, authenticated;
grant all on table public.movie_watch_sessions to service_role;

create or replace function public.record_movie_watch(
  p_movie_slug text,
  p_session_id uuid,
  p_playback_id uuid,
  p_watched_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_movie_id uuid;
  affected integer := 0;
begin
  if p_session_id is null
    or p_playback_id is null
    or length(trim(coalesce(p_movie_slug, ''))) not between 1 and 180
    or coalesce(p_watched_seconds, 0) < 30
  then
    return false;
  end if;

  select m.id
    into target_movie_id
  from public.movies m
  where m.slug = trim(p_movie_slug)
    and coalesce(m.is_published, false) = true
    and m.superseded_by_movie_id is null
    and lower(coalesce(m.seo_catalog_status, 'published')) not in ('superseded', 'hidden', 'draft')
  limit 1;

  if target_movie_id is null then
    return false;
  end if;

  -- A normal viewer cannot start more than 20 meaningful plays in one hour.
  -- Existing plays are still allowed to update their watch time.
  if not exists (
    select 1
    from public.movie_watch_sessions s
    where s.playback_id = p_playback_id
      and s.session_id = p_session_id
      and s.movie_id = target_movie_id
  ) and (
    select count(*)
    from public.movie_watch_sessions s
    where s.session_id = p_session_id
      and s.started_at >= now() - interval '1 hour'
  ) >= 20 then
    return false;
  end if;

  insert into public.movie_watch_sessions as current_session (
    playback_id,
    movie_id,
    session_id,
    watched_seconds,
    started_at,
    last_seen_at
  ) values (
    p_playback_id,
    target_movie_id,
    p_session_id,
    least(21600, greatest(30, p_watched_seconds)),
    now(),
    now()
  )
  on conflict (playback_id) do update set
    watched_seconds = greatest(current_session.watched_seconds, excluded.watched_seconds),
    last_seen_at = now()
  where current_session.session_id = excluded.session_id
    and current_session.movie_id = excluded.movie_id;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.record_movie_watch(text, uuid, uuid, integer) from public;
grant execute on function public.record_movie_watch(text, uuid, uuid, integer) to anon, authenticated;

create or replace function public.get_top10_movies_today(p_limit integer default 10)
returns table (
  item jsonb,
  rank integer,
  viewers_today bigint,
  watch_seconds_today bigint,
  score double precision,
  signal_source text
)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.get_top10_movies_today(integer) from public;
grant execute on function public.get_top10_movies_today(integer) to anon, authenticated;

create or replace function public.cleanup_movie_watch_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer := 0;
begin
  delete from public.movie_watch_sessions
  where last_seen_at < now() - interval '8 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.cleanup_movie_watch_sessions() from public, anon, authenticated;
grant execute on function public.cleanup_movie_watch_sessions() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-movie-watch-sessions-daily';

    perform cron.schedule(
      'cleanup-movie-watch-sessions-daily',
      '35 20 * * *',
      $cmd$select public.cleanup_movie_watch_sessions();$cmd$
    );
  end if;
end $$;

comment on table public.movie_watch_sessions is
  'Anonymous first-party playback sessions used for daily ranking. No IP address, account, user agent or device data is stored.';

comment on function public.get_top10_movies_today(integer) is
  'Combined single/series daily Top 10. 90% is first-party viewing and momentum when available; TMDB popularity and freshness are a 10% fallback signal.';

commit;
