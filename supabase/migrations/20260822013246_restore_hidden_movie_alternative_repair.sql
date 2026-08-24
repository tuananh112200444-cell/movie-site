-- Hidden OPhim trailer rows already failed their primary source. The legacy
-- dispatcher retried OPhim three times and its cron was stranded inactive, so
-- newly available KKPhim Full episodes never promoted the movie.

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

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'CRON_SECRET'
  order by created_at desc
  limit 1;

  if nullif(cron_secret, '') is null then
    return jsonb_build_object('dispatched', 0, 'error', 'CRON_SECRET unavailable');
  end if;

  for item in
    select issue.issue_key,
           issue.issue_type,
           issue.movie_id,
           issue.attempts,
           issue.evidence,
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
    provider := case
      -- The primary provider already produced zero playable coverage. Try the
      -- independent counterpart first instead of repeating the same trailer.
      when item.issue_type = 'published_without_playback' and item.source_site = 'phimapi' then 'ophim'
      when item.issue_type = 'published_without_playback' then 'kkphim'
      -- Count mismatches may be a transient primary-source write gap; alternate
      -- only after the first bounded retry.
      when item.source_site = 'phimapi' and item.attempts % 2 = 0 then 'kkphim'
      when item.source_site = 'phimapi' then 'ophim'
      when item.attempts % 2 = 0 then 'ophim'
      else 'kkphim'
    end;

    select net.http_get(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/sync-ophim-movies'
        || '?slug=' || item.slug
        || '&provider=' || provider
        || '&episodes=1&strict_missing_detail=1',
      headers := jsonb_build_object('x-cron-secret', cron_secret),
      timeout_milliseconds := 120000
    ) into request_id;

    update public.catalog_integrity_issues
    set status = 'repairing',
        attempts = attempts + 1,
        last_error = null,
        evidence = evidence || jsonb_build_object(
          'repair_provider', provider,
          'repair_request_id', request_id,
          'repair_dispatched_at', now(),
          'repair_contract', 'alternative_provider_first_v2'
        )
    where issue_key = item.issue_key;

    dispatched := dispatched + 1;
  end loop;

  return jsonb_build_object('dispatched', dispatched, 'contract', 'alternative_provider_first_v2');
end;
$$;

revoke all on function public.dispatch_catalog_source_repairs(integer)
  from public, anon, authenticated;
grant execute on function public.dispatch_catalog_source_repairs(integer)
  to service_role;

insert into public.runtime_capacity_managed_jobs(job_name)
values
  ('dispatch-catalog-source-repairs-every-2-minutes'),
  ('dispatch-catalog-source-repairs-peak-guard')
on conflict(job_name) do update
set paused_by_capacity_guard = false,
    paused_at = null,
    updated_at = now();

do $scheduler$
begin
  perform cron.alter_job(
    jobid,
    schedule := '4,19,34,49 0-3,8-11,17-23 * * *',
    active := true
  )
  from cron.job
  where jobname = 'dispatch-catalog-source-repairs-every-2-minutes';

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'dispatch-catalog-source-repairs-peak-guard';

  perform cron.schedule(
    'dispatch-catalog-source-repairs-peak-guard',
    '19,49 4-7,12-16 * * *',
    $cmd$select public.dispatch_catalog_source_repairs(1);$cmd$
  );

  if exists (
    select 1 from public.runtime_capacity_state
    where singleton = true and mode = 'protect'
  ) then
    update public.runtime_capacity_managed_jobs
    set paused_by_capacity_guard = true,
        paused_at = now(),
        updated_at = now()
    where job_name in (
      'dispatch-catalog-source-repairs-every-2-minutes',
      'dispatch-catalog-source-repairs-peak-guard'
    );

    perform cron.alter_job(jobid, active := false)
    from cron.job
    where jobname in (
      'dispatch-catalog-source-repairs-every-2-minutes',
      'dispatch-catalog-source-repairs-peak-guard'
    );
  end if;
end;
$scheduler$;

select public.reconcile_catalog_source_repairs();

comment on function public.dispatch_catalog_source_repairs(integer) is
  'Bounded trailer/coverage repair: published_without_playback tries the independent OPhim/KKPhim counterpart first; count mismatches alternate after one primary retry.';
