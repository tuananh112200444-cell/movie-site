begin;

create temporary table target_kkphim_source_fix on commit drop as
select * from public.streams
where lower(trim(coalesce(source,'')))='ophim'
  and lower(trim(coalesce(provider_key,'')))='kkphim'
for update;

create temporary table duplicate_kkphim_source_fix on commit drop as
select old.id old_id,canonical.id canonical_id
from target_kkphim_source_fix old
join public.streams canonical
  on canonical.movie_id=old.movie_id
 and canonical.episode_slug=old.episode_slug
 and canonical.server_name=old.server_name
 and lower(trim(coalesce(canonical.source,'')))='phimapi'
 and coalesce(canonical.stream_url,'')=coalesce(old.stream_url,'')
 and coalesce(canonical.embed_url,'')=coalesce(old.embed_url,'')
for update of canonical;

update public.streams canonical
set
  is_active=canonical.is_active or old.is_active,
  priority=greatest(coalesce(canonical.priority,0),coalesce(old.priority,0)),
  playback_score=greatest(coalesce(canonical.playback_score,-100000),coalesce(old.playback_score,-100000)),
  health_status=case when coalesce(old.playback_score,-100000)>coalesce(canonical.playback_score,-100000) then old.health_status else canonical.health_status end,
  last_checked_at=greatest(canonical.last_checked_at,old.last_checked_at),
  last_success_at=greatest(canonical.last_success_at,old.last_success_at),
  last_failure_at=greatest(canonical.last_failure_at,old.last_failure_at),
  response_time_ms=case when coalesce(old.playback_score,-100000)>coalesce(canonical.playback_score,-100000) then old.response_time_ms else canonical.response_time_ms end,
  failure_count=least(coalesce(canonical.failure_count,0),coalesce(old.failure_count,0)),
  last_error=case when coalesce(old.playback_score,-100000)>coalesce(canonical.playback_score,-100000) then old.last_error else canonical.last_error end,
  viewer_success_sessions=greatest(coalesce(canonical.viewer_success_sessions,0),coalesce(old.viewer_success_sessions,0)),
  viewer_failure_sessions=greatest(coalesce(canonical.viewer_failure_sessions,0),coalesce(old.viewer_failure_sessions,0)),
  viewer_stall_sessions=greatest(coalesce(canonical.viewer_stall_sessions,0),coalesce(old.viewer_stall_sessions,0)),
  viewer_watch_seconds=greatest(coalesce(canonical.viewer_watch_seconds,0),coalesce(old.viewer_watch_seconds,0)),
  viewer_stall_seconds=greatest(coalesce(canonical.viewer_stall_seconds,0),coalesce(old.viewer_stall_seconds,0)),
  viewer_startup_ms=case
    when canonical.viewer_startup_ms is null then old.viewer_startup_ms
    when old.viewer_startup_ms is null then canonical.viewer_startup_ms
    else least(canonical.viewer_startup_ms,old.viewer_startup_ms)
  end,
  viewer_last_success_at=greatest(canonical.viewer_last_success_at,old.viewer_last_success_at),
  viewer_last_failure_at=greatest(canonical.viewer_last_failure_at,old.viewer_last_failure_at),
  updated_at=now()
from duplicate_kkphim_source_fix d
join target_kkphim_source_fix old on old.id=d.old_id
where canonical.id=d.canonical_id;

update public.streams s
set source='phimapi',updated_at=now()
from target_kkphim_source_fix t
where s.id=t.id
  and not exists(select 1 from duplicate_kkphim_source_fix d where d.old_id=s.id);

update public.streams s
set source='phimapi-legacy-duplicate',is_active=false,updated_at=now()
from duplicate_kkphim_source_fix d
where s.id=d.old_id;

commit;
