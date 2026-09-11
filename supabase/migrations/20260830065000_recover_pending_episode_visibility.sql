-- Restore complete episode visibility without trusting arbitrary unchecked
-- embeds. Only direct HLS URLs from the known KKPhim/PhimAPI media hosts may
-- bridge the short interval before an independent health probe completes.

create index if not exists streams_unchecked_recent_queue_idx
  on public.streams (updated_at desc, movie_id, id)
  where is_active = true
    and health_status = 'unchecked'
    and (stream_url <> '' or embed_url <> '');

create index if not exists streams_provider_verification_hot_queue_idx
  on public.streams (updated_at desc, movie_id, id)
  where is_active = true
    and last_error like 'Provider verification pending:%'
    and (stream_url <> '' or embed_url <> '');

create or replace function public.stream_row_is_publicly_usable(p_stream public.streams)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    not public.is_retired_playback_source(
      coalesce(p_stream.provider_key, p_stream.source),
      p_stream.server_name,
      p_stream.stream_url,
      p_stream.embed_url
    )
    and p_stream.is_active is true
    and (
      coalesce(trim(p_stream.stream_url), '') ~* '^https?://'
      or coalesce(trim(p_stream.embed_url), '') ~* '^https?://'
    )
    and lower(trim(coalesce(p_stream.health_status, 'unchecked'))) <> 'dead'
    and (
      coalesce(p_stream.last_error, '') not like 'Provider verification pending:%'
      or (
        lower(trim(coalesce(p_stream.provider_key, p_stream.source, ''))) ~ '(phimapi|kkphim)'
        and lower(trim(coalesce(p_stream.health_status, 'unchecked'))) in ('unchecked', 'ok', 'degraded')
        and coalesce(trim(p_stream.stream_url), '') ~*
          '^https://([a-z0-9-]+[.])*(kkphimplayer[0-9]*[.]com|phim1280[.]tv)/.+[.]m3u8([?#].*)?$'
      )
    )
    and not (
      lower(trim(coalesce(p_stream.health_status, 'unchecked'))) = 'failed'
      and coalesce(p_stream.failure_count, 0) >= 3
    )
    and not (
      lower(trim(coalesce(p_stream.health_status, 'unchecked'))) = 'blocked'
      and coalesce(p_stream.embed_url, '') !~* '^https?://player[.]phimapi[.]com/player/'
      and coalesce(p_stream.embed_url, '') !~* '^https?://[^/]*streamc[.]xyz/'
    );
$$;

revoke all on function public.stream_row_is_publicly_usable(public.streams)
  from public, anon, authenticated;
grant execute on function public.stream_row_is_publicly_usable(public.streams)
  to service_role;

-- Keep broken playback-learning analytics from starving viewer-facing health
-- work. New imports, pending verification and known problem sources share the
-- highest priority and remain bounded by small connector limits.
update public.system_brain_tasks
set priority = 1,
    interval_seconds = greatest(interval_seconds, 3600),
    next_run_at = greatest(next_run_at, now() + interval '30 minutes'),
    updated_at = now()
where task_key = 'playback:learning';

update public.system_brain_tasks
set priority = 5,
    next_run_at = least(next_run_at, now()),
    updated_at = now()
where task_key in ('playback:newest', 'playback:unchecked');

insert into public.system_brain_tasks (
  task_key, brain, handler, params, priority, interval_seconds, enabled,
  status, next_run_at, lease_until, consecutive_failures, last_error, updated_at
)
values (
  'playback:provider-verification',
  'playback',
  'stream-health-check',
  '{"queue":"hot","limit":12,"movie_limit":40,"concurrency":3,"deactivate_after":4,"_timeout_ms":85000}'::jsonb,
  5,
  900,
  true,
  'idle',
  now(),
  null,
  0,
  null,
  now()
)
on conflict (task_key) do update
set handler = excluded.handler,
    params = excluded.params,
    priority = excluded.priority,
    interval_seconds = excluded.interval_seconds,
    enabled = true,
    status = 'idle',
    next_run_at = least(public.system_brain_tasks.next_run_at, now()),
    lease_until = null,
    consecutive_failures = 0,
    last_error = null,
    updated_at = now();

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.alter_job(
    jobid,
    command := $cmd$
      select net.http_get(
        url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/playback-brain?limit=2',
        headers := jsonb_build_object(
          'x-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1)
        ),
        timeout_milliseconds := 110000
      );
    $cmd$
  )
  from cron.job
  where jobname in ('playback-brain-shoulder', 'playback-brain-peak-guard');
end;
$scheduler$;

-- Repair metadata for already imported, strictly contiguous KKPhim seasons.
-- This is set based and bounded to the trusted direct-HLS contract above.
with safe_rows as materialized (
  select
    stream.movie_id,
    case
      when trim(coalesce(stream.episode_slug, '')) ~* '^[0-9]{1,3}$'
        then trim(stream.episode_slug)::integer
      when trim(coalesce(stream.episode_slug, '')) ~* '^(tap|episode|ep)[-_ ]*0*[0-9]{1,3}$'
        then substring(trim(stream.episode_slug) from '([0-9]{1,3})$')::integer
      else null
    end as episode_number
  from public.streams stream
  where stream.is_active is true
    and lower(trim(coalesce(stream.provider_key, stream.source, ''))) ~ '(phimapi|kkphim)'
    and lower(trim(coalesce(stream.health_status, 'unchecked'))) in ('unchecked', 'ok', 'degraded')
    and coalesce(trim(stream.stream_url), '') ~*
      '^https://([a-z0-9-]+[.])*(kkphimplayer[0-9]*[.]com|phim1280[.]tv)/.+[.]m3u8([?#].*)?$'
), safe_coverage as materialized (
  select movie_id, max(episode_number)::integer as max_episode
  from safe_rows
  where episode_number between 1 and 300
  group by movie_id
  having min(episode_number) = 1
     and count(distinct episode_number) = max(episode_number)
), repaired as (
  update public.movies movie
  set current_episode = coverage.max_episode,
      episode_current = case
        when coalesce(movie.total_episodes, 0) > 0
          and coverage.max_episode >= movie.total_episodes
          then 'Hoàn Tất (' || coverage.max_episode::text || '/' || movie.total_episodes::text || ')'
        else 'Tập ' || coverage.max_episode::text
      end,
      status = case
        when coalesce(movie.total_episodes, 0) > 0
          and coverage.max_episode >= movie.total_episodes
          then 'completed'
        else 'ongoing'
      end,
      last_episode_change_at = case
        when coverage.max_episode > coalesce(movie.current_episode, 0) then now()
        else movie.last_episode_change_at
      end,
      updated_at = now()
  from safe_coverage coverage
  where movie.id = coverage.movie_id
    and coverage.max_episode > coalesce(movie.current_episode, 0)
  returning movie.id, movie.slug
)
delete from public.movie_api_cache cache
using repaired
where cache.slug = repaired.slug;

delete from public.movie_api_cache
where slug = 'sep-chinh-la-than-tuong-bias-toi-sep-cua-toi';

comment on function public.stream_row_is_publicly_usable(public.streams) is
  'Public stream gate. Pending rows remain hidden except strict direct HLS from trusted KKPhim media hosts; conclusive failures and retired sources remain blocked.';
