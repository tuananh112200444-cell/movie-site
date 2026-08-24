-- GLVietsub's broad catalogue job was left inactive even though the runtime
-- capacity controller had returned to normal. Restore it and add a small,
-- independent freshness lane that revisits movies still carrying RAW rows.

create or replace function public.dispatch_glvietsub_raw_upgrades(p_limit integer default 2)
returns integer
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  candidate record;
  dispatched integer := 0;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 2), 4));
  cron_secret text;
begin
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'CRON_SECRET'
  order by created_at desc
  limit 1;

  if coalesce(cron_secret, '') = '' then
    raise exception 'CRON_SECRET is not configured';
  end if;

  for candidate in
    select
      movie.id,
      substring(
        coalesce(nullif(movie.source_url, ''), nullif(movie.showtimes, ''), '')
        from '/phim-bo/([^/?#]+)'
      ) as source_slug
    from public.movies movie
    where lower(coalesce(movie.source_site, '')) = 'glvietsub'
      and (movie.last_synced_at is null or movie.last_synced_at < now() - interval '10 minutes')
      and exists (
        select 1
        from public.movie_episodes raw_episode
        where raw_episode.movie_id = movie.id
          and lower(coalesce(raw_episode.source, '')) = 'glvietsub'
          and lower(coalesce(raw_episode.audio_type, '')) = 'raw'
          and not exists (
            select 1
            from public.movie_episodes localized_episode
            where localized_episode.movie_id = raw_episode.movie_id
              and localized_episode.episode_number = raw_episode.episode_number
              and lower(coalesce(localized_episode.source, '')) = 'glvietsub'
              and lower(coalesce(localized_episode.audio_type, '')) <> 'raw'
          )
      )
    order by movie.last_synced_at asc nulls first, movie.updated_at desc
    limit safe_limit
  loop
    if candidate.source_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      continue;
    end if;

    perform net.http_get(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-glvietsub-feed?slug=' || candidate.source_slug,
      headers := jsonb_build_object('x-cron-secret', cron_secret),
      timeout_milliseconds := 120000
    );
    dispatched := dispatched + 1;
  end loop;

  return dispatched;
end;
$$;

revoke all on function public.dispatch_glvietsub_raw_upgrades(integer) from public, anon, authenticated;
grant execute on function public.dispatch_glvietsub_raw_upgrades(integer) to service_role;

do $scheduler$
begin
  perform cron.alter_job(jobid, active := true)
  from cron.job
  where jobname = 'sync-glvietsub-feed-every-15-minutes';

  update public.runtime_capacity_managed_jobs
  set paused_by_capacity_guard = false,
      paused_at = null,
      updated_at = now()
  where job_name = 'sync-glvietsub-feed-every-15-minutes';

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'upgrade-glvietsub-raw-every-15-minutes';

  perform cron.schedule(
    'upgrade-glvietsub-raw-every-15-minutes',
    '12,27,42,57 * * * *',
    $cmd$select public.dispatch_glvietsub_raw_upgrades(2);$cmd$
  );
end;
$scheduler$;

comment on function public.dispatch_glvietsub_raw_upgrades(integer) is
  'Bounded priority refresh for GLVietsub movies whose latest known episode is still RAW; translated rows replace RAW only after a successful source parse.';
