with target_movies as (
  select
    id,
    slug,
    name,
    origin_name,
    source_site,
    source_name,
    source_url,
    episode_current,
    current_episode,
    episode_total,
    total_episodes,
    last_synced_at,
    updated_at
  from public.movies
  where
    lower(
      coalesce(name, '') || ' ' ||
      coalesce(origin_name, '') || ' ' ||
      coalesce(slug, '') || ' ' ||
      coalesce(title_vi, '') || ' ' ||
      coalesce(title_en, '') || ' ' ||
      coalesce(title_original, '')
    ) like any (array[
      '%crazy love%',
      '%moo moo%',
      '%cherm%',
      '%chey%',
      '%cherm chey%'
    ])
)
select
  tm.*,
  coalesce(me.max_episode, 0) as max_movie_episodes,
  coalesce(ep.max_episode, 0) as max_episodes_json,
  coalesce(st.max_episode, 0) as max_streams,
  coalesce(me.rows_count, 0) as movie_episode_rows,
  coalesce(ep.rows_count, 0) as episode_rows,
  coalesce(st.rows_count, 0) as stream_rows
from target_movies tm
left join lateral (
  select max(episode_number) as max_episode, count(*) as rows_count
  from public.movie_episodes
  where movie_id = tm.id
    and coalesce(source, '') <> 'hidden'
) me on true
left join lateral (
  select
    max((item->>'episode_number')::int) filter (where (item->>'episode_number') ~ '^\d+$') as max_episode,
    count(*) as rows_count
  from public.episodes e
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(e.server_data) = 'array' then e.server_data
      when jsonb_typeof(e.server_data) = 'object' then jsonb_build_array(e.server_data)
      else '[]'::jsonb
    end
  ) item
  where e.movie_id = tm.id
) ep on true
left join lateral (
  select
    max((regexp_match(episode_slug, '(\d+)$'))[1]::int) filter (where episode_slug ~ '\d+$') as max_episode,
    count(*) as rows_count
  from public.streams
  where movie_id = tm.id
    and is_active = true
) st on true
order by tm.updated_at desc nulls last, tm.name;
