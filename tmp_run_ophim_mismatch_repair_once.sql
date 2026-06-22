with cron_secret as (
  select (regexp_match(command, 'secret=([^&''\s]+)'))[1] as secret
  from cron.job
  where active = true
    and jobname <> 'ophim-mismatch-repair-hourly'
    and command ilike '%auto-sync-ophim-episodes%'
    and command ilike '%secret=%'
  order by jobid desc
  limit 1
),
movie_episode_stats as (
  select
    movie_id,
    max(episode_number) filter (where coalesce(source, '') <> 'hidden') as max_movie_episode
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
targets as (
  select
    m.slug,
    greatest(
      coalesce(m.current_episode, 0),
      coalesce(nullif(substring(coalesce(m.episode_current, '') from '([0-9]+)'), '')::int, 0)
    ) as card_episode,
    greatest(
      coalesce(me.max_movie_episode, 0),
      coalesce(ep.max_episode_table, 0),
      coalesce(st.max_stream_episode, 0)
    ) as playable_episode
  from public.movies m
  left join movie_episode_stats me on me.movie_id = m.id
  left join episode_stats ep on ep.movie_id = m.id
  left join stream_stats st on st.movie_id = m.id
  where m.is_published = true
    and lower(coalesce(m.source_site, '') || ' ' || coalesce(m.source_name, '')) like '%ophim%'
),
requests as (
  select
    slug,
    card_episode,
    playable_episode,
    net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/auto-sync-ophim-episodes?limit=1&delay_ms=0&slug='
        || slug
        || '&secret='
        || (select secret from cron_secret),
      timeout_milliseconds := 90000
    ) as request_id
  from targets
  where card_episode > playable_episode
    and playable_episode > 0
    and (select secret from cron_secret) is not null
  order by (card_episode - playable_episode) desc
  limit 20
)
select * from requests;
