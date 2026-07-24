-- Give actively airing series their own observable SEO lifecycle.
-- This is additive: player eligibility remains based on real playable links.

alter table public.movie_seo_quality_status
  add column if not exists signals text[] not null default '{}',
  add column if not exists latest_episode_number integer not null default 0,
  add column if not exists declared_total_episodes integer not null default 0,
  add column if not exists episode_progress_percent integer not null default 0,
  add column if not exists freshness_score integer not null default 0,
  add column if not exists last_episode_change_at timestamptz,
  add column if not exists next_episode_at timestamptz;

alter table public.movie_seo_quality_status
  drop constraint if exists movie_seo_quality_index_tier_check;
alter table public.movie_seo_quality_status
  add constraint movie_seo_quality_index_tier_check
  check (index_tier in ('blocked', 'upcoming', 'ongoing', 'playable'));

alter table public.movie_seo_quality_status
  drop constraint if exists movie_seo_quality_episode_progress_check;
alter table public.movie_seo_quality_status
  add constraint movie_seo_quality_episode_progress_check
  check (episode_progress_percent between 0 and 100);

alter table public.movie_seo_quality_status
  drop constraint if exists movie_seo_quality_freshness_score_check;
alter table public.movie_seo_quality_status
  add constraint movie_seo_quality_freshness_score_check
  check (freshness_score between 0 and 100);

create index if not exists movie_seo_quality_ongoing_fresh_idx
  on public.movie_seo_quality_status
    (freshness_score desc, last_episode_change_at desc, quality_score desc)
  where eligible_for_index is true and index_tier = 'ongoing';

create or replace function public.refresh_movie_seo_quality(p_movie_id uuid)
returns public.movie_seo_quality_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.movies%rowtype;
  playable boolean := false;
  issues text[] := '{}';
  signals_value text[] := '{}';
  eligible boolean := false;
  result public.movie_seo_quality_status;
  normalized_status text;
  normalized_episode text;
  content_len integer := 0;
  current_year integer := extract(year from now())::integer;
  latest_episode integer := 0;
  declared_total integer := 0;
  progress_percent integer := 0;
  upcoming_candidate boolean := false;
  ongoing_candidate boolean := false;
  completed_candidate boolean := false;
  valid_trailer boolean := false;
  fresh_demand_signal boolean := false;
  episode_freshness timestamptz;
  previous_latest_episode integer := 0;
  previous_episode_change_at timestamptz;
  freshness integer := 0;
  tier text := 'blocked';
  score integer := 0;
