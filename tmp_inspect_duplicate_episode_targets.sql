with target_slugs as (
  select unnest(array[
    'mac-ly',
    'co-nang-dau-bep-cua-toi',
    'pho-son-hai',
    'trang-trai-clarkson-phan-1',
    'gio-thoang-tinh-theo'
  ]) as slug
),
movie_rows as (
  select
    m.id,
    m.slug,
    m.name,
    m.origin_name,
    m.source_site,
    m.source_name,
    m.current_episode,
    m.episode_current,
    m.is_published,
    m.updated_at
  from public.movies m
  join target_slugs t on t.slug = m.slug
),
playable as (
  select movie_id, max(ep_num) as max_playable, count(*) as rows_count
  from (
    select movie_id, episode_number::int as ep_num
    from public.movie_episodes
    where lower(coalesce(source, '')) <> 'hidden'
      and (nullif(trim(coalesce(link_m3u8, '')), '') is not null or nullif(trim(coalesce(link_embed, '')), '') is not null)
      and episode_number is not null

    union all

    select movie_id, greatest(
      coalesce(episode_number::int, 0),
      case when nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '') ~ '^\d{1,5}$' then nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '')::int else 0 end,
      case when nullif(regexp_replace(coalesce(episode_name, ''), '\D', '', 'g'), '') ~ '^\d{1,5}$' then nullif(regexp_replace(coalesce(episode_name, ''), '\D', '', 'g'), '')::int else 0 end,
      case when nullif(regexp_replace(coalesce(server_data->>'slug', ''), '\D', '', 'g'), '') ~ '^\d{1,5}$' then nullif(regexp_replace(coalesce(server_data->>'slug', ''), '\D', '', 'g'), '')::int else 0 end,
      case when nullif(regexp_replace(coalesce(server_data->>'name', ''), '\D', '', 'g'), '') ~ '^\d{1,5}$' then nullif(regexp_replace(coalesce(server_data->>'name', ''), '\D', '', 'g'), '')::int else 0 end
    ) as ep_num
    from public.episodes
    where (nullif(trim(coalesce(link_m3u8, '')), '') is not null or nullif(trim(coalesce(link_embed, '')), '') is not null)

    union all

    select
      movie_id,
      case
        when nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '') ~ '^\d{1,5}$'
          then nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '')::int
        else null
      end as ep_num
    from public.streams
    where is_active is distinct from false
      and (nullif(trim(coalesce(stream_url, '')), '') is not null or nullif(trim(coalesce(embed_url, '')), '') is not null)
      and nullif(regexp_replace(coalesce(episode_slug, ''), '\D', '', 'g'), '') ~ '^\d{1,5}$'
  ) rows
  where ep_num > 0 and ep_num < 10000
  group by movie_id
)
select
  mr.slug,
  mr.id,
  mr.name,
  mr.origin_name,
  mr.source_site,
  mr.source_name,
  mr.current_episode,
  mr.episode_current,
  mr.is_published,
  coalesce(p.max_playable, 0) as max_playable,
  coalesce(p.rows_count, 0) as playable_rows,
  mr.updated_at
from movie_rows mr
left join playable p on p.movie_id = mr.id
order by mr.slug, mr.updated_at desc, max_playable desc;
