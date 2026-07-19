create table if not exists public.movie_seo_quality_status (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  slug text not null,
  eligible_for_index boolean not null default false,
  reasons text[] not null default '{}',
  has_playable_episode boolean not null default false,
  content_length integer not null default 0,
  checked_at timestamptz not null default now(),
  first_eligible_at timestamptz,
  last_became_ineligible_at timestamptz,
  movie_updated_at timestamptz,
  constraint movie_seo_quality_status_slug_nonempty check (length(trim(slug)) > 0)
);

create index if not exists movie_seo_quality_eligible_checked_idx
  on public.movie_seo_quality_status (eligible_for_index, checked_at desc);
create index if not exists movie_seo_quality_reasons_gin_idx
  on public.movie_seo_quality_status using gin (reasons);

alter table public.movie_seo_quality_status enable row level security;
revoke all on table public.movie_seo_quality_status from public, anon, authenticated;
grant all on table public.movie_seo_quality_status to service_role;

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
  eligible boolean;
  result public.movie_seo_quality_status;
  normalized_status text;
  normalized_episode text;
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

  normalized_status := lower(coalesce(m.status, ''));
  normalized_episode := lower(coalesce(m.episode_current, '') || ' ' || coalesce(m.current_episode::text, ''));

  if not coalesce(m.is_published, false) then issues := array_append(issues, 'not_published'); end if;
  if length(trim(coalesce(m.slug, ''))) = 0 then issues := array_append(issues, 'missing_slug'); end if;
  if length(trim(coalesce(m.name, ''))) < 2 then issues := array_append(issues, 'missing_name'); end if;
  if length(trim(coalesce(m.poster_url, m.thumb_url, ''))) = 0 then issues := array_append(issues, 'missing_image'); end if;
  if length(trim(regexp_replace(coalesce(m.content, ''), '<[^>]+>', ' ', 'g'))) < 80 then issues := array_append(issues, 'thin_content'); end if;
  if coalesce(m.year, 0) < 1888 or coalesce(m.year, 0) > extract(year from now())::int + 2 then issues := array_append(issues, 'invalid_year'); end if;
  if normalized_status in ('upcoming', 'trailer') or normalized_episode ~ '(trailer|sắp chiếu|sap chieu)' then issues := array_append(issues, 'not_released'); end if;
  if not playable then issues := array_append(issues, 'no_playable_episode'); end if;
  if lower(coalesce(m.seo_catalog_status, 'published')) in ('superseded', 'hidden', 'draft') then issues := array_append(issues, 'catalog_hidden'); end if;

  eligible := cardinality(issues) = 0;
  insert into public.movie_seo_quality_status as q (
    movie_id, slug, eligible_for_index, reasons, has_playable_episode,
    content_length, checked_at, first_eligible_at, last_became_ineligible_at, movie_updated_at
  ) values (
    m.id, m.slug, eligible, issues, playable,
    length(trim(regexp_replace(coalesce(m.content, ''), '<[^>]+>', ' ', 'g'))), now(),
    case when eligible then now() else null end,
    case when eligible then null else now() end,
    m.updated_at
  ) on conflict (movie_id) do update set
    slug = excluded.slug,
    eligible_for_index = excluded.eligible_for_index,
    reasons = excluded.reasons,
    has_playable_episode = excluded.has_playable_episode,
    content_length = excluded.content_length,
    checked_at = excluded.checked_at,
    first_eligible_at = case when excluded.eligible_for_index then coalesce(q.first_eligible_at, now()) else q.first_eligible_at end,
    last_became_ineligible_at = case when not excluded.eligible_for_index and q.eligible_for_index then now() else q.last_became_ineligible_at end,
    movie_updated_at = excluded.movie_updated_at
  returning * into result;
  return result;
end;
$$;

revoke all on function public.refresh_movie_seo_quality(uuid) from public, anon, authenticated;
grant execute on function public.refresh_movie_seo_quality(uuid) to service_role;

create or replace function public.refresh_recent_movie_seo_quality(p_limit integer default 500)
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
    select id from public.movies order by updated_at desc nulls last limit greatest(1, least(coalesce(p_limit, 500), 5000))
  loop
    perform public.refresh_movie_seo_quality(item.id);
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

revoke all on function public.refresh_recent_movie_seo_quality(integer) from public, anon, authenticated;
grant execute on function public.refresh_recent_movie_seo_quality(integer) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-movie-seo-quality-hourly';
    perform cron.schedule('refresh-movie-seo-quality-hourly', '17 * * * *',
      $cmd$select public.refresh_recent_movie_seo_quality(500);$cmd$);
  end if;
end $$;

comment on table public.movie_seo_quality_status is
  'Operational SEO quality gate. This records sitemap eligibility; it does not claim or guarantee Google indexing.';