begin
  select * into m from public.movies where id = p_movie_id;
  if not found then
    delete from public.movie_seo_quality_status where movie_id = p_movie_id;
    return null;
  end if;

  select coalesce(max(e.episode_number), 0)
  into latest_episode
  from (
    select greatest(coalesce(episode_number, 0)::integer, 1) as episode_number
    from public.movie_episodes
    where movie_id = p_movie_id
      and (coalesce(link_m3u8, '') ~* '^https?://' or coalesce(link_embed, '') ~* '^https?://')
    union all
    select greatest(coalesce(episode_number, 0)::integer, 1) as episode_number
    from public.episodes
    where movie_id = p_movie_id
      and (coalesce(link_m3u8, '') ~* '^https?://' or coalesce(link_embed, '') ~* '^https?://')
  ) e;

  playable := latest_episode > 0;
  declared_total := greatest(
    coalesce(m.total_episodes, 0),
    coalesce(nullif(substring(coalesce(m.episode_total, '') from '([0-9]+)'), '')::integer, 0)
  );
  progress_percent := case
    when declared_total > 0 and latest_episode > 0
      then least(100, greatest(0, round(latest_episode * 100.0 / declared_total)::integer))
    else 0
  end;

  normalized_status := lower(trim(coalesce(m.seo_catalog_status, '') || ' ' || coalesce(m.status, '')));
  normalized_episode := lower(trim(coalesce(m.episode_current, '') || ' ' || coalesce(m.current_episode::text, '')));
  content_len := length(trim(regexp_replace(coalesce(m.content, ''), '<[^>]+>', ' ', 'g')));
  valid_trailer := coalesce(m.trailer_url, '') ~* '^https?://';
  upcoming_candidate := not playable and (
    normalized_status ~ '(upcoming|trailer)'
    or normalized_episode ~ '(trailer|sap chieu)'
    or m.release_at > now()
  );
  completed_candidate := playable and (
    normalized_status ~ '(completed|complete|finished)'
    or normalized_episode ~ '(full|hoan tat|completed)'
    or (declared_total > 0 and latest_episode >= declared_total)
  );
  ongoing_candidate := playable and not completed_candidate and (
    normalized_status ~ '(ongoing|returning|in production|dang chieu)'
    or (declared_total > latest_episode and latest_episode > 0)
    or m.next_episode_at >= now() - interval '14 days'
  );
  fresh_demand_signal :=
    coalesce(m.tmdb_popularity, 0) >= 2
    or m.updated_at >= now() - interval '60 days'
    or m.release_at between now() - interval '45 days' and now() + interval '2 years';

  select coalesce(q.latest_episode_number, 0), q.last_episode_change_at
  into previous_latest_episode, previous_episode_change_at
  from public.movie_seo_quality_status q
  where q.movie_id = p_movie_id;
  episode_freshness := case
    when latest_episode > 0 and latest_episode <> coalesce(previous_latest_episode, 0) then now()
    when latest_episode > 0 then coalesce(previous_episode_change_at, m.updated_at)
    else null
  end;

  freshness := case
    when episode_freshness >= now() - interval '24 hours' then 100
    when episode_freshness >= now() - interval '3 days' then 92
    when episode_freshness >= now() - interval '7 days' then 82
    when episode_freshness >= now() - interval '14 days' then 70
    when episode_freshness >= now() - interval '30 days' then 55
    when episode_freshness >= now() - interval '90 days' then 30
    when episode_freshness is not null then 10
    else 0
  end;
  if m.next_episode_at between now() - interval '12 hours' and now() + interval '14 days' then
    freshness := least(100, freshness + 10);
  end if;

  if upcoming_candidate then signals_value := array_append(signals_value, 'upcoming'); end if;
  if ongoing_candidate then signals_value := array_append(signals_value, 'ongoing'); end if;
  if completed_candidate then signals_value := array_append(signals_value, 'completed'); end if;
  if freshness >= 90 then signals_value := array_append(signals_value, 'episode_fresh_3d');
  elsif freshness >= 70 then signals_value := array_append(signals_value, 'episode_fresh_14d');
  elsif ongoing_candidate and freshness <= 30 then signals_value := array_append(signals_value, 'stale_ongoing');
  end if;
  if m.next_episode_at > now() and m.next_episode_at <= now() + interval '14 days' then
    signals_value := array_append(signals_value, 'next_episode_scheduled');
  end if;
  if progress_percent between 75 and 99 then signals_value := array_append(signals_value, 'near_completion'); end if;

  if not coalesce(m.is_published, false) then issues := array_append(issues, 'not_published'); end if;
  if length(trim(coalesce(m.slug, ''))) = 0 then issues := array_append(issues, 'missing_slug'); end if;
  if length(trim(coalesce(m.name, ''))) < 2 then issues := array_append(issues, 'missing_name'); end if;
  if length(trim(coalesce(m.poster_url, m.thumb_url, ''))) = 0 then issues := array_append(issues, 'missing_image'); end if;
  if coalesce(m.year, 0) < 1888 or coalesce(m.year, 0) > current_year + 2 then issues := array_append(issues, 'invalid_year'); end if;
  if lower(coalesce(m.seo_catalog_status, 'published')) in ('superseded', 'hidden', 'draft') then
    issues := array_append(issues, 'catalog_hidden');
  end if;

  if upcoming_candidate then
    if content_len < 120 then issues := array_append(issues, 'thin_upcoming_content'); end if;
    if not valid_trailer then issues := array_append(issues, 'missing_trailer'); end if;
    if not fresh_demand_signal then issues := array_append(issues, 'stale_upcoming'); end if;
  else
    if content_len < 80 then issues := array_append(issues, 'thin_content'); end if;
    if not playable then issues := array_append(issues, 'no_playable_episode'); end if;
  end if;

  eligible := cardinality(issues) = 0 and (playable or upcoming_candidate);
  tier := case
    when eligible and upcoming_candidate then 'upcoming'
    when eligible and ongoing_candidate then 'ongoing'
    when eligible and playable then 'playable'
    else 'blocked'
  end;
  score := least(100,
    (case when coalesce(m.is_published, false) then 10 else 0 end)
    + (case when length(trim(coalesce(m.name, ''))) >= 2 then 10 else 0 end)
    + (case when length(trim(coalesce(m.poster_url, m.thumb_url, ''))) > 0 then 15 else 0 end)
    + (case when content_len >= 200 then 25 when content_len >= 120 then 20 when content_len >= 80 then 12 else 0 end)
    + (case when playable then 25 when valid_trailer then 18 else 0 end)
    + (case when ongoing_candidate then 8 when m.release_at is not null then 5 else 0 end)
    + (case when ongoing_candidate then round(freshness / 20.0)::integer else 0 end)
    + (case when coalesce(m.tmdb_popularity, 0) >= 5 then 5 else 0 end)
    + (case when coalesce(m.year, 0) between 1888 and current_year + 2 then 5 else 0 end)
  );

  insert into public.movie_seo_quality_status as q (
    movie_id, slug, eligible_for_index, reasons, has_playable_episode,
    content_length, checked_at, first_eligible_at, last_became_ineligible_at,
    movie_updated_at, index_tier, quality_score, signals,
    latest_episode_number, declared_total_episodes, episode_progress_percent,
    freshness_score, last_episode_change_at, next_episode_at
  ) values (
    m.id, m.slug, eligible, issues, playable,
    content_len, now(),
    case when eligible then now() else null end,
    case when eligible then null else now() end,
    m.updated_at, tier, score, signals_value,
    latest_episode, declared_total, progress_percent,
    freshness,
    case when latest_episode > 0 then coalesce(m.updated_at, now()) else null end,
    m.next_episode_at
  ) on conflict (movie_id) do update set
    slug = excluded.slug,
    eligible_for_index = excluded.eligible_for_index,
    reasons = excluded.reasons,
    has_playable_episode = excluded.has_playable_episode,
    content_length = excluded.content_length,
    checked_at = excluded.checked_at,
    first_eligible_at = case when excluded.eligible_for_index then coalesce(q.first_eligible_at, now()) else q.first_eligible_at end,
    last_became_ineligible_at = case when not excluded.eligible_for_index and q.eligible_for_index then now() else q.last_became_ineligible_at end,
    movie_updated_at = excluded.movie_updated_at,
    index_tier = excluded.index_tier,
    quality_score = excluded.quality_score,
    signals = excluded.signals,
    latest_episode_number = excluded.latest_episode_number,
    declared_total_episodes = excluded.declared_total_episodes,
    episode_progress_percent = excluded.episode_progress_percent,
    freshness_score = excluded.freshness_score,
    last_episode_change_at = case
      when excluded.latest_episode_number <> q.latest_episode_number then now()
      else coalesce(q.last_episode_change_at, excluded.last_episode_change_at)
    end,
    next_episode_at = excluded.next_episode_at
  returning * into result;

  return result;
