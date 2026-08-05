-- Viewer-visible episode gaps must not wait behind the private playback
-- backlog. Reuse the existing bounded dispatcher and only change its ordering.

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
        and coalesce(
          (select movie.current_episode from public.movies movie where movie.id = issue.movie_id),
          (issue.evidence->>'advertised')::integer,
          0
        ) <= greatest(
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
      or (
        issue.issue_type = 'episode_sequence_gap'
        and jsonb_typeof(issue.evidence->'missing') = 'array'
        and not exists (
          select 1
          from jsonb_array_elements_text(issue.evidence->'missing') missing(value)
          where missing.value ~ '^[0-9]+$'
            and not exists (
              select 1
              from public.movie_episodes episode
              where episode.movie_id = issue.movie_id
                and episode.episode_number = missing.value::integer
                and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
              union all
              select 1
              from public.episodes episode
              where episode.movie_id = issue.movie_id
                and episode.episode_number = missing.value::integer
                and (coalesce(episode.link_m3u8, '') <> '' or coalesce(episode.link_embed, '') <> '')
            )
        )
      )
    );
  get diagnostics resolved_count = row_count;

  update public.catalog_integrity_issues
  set
    status = 'open',
    last_error = case
      when attempts >= 3 then 'Targeted source repair exhausted; upstream detail or playable episode is unavailable'
      else 'Targeted source repair did not produce the required playable coverage; retry scheduled'
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
      issue.attempts,
      lower(coalesce(movie.source_site, '')) as source_site
    from public.catalog_integrity_issues issue
    join public.movies movie on movie.id = issue.movie_id
    where issue.status = 'open'
      and issue.issue_type in (
        'published_without_playback',
        'episode_count_mismatch',
        'episode_sequence_gap'
      )
      and issue.attempts < 3
      and lower(coalesce(movie.source_site, '')) in ('ophim', 'ophim1.com', 'phimapi')
    order by
      case
        when movie.is_published is true
          and issue.issue_type in ('episode_count_mismatch', 'episode_sequence_gap')
          then 0
        when movie.is_published is true then 1
        else 2
      end,
      issue.severity desc,
      issue.first_detected_at,
      issue.issue_key
    for update of issue skip locked
    limit greatest(1, least(coalesce(p_limit, 3), 6))
  loop
    provider := case
      when item.attempts = 0 and item.source_site = 'phimapi' then 'kkphim'
      when item.attempts = 0 then 'ophim'
      when item.source_site = 'phimapi' then 'ophim'
      else 'kkphim'
    end;

    select net.http_get(
      url := 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies'
        || '?movie_id=' || item.movie_id
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
        'repair_movie_id', item.movie_id,
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

comment on function public.dispatch_catalog_source_repairs(integer) is
  'Bounded alternate-provider repair dispatcher prioritizing public episode gaps over the private playback backlog.';

comment on function public.reconcile_catalog_source_repairs() is
  'Resolves playback, count and sequence-gap repairs only after the required playable rows are persisted.';

select public.dispatch_catalog_source_repairs(6);
