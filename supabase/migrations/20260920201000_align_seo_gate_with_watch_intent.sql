-- KhoPhim treats every public movie page as a watch-intent page. Trailer and
-- raw provider-state labels are not SEO blockers; content quality, identity,
-- image, publication, and canonical catalogue state remain strict blockers.
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
  ongoing_candidate boolean := false;
  completed_candidate boolean := false;
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

  select coalesce(max(e.episode_number), 0) into latest_episode from (
    select greatest(coalesce(episode_number, 0)::integer, 1) as episode_number
    from public.movie_episodes where movie_id = p_movie_id
      and (coalesce(link_m3u8, '') ~* '^https?://' or coalesce(link_embed, '') ~* '^https?://')
    union all
    select greatest(coalesce(episode_number, 0)::integer, 1) as episode_number
    from public.episodes where movie_id = p_movie_id
      and (coalesce(link_m3u8, '') ~* '^https?://' or coalesce(link_embed, '') ~* '^https?://')
  ) e;
  playable := latest_episode > 0;
  declared_total := greatest(coalesce(m.total_episodes, 0), coalesce(nullif(substring(coalesce(m.episode_total, '') from '([0-9]+)'), '')::integer, 0));
  progress_percent := case when declared_total > 0 and latest_episode > 0 then least(100, greatest(0, round(latest_episode * 100.0 / declared_total)::integer)) else 0 end;
  normalized_status := lower(trim(coalesce(m.seo_catalog_status, '') || ' ' || coalesce(m.status, '')));
  normalized_episode := lower(trim(coalesce(m.episode_current, '') || ' ' || coalesce(m.current_episode::text, '')));
  content_len := length(trim(regexp_replace(coalesce(m.content, ''), '<[^>]+>', ' ', 'g')));
  completed_candidate := playable and (normalized_status ~ '(completed|complete|finished)' or normalized_episode ~ '(full|hoan tat|completed)' or (declared_total > 0 and latest_episode >= declared_total));
  ongoing_candidate := playable and not completed_candidate and (normalized_status ~ '(ongoing|returning|in production|dang chieu)' or (declared_total > latest_episode and latest_episode > 0) or m.next_episode_at >= now() - interval '14 days');

  select coalesce(q.latest_episode_number, 0), q.last_episode_change_at
  into previous_latest_episode, previous_episode_change_at
  from public.movie_seo_quality_status q where q.movie_id = p_movie_id;
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
  if m.next_episode_at between now() - interval '12 hours' and now() + interval '14 days' then freshness := least(100, freshness + 10); end if;
  if ongoing_candidate then signals_value := array_append(signals_value, 'ongoing'); end if;
  if completed_candidate then signals_value := array_append(signals_value, 'completed'); end if;
  if not playable then signals_value := array_append(signals_value, 'watch_intent_no_verified_episode'); end if;
  if freshness >= 90 then signals_value := array_append(signals_value, 'episode_fresh_3d');
  elsif freshness >= 70 then signals_value := array_append(signals_value, 'episode_fresh_14d');
  elsif ongoing_candidate and freshness <= 30 then signals_value := array_append(signals_value, 'stale_ongoing'); end if;
  if m.next_episode_at > now() and m.next_episode_at <= now() + interval '14 days' then signals_value := array_append(signals_value, 'next_episode_scheduled'); end if;
  if progress_percent between 75 and 99 then signals_value := array_append(signals_value, 'near_completion'); end if;

  if not coalesce(m.is_published, false) then issues := array_append(issues, 'not_published'); end if;
  if length(trim(coalesce(m.slug, ''))) = 0 then issues := array_append(issues, 'missing_slug'); end if;
  if length(trim(coalesce(m.name, ''))) < 2 then issues := array_append(issues, 'missing_name'); end if;
  if length(trim(coalesce(m.poster_url, m.thumb_url, ''))) = 0 then issues := array_append(issues, 'missing_image'); end if;
  if coalesce(m.year, 0) < 1888 or coalesce(m.year, 0) > current_year + 2 then issues := array_append(issues, 'invalid_year'); end if;
  if lower(coalesce(m.seo_catalog_status, 'published')) in ('superseded', 'hidden', 'draft') then issues := array_append(issues, 'catalog_hidden'); end if;
  -- One public watch page needs meaningful on-page context. Do not require a
  -- trailer or raw episode URL because those are provider-state signals, not
  -- editorial-indexing requirements under the site-wide watch policy.
  if content_len < 120 then issues := array_append(issues, 'thin_content'); end if;

  eligible := cardinality(issues) = 0;
  tier := case when eligible and ongoing_candidate then 'ongoing' when eligible then 'playable' else 'blocked' end;
  score := least(100,
    (case when coalesce(m.is_published, false) then 10 else 0 end)
    + (case when length(trim(coalesce(m.name, ''))) >= 2 then 10 else 0 end)
    + (case when length(trim(coalesce(m.poster_url, m.thumb_url, ''))) > 0 then 15 else 0 end)
    + (case when content_len >= 200 then 25 when content_len >= 120 then 20 else 0 end)
    + 25
    + (case when ongoing_candidate then 8 when m.release_at is not null then 5 else 0 end)
    + (case when ongoing_candidate then round(freshness / 20.0)::integer else 0 end)
    + (case when coalesce(m.tmdb_popularity, 0) >= 5 then 5 else 0 end)
    + (case when coalesce(m.year, 0) between 1888 and current_year + 2 then 5 else 0 end)
  );

  insert into public.movie_seo_quality_status as q (
    movie_id, slug, eligible_for_index, reasons, has_playable_episode, content_length, checked_at,
    first_eligible_at, last_became_ineligible_at, movie_updated_at, index_tier, quality_score, signals,
    latest_episode_number, declared_total_episodes, episode_progress_percent, freshness_score, last_episode_change_at, next_episode_at
  ) values (
    m.id, m.slug, eligible, issues, playable, content_len, now(),
    case when eligible then now() else null end, case when eligible then null else now() end,
    m.updated_at, tier, score, signals_value, latest_episode, declared_total, progress_percent, freshness,
    case when latest_episode > 0 then coalesce(m.updated_at, now()) else null end, m.next_episode_at
  ) on conflict (movie_id) do update set
    slug = excluded.slug, eligible_for_index = excluded.eligible_for_index, reasons = excluded.reasons,
    has_playable_episode = excluded.has_playable_episode, content_length = excluded.content_length, checked_at = excluded.checked_at,
    first_eligible_at = case when excluded.eligible_for_index then coalesce(q.first_eligible_at, now()) else q.first_eligible_at end,
    last_became_ineligible_at = case when not excluded.eligible_for_index and q.eligible_for_index then now() else q.last_became_ineligible_at end,
    movie_updated_at = excluded.movie_updated_at, index_tier = excluded.index_tier, quality_score = excluded.quality_score,
    signals = excluded.signals, latest_episode_number = excluded.latest_episode_number,
    declared_total_episodes = excluded.declared_total_episodes, episode_progress_percent = excluded.episode_progress_percent,
    freshness_score = excluded.freshness_score,
    last_episode_change_at = case when excluded.latest_episode_number <> q.latest_episode_number then now() else coalesce(q.last_episode_change_at, excluded.last_episode_change_at) end,
    next_episode_at = excluded.next_episode_at
  returning * into result;
  return result;
end;
$$;

-- Recheck only the rows previously held back by now-retired provider-state
-- conditions. Existing content/year/image gates remain unchanged.
do $$
declare item record;
begin
  for item in
    select q.movie_id
    from public.movie_seo_quality_status q
    where q.eligible_for_index is false
      and (q.reasons @> array['missing_trailer']::text[] or q.reasons @> array['no_playable_episode']::text[])
    limit 1000
  loop
    perform public.refresh_movie_seo_quality(item.movie_id);
  end loop;
end $$;

comment on function public.refresh_movie_seo_quality(uuid) is
  'Watch-intent SEO gate: public pages need verified identity, image, year and substantial content; trailer and raw playback state do not block indexing.';