end;
$$;

create or replace function public.reconcile_movie_release_state(p_movie_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  max_episode integer := 0;
  declared_total integer := 0;
begin
  select coalesce(max(e.episode_number), 0)
  into max_episode
  from (
    select greatest(coalesce(episode_number, 0)::integer, 1) as episode_number
    from public.movie_episodes
    where movie_id = p_movie_id
      and (coalesce(link_m3u8, '') ~* '^https?://' or coalesce(link_embed, '') ~* '^https?://')
    union all
    select greatest(coalesce(episode_number, 0)::integer, 1) as episode_number
    from public.episodes
    where movie_id = p_movie_id
      and (coalesce(link_m3u8, '') ~* '^https?://' or coalesce(link_embed, '') ~* '^https?://')
  ) e;

  select greatest(
    coalesce(total_episodes, 0),
    coalesce(nullif(substring(coalesce(episode_total, '') from '([0-9]+)'), '')::integer, 0)
  )
  into declared_total
  from public.movies
  where id = p_movie_id;

  if max_episode > 0 then
    update public.movies
    set
      seo_catalog_status = case
        when lower(coalesce(seo_catalog_status, '')) in ('hidden', 'draft', 'superseded') then seo_catalog_status
        else 'published'
      end,
      status = case
        when declared_total > 0 and max_episode >= declared_total then 'completed'
        when declared_total > max_episode
          or lower(coalesce(status, '')) in ('upcoming', 'trailer', 'returning series', 'in production')
          then 'ongoing'
        else status
      end,
      episode_current = case
        when declared_total > 1 and max_episode >= declared_total
          then 'Hoàn Tất (' || max_episode::text || '/' || declared_total::text || ')'
        when lower(coalesce(episode_current, '')) ~ '(trailer|sap chieu|dang cap nhat)'
          or coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::integer, 0) < max_episode
          then 'Tập ' || max_episode::text
        else episode_current
      end,
      current_episode = max_episode,
      updated_at = case
        when coalesce(current_episode, 0) <> max_episode
          or lower(coalesce(status, '')) in ('upcoming', 'trailer', 'returning series', 'in production')
          or lower(coalesce(episode_current, '')) ~ '(trailer|sap chieu|dang cap nhat)'
          or coalesce(nullif(substring(coalesce(episode_current, '') from '([0-9]+)'), '')::integer, 0) < max_episode
          then now()
        else updated_at
      end
    where id = p_movie_id
      and is_published is true;
  end if;

  perform public.refresh_movie_seo_quality(p_movie_id);
  return max_episode;
