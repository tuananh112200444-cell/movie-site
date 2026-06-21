select 'bad_page_embeds' as metric, count(*)::text as value
from movie_episodes
where source = 'blvietsub'
  and link_embed ilike '%blvietsub.com%xem-phim%'
union all
select 'blvietsub_movies', count(*)::text
from movies
where is_published = true
  and (
    source_site ilike '%blvietsub%'
    or source_name ilike '%blvietsub%'
    or showtimes ilike '%blvietsub.com%'
    or source_url ilike '%blvietsub.com%'
  )
union all
select 'blvietsub_episode_rows', count(*)::text
from movie_episodes
where source = 'blvietsub'
union all
select 'empty_playable_rows', count(*)::text
from movie_episodes
where source = 'blvietsub'
  and coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is null
union all
select 'latest_movie_sync_at', coalesce(max(last_synced_at)::text, '')
from movies
where source_site ilike '%blvietsub%' or source_name ilike '%blvietsub%';

select
  slug,
  name,
  episode_current,
  current_episode,
  total_episodes,
  last_synced_at,
  source_url
from movies
where is_published = true
  and (
    source_site ilike '%blvietsub%'
    or source_name ilike '%blvietsub%'
    or showtimes ilike '%blvietsub.com%'
    or source_url ilike '%blvietsub.com%'
  )
order by coalesce(last_synced_at, updated_at, created_at) desc nulls last
limit 15;

select
  function_name,
  run_at,
  scanned,
  added,
  skipped,
  errors,
  elapsed_ms,
  success
from sync_logs
where function_name ilike '%blvietsub%'
order by run_at desc
limit 20;

select
  jobid,
  schedule,
  active,
  command
from cron.job
where command ilike '%sync-blvietsub%'
   or command ilike '%blvietsub%'
order by jobid;
