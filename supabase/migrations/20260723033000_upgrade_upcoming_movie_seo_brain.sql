-- Index high-quality upcoming/trailer pages early, while keeping thin placeholders out.
-- Also reconcile stale trailer state immediately when a real playable episode arrives.

alter table public.movie_seo_quality_status
  add column if not exists index_tier text not null default 'blocked',
  add column if not exists quality_score integer not null default 0;

alter table public.movie_seo_quality_status
  drop constraint if exists movie_seo_quality_index_tier_check;
alter table public.movie_seo_quality_status
  add constraint movie_seo_quality_index_tier_check
  check (index_tier in ('blocked', 'upcoming', 'playable'));

create index if not exists movie_seo_quality_tier_score_idx
  on public.movie_seo_quality_status (index_tier, eligible_for_index, quality_score desc, checked_at desc);

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
  eligible boolean := false;
  result public.movie_seo_quality_status;
  normalized_status text;
  normalized_episode text;
  content_len integer := 0;
  current_year integer := extract(year from now())::integer;
  upcoming_candidate boolean := false;
  valid_trailer boolean := false;
  fresh_demand_signal boolean := false;
  tier text := 'blocked';
  score integer := 0;
begin
  select * into m from public.movies where id = p_movie_id;
  if not found then
    delete from public.movie_seo_quality_status where movie_id = p_movie_id;
    return null;
  end if;

  select exists (
    select 1 from public.movie_episodes e
    where e.movie_id = p_movie_id
      and (coalesce(e.link_m3u8, '') ~* '^https?://' or coalesce(e.link_embed, '') ~* '^https?://')
    union all
    select 1 from public.episodes e
    where e.movie_id = p_movie_id
      and (coalesce(e.link_m3u8, '') ~* '^https?://' or coalesce(e.link_embed, '') ~* '^https?://')
  ) into playable;

  normalized_status := lower(trim(coalesce(m.seo_catalog_status, '') || ' ' || coalesce(m.status, '')));
  normalized_episode := lower(trim(coalesce(m.episode_current, '') || ' ' || coalesce(m.current_episode::text, '')));
  content_len := length(trim(regexp_replace(coalesce(m.content, ''), '<[^>]+>', ' ', 'g')));
  valid_trailer := coalesce(m.trailer_url, '') ~* '^https?://';
  upcoming_candidate := not playable and (
    normalized_status ~ '(upcoming|trailer)'
    or normalized_episode ~ '(trailer|sap chieu)'
    or m.release_at > now()
  );
  fresh_demand_signal :=
    coalesce(m.tmdb_popularity, 0) >= 2
    or m.updated_at >= now() - interval '60 days'
    or m.release_at between now() - interval '45 days' and now() + interval '2 years';

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
    when eligible and playable then 'playable'
    when eligible and upcoming_candidate then 'upcoming'
    else 'blocked'
  end;
  score := least(100,
    (case when coalesce(m.is_published, false) then 10 else 0 end)
    + (case when length(trim(coalesce(m.name, ''))) >= 2 then 10 else 0 end)
    + (case when length(trim(coalesce(m.poster_url, m.thumb_url, ''))) > 0 then 15 else 0 end)
    + (case when content_len >= 200 then 25 when content_len >= 120 then 20 when content_len >= 80 then 12 else 0 end)
    + (case when playable then 25 when valid_trailer then 18 else 0 end)
    + (case when m.release_at is not null then 5 else 0 end)
    + (case when coalesce(m.tmdb_popularity, 0) >= 5 then 5 else 0 end)
    + (case when coalesce(m.year, 0) between 1888 and current_year + 2 then 5 else 0 end)
  );

  insert into public.movie_seo_quality_status as q (
    movie_id, slug, eligible_for_index, reasons, has_playable_episode,
    content_length, checked_at, first_eligible_at, last_became_ineligible_at,
    movie_updated_at, index_tier, quality_score
  ) values (
    m.id, m.slug, eligible, issues, playable,
    content_len, now(),
    case when eligible then now() else null end,
    case when eligible then null else now() end,
    m.updated_at, tier, score
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
    quality_score = excluded.quality_score
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

  if max_episode > 0 then
    update public.movies
    set
      seo_catalog_status = case
        when lower(coalesce(seo_catalog_status, '')) in ('hidden', 'draft', 'superseded') then seo_catalog_status
        else 'published'
      end,
      status = case when lower(coalesce(status, '')) in ('upcoming', 'trailer') then 'ongoing' else status end,
      episode_current = case
        when lower(coalesce(episode_current, '')) ~ '(trailer|sap chieu|dang cap nhat)'
          then 'Tập ' || max_episode::text
        else episode_current
      end,
      current_episode = greatest(coalesce(current_episode, 0), max_episode),
      updated_at = greatest(coalesce(updated_at, now()), now())
    where id = p_movie_id
      and is_published is true;
  end if;

  perform public.refresh_movie_seo_quality(p_movie_id);
  return max_episode;
end;
$$;

revoke all on function public.reconcile_movie_release_state(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_movie_release_state(uuid) to service_role;

create or replace function public.refresh_movie_seo_quality_after_movie_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_movie_seo_quality(new.id);
  return new;
end;
$$;

drop trigger if exists refresh_movie_seo_quality_on_movie_change on public.movies;
create trigger refresh_movie_seo_quality_on_movie_change
after insert or update of
  slug, name, content, poster_url, thumb_url, trailer_url, status,
  episode_current, current_episode, year, release_at, is_published,
  seo_catalog_status, tmdb_popularity
on public.movies
for each row execute function public.refresh_movie_seo_quality_after_movie_change();

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
  if tg_op = 'DELETE' then
    perform public.refresh_movie_seo_quality(target_movie_id);
  else
    perform public.reconcile_movie_release_state(target_movie_id);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists reconcile_movie_after_movie_episode_change on public.movie_episodes;
create trigger reconcile_movie_after_movie_episode_change
after insert or update of movie_id, episode_number, link_m3u8, link_embed or delete
on public.movie_episodes
for each row execute function public.reconcile_movie_after_episode_change();

drop trigger if exists reconcile_movie_after_episode_change on public.episodes;
create trigger reconcile_movie_after_episode_change
after insert or update of movie_id, episode_number, link_m3u8, link_embed or delete
on public.episodes
for each row execute function public.reconcile_movie_after_episode_change();

create or replace function public.refresh_recent_movie_seo_quality(p_limit integer default 1500)
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
    order by q.checked_at asc nulls first, m.updated_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 1500), 5000))
  loop
    perform public.refresh_movie_seo_quality(item.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

do $$
declare
  item record;
begin
  for item in
    select id
    from public.movies
    where is_published is true
      and (
        lower(coalesce(seo_catalog_status, '')) = 'upcoming'
        or lower(coalesce(status, '')) in ('upcoming', 'trailer')
        or lower(coalesce(episode_current, '')) ~ '(trailer|sap chieu|dang cap nhat)'
        or release_at > now()
      )
  loop
    perform public.reconcile_movie_release_state(item.id);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-movie-seo-quality-hourly';
    perform cron.schedule(
      'refresh-movie-seo-quality-hourly',
      '*/30 * * * *',
      $cmd$select public.refresh_recent_movie_seo_quality(1500);$cmd$
    );
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'sync-tmdb-catalog-daily') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'sync-tmdb-catalog-daily'),
      schedule := '20 */6 * * *',
      command := $cmd$
        select net.http_post(
          url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-tmdb-catalog',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)
          ),
          body := jsonb_build_object('pages',4,'limit',220,'months',8),
          timeout_milliseconds := 240000
        );
      $cmd$
    );
  end if;
end $$;

comment on column public.movie_seo_quality_status.index_tier is
  'Index lifecycle tier: playable movie, high-quality upcoming/trailer landing, or blocked.';
comment on column public.movie_seo_quality_status.quality_score is
  'Deterministic 0-100 score for SEO observability and prioritization; eligibility still uses explicit gates.';
