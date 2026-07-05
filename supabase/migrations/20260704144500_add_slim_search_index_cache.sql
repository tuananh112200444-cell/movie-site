create or replace function public.refresh_search_index_cache(p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 100), 5000);
  v_items jsonb;
  v_count integer := 0;
begin
  select coalesce(jsonb_agg(
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
    )
    order by updated_at desc nulls last
  ), '[]'::jsonb)
  into v_items
  from (
    select
      id, slug, name, origin_name, title_vi, title_en, title_original, normalized_name,
      thumb_url, poster_url, type, year, quality, lang, episode_current, episode_total,
      current_episode, total_episodes, updated_at, source_site, source_name
    from public.movies
    where coalesce(is_published, true) = true
    order by updated_at desc nulls last
    limit v_limit
  ) m;

  v_count := jsonb_array_length(v_items);

  insert into public.home_page_cache (id, sections, source, updated_at, expires_at)
  values (
    'search_index_v3_slim',
    jsonb_build_object('items', v_items, 'count', v_count, 'refresh_lock_until', null),
    'postgres-search-index-cache',
    now(),
    now() + interval '4 hours'
  )
  on conflict (id) do update
    set sections = excluded.sections,
        source = excluded.source,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at;

  return v_count;
end;
$$;

grant execute on function public.refresh_search_index_cache(integer) to service_role;