end;
$$;

create or replace function public.reconcile_movie_after_episode_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_movie_id uuid;
begin
  target_movie_id := case when tg_op = 'DELETE' then old.movie_id else new.movie_id end;
  if tg_op = 'UPDATE' and old.movie_id is distinct from new.movie_id then
    perform public.reconcile_movie_release_state(old.movie_id);
  end if;
  perform public.reconcile_movie_release_state(target_movie_id);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists refresh_movie_seo_quality_on_movie_change on public.movies;
create trigger refresh_movie_seo_quality_on_movie_change
after insert or update of
  slug, name, content, poster_url, thumb_url, trailer_url, status,
  episode_current, episode_total, current_episode, total_episodes,
  year, release_at, next_episode_at, schedule_type, release_day,
  is_published, seo_catalog_status, tmdb_popularity
on public.movies
for each row execute function public.refresh_movie_seo_quality_after_movie_change();

create or replace function public.refresh_ongoing_movie_seo_quality(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  processed integer := 0;
begin
  for item in
    select m.id
    from public.movies m
    left join public.movie_seo_quality_status q on q.movie_id = m.id
    where m.is_published is true
      and (
        lower(coalesce(m.status, '')) in ('ongoing', 'returning series', 'in production')
        or (coalesce(m.current_episode, 0) > 0 and coalesce(m.total_episodes, 0) > coalesce(m.current_episode, 0))
        or m.next_episode_at >= now() - interval '14 days'
      )
    order by q.checked_at asc nulls first, m.updated_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  loop
    -- Episode writes already run reconcile_movie_release_state immediately.
    -- The rotating cron only needs to age freshness and refresh quality; doing
    -- reconciliation here would scan the two episode tables three times.
    perform public.refresh_movie_seo_quality(item.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

revoke all on function public.refresh_ongoing_movie_seo_quality(integer) from public, anon, authenticated;
grant execute on function public.refresh_ongoing_movie_seo_quality(integer) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-ongoing-movie-seo-quality';
    perform cron.schedule(
      'refresh-ongoing-movie-seo-quality',
      '7,27,47 * * * *',
      $cmd$select public.refresh_ongoing_movie_seo_quality(200);$cmd$
    );
  end if;
end $$;

comment on column public.movie_seo_quality_status.signals is
  'Non-blocking lifecycle signals such as ongoing, fresh episode, scheduled next episode, or near completion.';
comment on column public.movie_seo_quality_status.last_episode_change_at is
  'Timestamp when the highest playable episode number last changed; metadata-only edits do not refresh it.';
comment on function public.refresh_ongoing_movie_seo_quality(integer) is
  'Rotating quality refresh for all actively airing movies; safe to run repeatedly from pg_cron.';
