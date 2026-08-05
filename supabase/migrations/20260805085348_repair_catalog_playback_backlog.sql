-- Repair the existing bounded catalogue-repair path instead of introducing a
-- second scheduler. Attempts alternate between OPhim and KKPhim by stable movie
-- identity, then quarantine only rows that remain provably unplayable.

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
    order by issue.severity desc, issue.first_detected_at, issue.issue_key
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

create or replace function public.quarantine_exhausted_catalog_playback()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quarantined_ids uuid[] := array[]::uuid[];
  quarantined_slugs text[] := array[]::text[];
  quarantined_count integer := 0;
begin
  perform public.reconcile_catalog_source_repairs();

  with candidates as materialized (
    select movie.id, movie.slug
    from public.catalog_integrity_issues issue
    join public.movies movie on movie.id = issue.movie_id
    where issue.status = 'open'
      and issue.issue_type = 'published_without_playback'
      and issue.attempts >= 3
      and movie.is_published is true
      and lower(coalesce(movie.source_site, '')) in ('ophim', 'ophim1.com', 'phimapi')
      and lower(coalesce(movie.status, '')) not in ('upcoming', 'trailer')
      and lower(coalesce(movie.episode_current, '')) !~ '(trailer|sắp chiếu|sap chieu)'
      and not exists (
        select 1 from public.movie_episodes episode
        where episode.movie_id = movie.id
          and (nullif(trim(coalesce(episode.link_m3u8, '')), '') is not null
            or nullif(trim(coalesce(episode.link_embed, '')), '') is not null)
      )
      and not exists (
        select 1 from public.episodes episode
        where episode.movie_id = movie.id
          and (nullif(trim(coalesce(episode.link_m3u8, '')), '') is not null
            or nullif(trim(coalesce(episode.link_embed, '')), '') is not null)
      )
      and not exists (
        select 1 from public.streams stream
        where stream.movie_id = movie.id
          and stream.is_active is true
          and (nullif(trim(coalesce(stream.stream_url, '')), '') is not null
            or nullif(trim(coalesce(stream.embed_url, '')), '') is not null)
      )
    limit 100
  ), updated as (
    update public.movies movie
    set is_published = false,
        updated_at = now()
    from candidates candidate
    where movie.id = candidate.id
    returning movie.id, movie.slug
  )
  select
    coalesce(array_agg(id), array[]::uuid[]),
    coalesce(array_agg(slug), array[]::text[]),
    count(*)
  into quarantined_ids, quarantined_slugs, quarantined_count
  from updated;

  if quarantined_count > 0 then
    update public.catalog_integrity_issues
    set status = 'resolved',
        resolved_at = now(),
        last_detected_at = now(),
        last_error = 'Hidden after three provider repairs produced no playable source',
        evidence = evidence || jsonb_build_object('quarantined_at', now())
    where movie_id = any(quarantined_ids)
      and issue_type = 'published_without_playback';

    update public.movie_api_cache
    set expires_at = now()
    where slug = any(quarantined_slugs);
  end if;

  return jsonb_build_object('quarantined', quarantined_count);
end;
$$;

revoke all on function public.quarantine_exhausted_catalog_playback()
  from public, anon, authenticated;
grant execute on function public.quarantine_exhausted_catalog_playback()
  to service_role;

do $scheduler$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.alter_job(
    jobid,
    schedule := '52 */2 * * *',
    command := 'select public.scan_catalog_integrity(750);',
    active := true
  )
  from cron.job
  where jobname = 'scan-catalog-integrity-every-10-minutes';

  perform cron.alter_job(
    jobid,
    schedule := '4,19,34,49 * * * *',
    command := $command$
      select public.dispatch_catalog_source_repairs(3);
      select public.quarantine_exhausted_catalog_playback();
    $command$,
    active := true
  )
  from cron.job
  where jobname = 'dispatch-catalog-source-repairs-every-2-minutes';
end;
$scheduler$;

select public.scan_catalog_integrity(750);
select public.dispatch_catalog_source_repairs(3);
select public.quarantine_exhausted_catalog_playback();

comment on function public.dispatch_catalog_source_repairs(integer) is
  'Bounded repair dispatcher alternating OPhim and KKPhim by stable movie identity.';
comment on function public.quarantine_exhausted_catalog_playback() is
  'Hides only published provider rows still lacking every playable source after three bounded repair attempts.';
