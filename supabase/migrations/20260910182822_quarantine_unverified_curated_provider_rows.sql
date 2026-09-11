begin;

create temporary table kp_unverified_curated_provider_rows on commit drop as
with curated as (
  select movie.id, movie.slug
  from public.movies movie
  where movie.is_published = true
    and lower(coalesce(movie.source_site, '') || ' ' || coalesce(movie.source_name, ''))
      ~ '(blvietsub|admin-queer)'
), verified as (
  select
    episode.movie_id,
    episode.episode_number,
    nullif(trim(episode.link_m3u8), '') as link_m3u8,
    nullif(trim(episode.link_embed), '') as link_embed
  from public.movie_episodes episode
  join curated movie on movie.id = episode.movie_id
  where lower(coalesce(episode.source, '')) ~ '^verified-'
    and lower(coalesce(episode.server_name, '')) like '%verified%'
), removable_movie_episodes as (
  select
    'movie_episodes'::text as table_name,
    episode.id::text as row_id,
    episode.movie_id,
    movie.slug
  from public.movie_episodes episode
  join curated movie on movie.id = episode.movie_id
  where lower(coalesce(episode.source, '')) in ('ophim', 'kkphim', 'phimapi')
    and exists (
      select 1
      from verified backup
      where backup.movie_id = episode.movie_id
        and backup.episode_number = episode.episode_number
        and (
          (backup.link_m3u8 is not null and backup.link_m3u8 = nullif(trim(episode.link_m3u8), ''))
          or (backup.link_embed is not null and backup.link_embed = nullif(trim(episode.link_embed), ''))
        )
      union all
      select 1
      from public.movie_episodes curated_episode
      where curated_episode.movie_id = episode.movie_id
        and curated_episode.episode_number = episode.episode_number
        and lower(coalesce(curated_episode.source, '')) in ('blvietsub', 'glvietsub', 'admin-queer')
        and (
          nullif(trim(curated_episode.link_m3u8), '') is not null
          or nullif(trim(curated_episode.link_embed), '') is not null
        )
    )
), removable_episodes as (
  select
    'episodes'::text as table_name,
    episode.id::text as row_id,
    episode.movie_id,
    movie.slug
  from public.episodes episode
  join curated movie on movie.id = episode.movie_id
  where lower(coalesce(episode.server_name, '')) !~ '(blvietsub|glvietsub|admin-queer|verified)'
    and exists (
      select 1
      from verified backup
      where backup.movie_id = episode.movie_id
        and backup.episode_number = episode.episode_number
        and (
          (backup.link_m3u8 is not null and backup.link_m3u8 = nullif(trim(episode.link_m3u8), ''))
          or (backup.link_embed is not null and backup.link_embed = nullif(trim(episode.link_embed), ''))
        )
      union all
      select 1
      from public.movie_episodes curated_episode
      where curated_episode.movie_id = episode.movie_id
        and curated_episode.episode_number = episode.episode_number
        and lower(coalesce(curated_episode.source, '')) in ('blvietsub', 'glvietsub', 'admin-queer')
        and (
          nullif(trim(curated_episode.link_m3u8), '') is not null
          or nullif(trim(curated_episode.link_embed), '') is not null
        )
    )
), removable_streams as (
  select
    'streams'::text as table_name,
    stream.id::text as row_id,
    stream.movie_id,
    movie.slug
  from public.streams stream
  join curated movie on movie.id = stream.movie_id
  where lower(coalesce(stream.source, '')) in ('ophim', 'kkphim', 'phimapi')
    and exists (
      select 1
      from verified backup
      where backup.movie_id = stream.movie_id
        and (
          (backup.link_m3u8 is not null and backup.link_m3u8 = nullif(trim(stream.stream_url), ''))
          or (backup.link_embed is not null and backup.link_embed = nullif(trim(stream.embed_url), ''))
        )
      union all
      select 1
      from public.movie_episodes curated_episode
      where curated_episode.movie_id = stream.movie_id
        and stream.episode_slug ~ '[0-9]+'
        and curated_episode.episode_number = substring(stream.episode_slug from '[0-9]+')::integer
        and lower(coalesce(curated_episode.source, '')) in ('blvietsub', 'glvietsub', 'admin-queer')
        and (
          nullif(trim(curated_episode.link_m3u8), '') is not null
          or nullif(trim(curated_episode.link_embed), '') is not null
        )
    )
)
select * from removable_movie_episodes
union all select * from removable_episodes
union all select * from removable_streams;

delete from public.streams stream
using kp_unverified_curated_provider_rows bad
where bad.table_name = 'streams'
  and stream.id::text = bad.row_id;

delete from public.episodes episode
using kp_unverified_curated_provider_rows bad
where bad.table_name = 'episodes'
  and episode.id::text = bad.row_id;

delete from public.movie_episodes episode
using kp_unverified_curated_provider_rows bad
where bad.table_name = 'movie_episodes'
  and episode.id::text = bad.row_id;

delete from public.movie_api_cache cache
using (
  select distinct slug
  from kp_unverified_curated_provider_rows
) bad
where cache.slug = bad.slug;

insert into public.catalog_integrity_issues (
  issue_key,
  issue_type,
  movie_id,
  severity,
  confidence,
  status,
  evidence,
  last_detected_at,
  resolved_at,
  last_error
)
select
  'unverified_curated_provider_rows:' || bad.movie_id::text,
  'unverified_curated_provider_rows',
  bad.movie_id,
  3,
  1,
  'resolved',
  jsonb_build_object(
    'removed_rows', sum(bad.table_count),
    'tables', jsonb_object_agg(bad.table_name, bad.table_count),
    'reason', 'Curated BLVietsub title already had an exact verified provider backup; generic duplicate rows were removed.'
  ),
  now(),
  now(),
  null
from (
  select movie_id, table_name, count(*) as table_count
  from kp_unverified_curated_provider_rows
  group by movie_id, table_name
) bad
group by bad.movie_id
on conflict (issue_key) do update set
  issue_type = excluded.issue_type,
  severity = excluded.severity,
  confidence = excluded.confidence,
  status = excluded.status,
  evidence = jsonb_set(
    excluded.evidence,
    '{removed_rows}',
    to_jsonb(
      coalesce((public.catalog_integrity_issues.evidence->>'removed_rows')::integer, 0)
      + coalesce((excluded.evidence->>'removed_rows')::integer, 0)
    )
  ),
  last_detected_at = excluded.last_detected_at,
  resolved_at = excluded.resolved_at,
  last_error = null;

commit;
