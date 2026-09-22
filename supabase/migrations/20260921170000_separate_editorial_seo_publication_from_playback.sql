-- An approved SEO profile publishes a movie information page independently
-- from playback. Keep movies.is_published and its source-health trigger as the
-- authority for watch/catalogue availability only.
create or replace function public.reconcile_published_seo_releases(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  item record;
  queued_count integer := 0;
  pending_count integer := 0;
  exhausted_count integer := 0;
  retry_count integer;
  audit_time timestamptz := now();
begin
  for item in
    select profile.movie_id,profile.slug,profile.version,profile.live_audit,
           release.id as release_id,release.status as release_status,
           coalesce(release.automatic_retry_count,0) as release_retry_count,
           release.next_retry_at
    from public.movie_seo_profiles profile
    join public.movies movie on movie.id=profile.movie_id
    left join lateral (
      select request.id,request.status,request.automatic_retry_count,request.next_retry_at
      from public.seo_static_release_requests request
      where request.movie_id=profile.movie_id
      order by request.requested_at desc,request.id desc
      limit 1
    ) release on true
    where profile.status='published'
      and profile.index_mode='index'
      and profile.validation_score>=85
      and movie.superseded_by_movie_id is null
    order by profile.updated_at desc
    limit greatest(1,least(coalesce(p_limit,50),200))
  loop
    if item.release_status in ('pending','processing') then
      pending_count := pending_count + 1;
      continue;
    end if;
    if item.release_status='deployed'
       and coalesce(item.live_audit->>'passed','false')='true' then
      continue;
    end if;

    retry_count := case
      when item.live_audit->>'mode'='playback-blocked' then 0
      when item.release_status='failed' then item.release_retry_count+1
      else 0
    end;
    if retry_count>3 then
      exhausted_count := exhausted_count+1;
      continue;
    end if;
    if item.next_retry_at is not null and item.next_retry_at>audit_time
       and item.live_audit->>'mode'<>'playback-blocked' then
      continue;
    end if;

    if item.live_audit->>'mode'='playback-blocked' then
      update public.movie_seo_profiles
      set live_audit=jsonb_build_object(
            'passed',false,
            'mode','static-build-pending',
            'checked_at',audit_time,
            'url','https://khophim.org/phim/' || item.slug,
            'status',0,
            'checks',jsonb_build_array(jsonb_build_object(
              'code','editorial_seo_release_queued',
              'passed',true,
              'message','Hồ sơ SEO đã duyệt; trang thông tin đang chờ HTML và sitemap, độc lập với nguồn phát.'
            ))
          ),
          last_audited_at=audit_time,
          updated_at=audit_time
      where movie_id=item.movie_id;
    end if;

    if item.release_id is not null and item.release_status='failed' then
      update public.seo_static_release_requests
      set status='pending',
          reason='seo_profile_editorial_recovery',
          release_lane='urgent',
          requested_version=item.version,
          requested_at=audit_time,
          processing_started_at=null,
          deployed_at=null,
          deployment_url=null,
          error_message=null,
          automatic_retry_count=retry_count,
          next_retry_at=null
      where id=item.release_id;
    else
      insert into public.seo_static_release_requests (
        movie_id,slug,reason,release_lane,requested_version,status,requested_at,
        automatic_retry_count,next_retry_at
      ) values (
        item.movie_id,item.slug,'seo_profile_editorial_recovery','urgent',
        item.version,'pending',audit_time,retry_count,null
      );
    end if;
    queued_count := queued_count+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'queued',queued_count,
    'already_pending',pending_count,
    'retry_exhausted',exhausted_count,
    'checked_at',audit_time
  );
end;
$function$;

revoke all on function public.reconcile_published_seo_releases(integer) from public, anon, authenticated;
grant execute on function public.reconcile_published_seo_releases(integer) to service_role;

comment on function public.reconcile_published_seo_releases(integer) is
  'Reconciles approved movie information pages with static publication independently of playback catalogue visibility.';
