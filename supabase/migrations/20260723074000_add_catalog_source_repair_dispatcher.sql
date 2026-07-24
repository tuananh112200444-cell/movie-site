-- Dispatch targeted, bounded source repairs from the catalogue integrity queue.
-- One broken movie is isolated in one HTTP request, so it cannot roll back or
-- poison the rest of an ingestion batch.

create or replace function public.reconcile_catalog_source_repairs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
  reopened_count integer := 0;
begin
  update public.catalog_integrity_issues issue
  set
    status = 'resolved',
    resolved_at = now(),
    last_detected_at = now(),
    last_error = null
  where issue.status in ('open', 'repairing')
    and (
      (
        issue.issue_type = 'published_without_playback'
        and (
          exists (
            select 1 from public.movie_episodes episode
            where episode.movie_id = issue.movie_id
              and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
          )
          or exists (
            select 1 from public.episodes episode
            where episode.movie_id = issue.movie_id
              and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
          )
          or exists (
            select 1 from public.streams stream
            where stream.movie_id = issue.movie_id
              and stream.is_active is true
              and (coalesce(stream.stream_url, '') <> '' or coalesce(stream.embed_url, '') <> '')
          )
        )
      )
      or (
        issue.issue_type = 'episode_count_mismatch'
        and coalesce((issue.evidence->>'advertised')::integer, 0) <= greatest(
          coalesce((
            select max(episode.episode_number)
            from public.movie_episodes episode
            where episode.movie_id = issue.movie_id
              and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
          ), 0),
          coalesce((
            select max(episode.episode_number)
            from public.episodes episode
            where episode.movie_id = issue.movie_id
              and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
          ), 0)
        )
      )
    );
  get diagnostics resolved_count = row_count;

  update public.catalog_integrity_issues
  set
    status = 'open',
    last_error = case
      when attempts >= 3 then 'Targeted source repair exhausted; upstream detail or playable episode is unavailable'
      else 'Targeted source repair did not produce playable coverage; retry scheduled'
    end
  where status = 'repairing'
    and coalesce((evidence->>'repair_dispatched_at')::timestamptz, last_detected_at)
      < now() - interval '10 minutes';
  get diagnostics reopened_count = row_count;

  return jsonb_build_object('resolved', resolved_count, 'reopened', reopened_count);
end;
$$;

revoke all on function public.reconcile_catalog_source_repairs()
  from public, anon, authenticated;
grant execute on function public.reconcile_catalog_source_repairs()
  to service_role;

create or replace function public.dispatch_catalog_source_repairs(p_limit integer default 3)
returns jsonb
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  item record;
  request_id bigint;
  dispatched integer := 0;
  cron_secret text;
  provider text;
begin
  perform public.reconcile_catalog_source_repairs();

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'CRON_SECRET'
  order by created_at desc
  limit 1;

  if nullif(cron_secret, '') is null then
    return jsonb_build_object('dispatched', 0, 'error', 'CRON_SECRET unavailable');
  end if;

  for item in
    select
      issue.issue_key,
      issue.movie_id,
      movie.slug,
      lower(coalesce(movie.source_site, '')) as source_site
    from public.catalog_integrity_issues issue
    join public.movies movie on movie.id = issue.movie_id
    where issue.status = 'open'
      and issue.issue_type in ('published_without_playback', 'episode_count_mismatch')
      and issue.attempts < 3
      and lower(coalesce(movie.source_site, '')) in ('ophim', 'ophim1.com', 'phimapi')
      and movie.slug ~ '^[a-z0-9][a-z0-9-]{1,180}$'
    order by issue.severity desc, issue.first_detected_at, issue.issue_key
    for update of issue skip locked
    limit greatest(1, least(coalesce(p_limit, 3), 12))
  loop
    provider := case when item.source_site = 'phimapi' then 'kkphim' else 'ophim' end;

    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies'
        || '?slug=' || item.slug
        || '&provider=' || provider
        || '&episodes=1&strict_missing_detail=1',
      headers := jsonb_build_object('x-cron-secret', cron_secret),
      timeout_milliseconds := 120000
    )
    into request_id;

    update public.catalog_integrity_issues
    set
      status = 'repairing',
      attempts = attempts + 1,
      last_error = null,
      evidence = evidence || jsonb_build_object(
        'repair_provider', provider,
        'repair_request_id', request_id,
        'repair_dispatched_at', now()
      )
    where issue_key = item.issue_key;

    dispatched := dispatched + 1;
  end loop;

  return jsonb_build_object('dispatched', dispatched);
end;
$$;

revoke all on function public.dispatch_catalog_source_repairs(integer)
  from public, anon, authenticated;
grant execute on function public.dispatch_catalog_source_repairs(integer)
  to service_role;

update public.catalog_integrity_issues issue
set status = 'resolved',
    resolved_at = now(),
    last_detected_at = now()
from public.movies movie
where movie.id = issue.movie_id
  and issue.status in ('open', 'repairing')
  and issue.issue_type = 'published_without_playback'
  and lower(coalesce(movie.source_site, '')) = 'tmdb-catalog';

do $scheduler$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job
      where jobname = 'dispatch-catalog-source-repairs-every-2-minutes'
    ) then
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'dispatch-catalog-source-repairs-every-2-minutes';
    end if;

    perform cron.schedule(
      'dispatch-catalog-source-repairs-every-2-minutes',
      '1-59/2 * * * *',
      $cmd$select public.dispatch_catalog_source_repairs(3);$cmd$
    );
  end if;
end;
$scheduler$;

select public.dispatch_catalog_source_repairs(3);
select public.reconcile_catalog_source_repairs();

comment on function public.dispatch_catalog_source_repairs(integer) is
  'Bounded targeted repair dispatcher for OPhim/KKPhim catalogue integrity issues.';
