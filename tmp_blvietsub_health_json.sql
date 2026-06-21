select jsonb_build_object(
  'metrics', jsonb_build_object(
    'bad_page_embeds', (
      select count(*) from movie_episodes
      where source = 'blvietsub'
        and link_embed ilike '%blvietsub.com%xem-phim%'
    ),
    'blvietsub_movies', (
      select count(*) from movies
      where is_published = true
        and (
          source_site ilike '%blvietsub%'
          or source_name ilike '%blvietsub%'
          or showtimes ilike '%blvietsub.com%'
          or source_url ilike '%blvietsub.com%'
        )
    ),
    'blvietsub_episode_rows', (
      select count(*) from movie_episodes where source = 'blvietsub'
    ),
    'empty_playable_rows', (
      select count(*) from movie_episodes
      where source = 'blvietsub'
        and coalesce(nullif(trim(link_embed), ''), nullif(trim(link_m3u8), '')) is null
    ),
    'latest_movie_sync_at', (
      select max(last_synced_at)
      from movies
      where source_site ilike '%blvietsub%' or source_name ilike '%blvietsub%'
    )
  ),
  'recent_movies', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
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
      limit 10
    ) t
  ),
  'recent_sync_logs', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
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
      limit 12
    ) t
  ),
  'cron_jobs', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select
        jobid,
        schedule,
        active,
        left(command, 120) as command_preview
      from cron.job
      where command ilike '%sync-blvietsub%'
         or command ilike '%blvietsub%'
      order by jobid
    ) t
  ),
  'recent_cron_runs', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select
        jobid,
        status,
        start_time,
        end_time,
        return_message
      from cron.job_run_details
      where jobid in (
        select jobid from cron.job
        where command ilike '%sync-blvietsub%'
           or command ilike '%blvietsub%'
      )
      order by start_time desc
      limit 12
    ) t
  )
) as health;
