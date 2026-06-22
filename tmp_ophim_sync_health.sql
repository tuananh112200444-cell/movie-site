select jsonb_build_object(
  'cron_jobs', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select
        jobid,
        schedule,
        active,
        left(command, 180) as command_preview
      from cron.job
      where command ilike '%ophim%'
         or command ilike '%sync-ophim%'
         or command ilike '%auto-sync-ophim%'
      order by jobid
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
      where function_name ilike '%ophim%'
      order by run_at desc
      limit 20
    ) t
  ),
  'mismatch_by_source', (
    with movie_episode_stats as (
      select movie_id, max(episode_number) filter (where coalesce(source, '') <> 'hidden') as max_movie_episode
      from public.movie_episodes
      group by movie_id
    ),
    episode_stats as (
      select movie_id, max(episode_number) as max_episode_table
      from public.episodes
      group by movie_id
    ),
    stream_stats as (
      select
        movie_id,
        max(coalesce(nullif(substring(coalesce(episode_slug, '') from '([0-9]+)$'), '')::int, 0)) as max_stream_episode
      from public.streams
      where is_active = true
      group by movie_id
    ),
    stats as (
      select
        lower(coalesce(m.source_site, '') || ' / ' || coalesce(m.source_name, '')) as source_key,
        greatest(
          coalesce(m.current_episode, 0),
          coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0)
        ) as card_episode,
        greatest(
          coalesce(me.max_movie_episode, 0),
          coalesce(ep.max_episode_table, 0),
          coalesce(st.max_stream_episode, 0)
        ) as playable_max_episode
      from public.movies m
      left join movie_episode_stats me on me.movie_id = m.id
      left join episode_stats ep on ep.movie_id = m.id
      left join stream_stats st on st.movie_id = m.id
      where m.is_published = true
    )
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select
        source_key,
        count(*) as suspected_count
      from stats
      where card_episode > playable_max_episode
        and playable_max_episode > 0
      group by source_key
      order by suspected_count desc
      limit 10
    ) t
  )
) as ophim_health;
