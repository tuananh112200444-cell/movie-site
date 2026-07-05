create table if not exists public.search_index_cache_items (
  rank integer primary key,
  item jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists search_index_cache_items_updated_idx
  on public.search_index_cache_items (updated_at desc);

alter table public.search_index_cache_items enable row level security;

drop policy if exists "search_index_cache_items_read_all" on public.search_index_cache_items;
create policy "search_index_cache_items_read_all"
  on public.search_index_cache_items
  for select
  to anon, authenticated
  using (true);

create or replace function public.refresh_search_index_cache(p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 100), 5000);
  v_count integer := 0;
begin
  create temporary table tmp_search_index_cache_items on commit drop as
  select
    row_number() over (order by updated_at desc nulls last, id) as rank,
    jsonb_build_object(
      'id', id,
      'slug', slug,
      'name', name,
      'origin_name', origin_name,
      'title_vi', title_vi,
      'title_en', title_en,
      'title_original', title_original,
      'normalized_name', normalized_name,
      'thumb_url', thumb_url,
      'poster_url', poster_url,
      'type', type,
      'year', year,
      'quality', quality,
      'lang', lang,
      'episode_current', episode_current,
      'episode_total', episode_total,
      'current_episode', current_episode,
      'total_episodes', total_episodes,
      'updated_at', updated_at,
      'source_site', source_site,
      'source_name', source_name
    ) as item
  from public.movies
  where coalesce(is_published, true) = true
  order by updated_at desc nulls last, id
  limit v_limit;

  truncate table public.search_index_cache_items;

  insert into public.search_index_cache_items (rank, item, updated_at)
  select rank::integer, item, now()
  from tmp_search_index_cache_items;

  get diagnostics v_count = row_count;

  insert into public.home_page_cache (id, sections, source, updated_at, expires_at)
  values (
    'search_index_v4_rows',
    jsonb_build_object('count', v_count, 'refresh_lock_until', null),
    'postgres-search-index-cache-rows',
    now(),
    now() + interval '4 hours'
  )
  on conflict (id) do update
    set sections = excluded.sections,
        source = excluded.source,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at;

  delete from public.home_page_cache
  where id in ('search_index_v2', 'search_index_v3_slim');

  return v_count;
end;
$$;

grant select on public.search_index_cache_items to anon, authenticated;
grant execute on function public.refresh_search_index_cache(integer) to service_role;
