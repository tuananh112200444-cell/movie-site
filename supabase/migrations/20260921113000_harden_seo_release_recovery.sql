-- Make SEO publication self-healing while keeping playback truth authoritative.
-- A URL is restored only when the same production playback predicate used by
-- the catalogue confirms a usable stream. Transient static failures retry at
-- most three times with backoff; permanently unplayable films stay blocked.

alter table public.seo_static_release_requests
  add column if not exists automatic_retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz;

create index if not exists seo_static_release_retry_due_idx
  on public.seo_static_release_requests(status, next_retry_at, requested_at)
  where status in ('pending','failed');

create or replace function public.reconcile_published_seo_releases(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  item record;
  usable boolean;
  needs_release boolean;
  restored_count integer := 0;
  blocked_count integer := 0;
  queued_count integer := 0;
  retry_count integer;
  audit_time timestamptz := now();
begin
  for item in
    select profile.movie_id,
           profile.slug,
           profile.version,
           profile.index_mode,
           profile.validation_score,
           profile.live_audit,
           movie.is_published,
           movie.seo_catalog_status,
           release.id as release_id,
           release.status as release_status,
           coalesce(release.automatic_retry_count,0) as release_retry_count,
           release.next_retry_at
    from public.movie_seo_profiles profile
    join public.movies movie on movie.id = profile.movie_id
    left join lateral (
      select request.id, request.status, request.automatic_retry_count, request.next_retry_at
      from public.seo_static_release_requests request
      where request.movie_id = profile.movie_id
      order by request.requested_at desc
      limit 1
    ) release on true
    where profile.status = 'published'
      and profile.validation_score >= 85
      and movie.superseded_by_movie_id is null
    order by profile.updated_at desc
    limit greatest(1,least(coalesce(p_limit,50),200))
  loop
    usable := public.movie_has_usable_persisted_playback(item.movie_id);

    if not usable then
      update public.movie_seo_profiles
      set live_audit = jsonb_build_object(
            'passed',false,
            'mode','playback-blocked',
            'checked_at',audit_time,
            'url','https://khophim.org/phim/' || item.slug,
            'status',0,
            'checks',jsonb_build_array(jsonb_build_object(
              'code','usable_playback_required',
              'passed',false,
              'message','Trang SEO được giữ lại nhưng tạm chặn xuất bản vì chưa có nguồn phát đã được hệ thống xác minh.'
            ))
          ),
          last_audited_at = audit_time,
          updated_at = audit_time
      where movie_id = item.movie_id
        and coalesce(live_audit->>'mode','') <> 'playback-blocked';
      if found then blocked_count := blocked_count + 1; end if;

      update public.seo_static_release_requests
      set status = 'failed',
          processing_started_at = null,
          next_retry_at = null,
          error_message = 'Publication blocked: no production-verified playable source.'
      where id = item.release_id
        and status in ('pending','processing');
      continue;
    end if;

    needs_release := not item.is_published
      or item.index_mode = 'auto'
      or coalesce(item.live_audit->>'passed','false') <> 'true'
      or item.release_status = 'failed';

    if not item.is_published then
      update public.movies
      set is_published = true,
          seo_catalog_status = 'published',
          updated_at = audit_time
      where id = item.movie_id
        and public.movie_has_usable_persisted_playback(id);
      if found then restored_count := restored_count + 1; end if;
    end if;

    if item.index_mode = 'auto' then
      update public.movie_seo_profiles
      set index_mode = 'index', updated_at = audit_time
      where movie_id = item.movie_id and index_mode = 'auto';
    end if;

    if not needs_release or item.release_status in ('pending','processing') then
      continue;
    end if;

    retry_count := case when item.release_status = 'failed'
      then item.release_retry_count + 1 else 0 end;
    if retry_count > 3
      or (item.next_retry_at is not null and item.next_retry_at > audit_time) then
      continue;
    end if;

    if item.release_id is not null and item.release_status = 'failed' then
      update public.seo_static_release_requests
      set status = 'pending',
          reason = 'seo_profile_auto_recovery',
          release_lane = 'urgent',
          requested_version = item.version,
          requested_at = audit_time,
          processing_started_at = null,
          deployed_at = null,
          deployment_url = null,
          error_message = null,
          automatic_retry_count = retry_count,
          next_retry_at = null
      where id = item.release_id;
    else
      insert into public.seo_static_release_requests (
        movie_id,slug,reason,release_lane,requested_version,status,requested_at,
        automatic_retry_count,next_retry_at
      ) values (
        item.movie_id,item.slug,'seo_profile_auto_recovery','urgent',item.version,
        'pending',audit_time,retry_count,null
      );
    end if;
    queued_count := queued_count + 1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'restored',restored_count,
    'blocked',blocked_count,
    'queued',queued_count,
    'checked_at',audit_time
  );
end;
$function$;

revoke all on function public.reconcile_published_seo_releases(integer) from public, anon, authenticated;
grant execute on function public.reconcile_published_seo_releases(integer) to service_role;

do $scheduler$
declare
  reconcile_job_id bigint;
  overflow_job_id bigint;
  gsc_command text := $cmd$
    select net.http_post(
      url := 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/gsc-seo-feedback',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(
          select decrypted_secret from vault.decrypted_secrets
          where name = 'CRON_SECRET' order by created_at desc limit 1
        )
      ),
      body := '{"inspection_limit":50}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;

  select jobid into reconcile_job_id from cron.job
  where jobname = 'reconcile-published-seo-releases' limit 1;
  if reconcile_job_id is null then
    perform cron.schedule(
      'reconcile-published-seo-releases','7,37 * * * *',
      'select public.reconcile_published_seo_releases(50);'
    );
  else
    perform cron.alter_job(
      job_id := reconcile_job_id,
      schedule := '7,37 * * * *',
      command := 'select public.reconcile_published_seo_releases(50);',
      active := true
    );
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  select jobid into overflow_job_id from cron.job
  where jobname = 'collect-gsc-seo-feedback-overflow' limit 1;
  if overflow_job_id is null then
    perform cron.schedule('collect-gsc-seo-feedback-overflow','52 9 * * *',gsc_command);
  else
    perform cron.alter_job(
      job_id := overflow_job_id,
      schedule := '52 9 * * *',
      command := gsc_command,
      active := true
    );
  end if;
end;
$scheduler$;

select public.reconcile_published_seo_releases(200);
