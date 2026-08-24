-- BLVietsub's original post and player host are offline; its OK/VK embeds for
-- episodes 4-8 are deleted or region-blocked. Correct the legacy identity so
-- future provider repair can find the 2023 series, and add browser-verified
-- Dailymotion English-sub rescue embeds without deleting the old evidence.

do $repair$
declare
  v_movie_id uuid;
begin
  select id into v_movie_id
  from public.movies
  where slug='blvietsub-5979-du-bao-cam-giac-co-the'
  for update;

  if v_movie_id is null then
    raise exception 'Target movie not found';
  end if;

  if exists(
    select 1 from public.movies
    where imdb_id='tt28775754' and id<>v_movie_id and superseded_by_movie_id is null
  ) then
    raise exception 'Conflicting IMDb identity tt28775754 already exists';
  end if;

  update public.movies
  set origin_name='My Personal Weatherman',
      title_en='My Personal Weatherman',
      title_original='Taikan Yoho',
      original_title='Taikan Yoho',
      normalized_name='du-bao-cam-giac-co-the-my-personal-weatherman-taikan-yoho',
      year=2023,
      type='series',
      status='completed',
      imdb_id='tt28775754',
      episode_current='Hoàn Tất (8/8)',
      episode_total='8 Tập',
      current_episode=8,
      total_episodes=8,
      catalog_source=coalesce(nullif(catalog_source,''),'blvietsub'),
      canonicalized_at=now(),
      updated_at=now()
  where id=v_movie_id;

  perform * from public.resolve_canonical_movie(
    p_provider=>'blvietsub',
    p_provider_slug=>'5979-du-bao-cam-giac-co-the',
    p_provider_id=>'5979',
    p_tmdb_id=>null,
    p_imdb_id=>'tt28775754',
    p_original_title=>'Taikan Yoho',
    p_localized_title=>'Dự Báo Cảm Giác Cơ Thể',
    p_year=>2023,
    p_movie_type=>'series',
    p_season=>null,
    p_create_slug=>'blvietsub-5979-du-bao-cam-giac-co-the',
    p_source_name=>'BLVietsub'
  );

  update public.streams
  set server_name='Verified Dailymotion - English Sub',updated_at=now()
  where movie_id=v_movie_id and source='dailymotion-rescue'
    and server_name='Dailymotion - English Sub';

  insert into public.streams (
    movie_id,episode_slug,source,server_name,stream_url,embed_url,subtitle_url,
    quality,priority,is_active,health_status,last_checked_at,last_success_at,
    response_time_ms,failure_count,last_error,audio_type,updated_at
  ) values
    (v_movie_id,'tap-4','dailymotion-rescue','Verified Dailymotion - English Sub','','https://www.dailymotion.com/embed/video/x950qoy?autoplay=1','','HD',260,true,'ok',now(),now(),null,0,'Browser verified 2026-08-22',null,now()),
    (v_movie_id,'tap-5','dailymotion-rescue','Verified Dailymotion - English Sub','','https://www.dailymotion.com/embed/video/x950qoe?autoplay=1','','HD',260,true,'ok',now(),now(),null,0,'Browser verified 2026-08-22',null,now()),
    (v_movie_id,'tap-6','dailymotion-rescue','Verified Dailymotion - English Sub','','https://www.dailymotion.com/embed/video/x950qoc?autoplay=1','','HD',260,true,'ok',now(),now(),null,0,'Browser verified 2026-08-22',null,now()),
    (v_movie_id,'tap-7','dailymotion-rescue','Verified Dailymotion - English Sub','','https://www.dailymotion.com/embed/video/x950qog?autoplay=1','','HD',260,true,'ok',now(),now(),null,0,'Browser verified 2026-08-22',null,now()),
    (v_movie_id,'tap-8','dailymotion-rescue','Verified Dailymotion - English Sub','','https://www.dailymotion.com/embed/video/x8pkbcn?autoplay=1','','HD',260,true,'ok',now(),now(),null,0,'Browser verified 2026-08-22',null,now())
  on conflict(movie_id,episode_slug,source,server_name) do update set
    stream_url=excluded.stream_url,
    embed_url=excluded.embed_url,
    priority=excluded.priority,
    is_active=true,
    health_status='ok',
    last_checked_at=now(),
    last_success_at=now(),
    failure_count=0,
    last_error=excluded.last_error,
    audio_type=excluded.audio_type,
    updated_at=now();

  insert into public.catalog_integrity_issues (
    issue_key,issue_type,movie_id,severity,confidence,status,evidence,
    first_detected_at,last_detected_at,resolved_at,attempts,last_error
  ) values (
    'manual_playback_repair:'||v_movie_id::text||':episodes-4-8',
    'external_source_failure',v_movie_id,5,1,'resolved',
    jsonb_build_object(
      'episodes',jsonb_build_array(4,5,6,7,8),
      'dead_hosts',jsonb_build_array('player.blvietsub.com','vk.com','ok.ru'),
      'rescue_source','dailymotion-rescue',
      'rescue_language','english_sub'
    ),now(),now(),now(),1,null
  ) on conflict(issue_key) do update set
    status='resolved',evidence=excluded.evidence,last_detected_at=now(),resolved_at=now(),last_error=null;

  perform public.enqueue_movie_refresh(v_movie_id,'personal_weatherman_playback_repaired');
  perform public.reconcile_movie_release_state(v_movie_id);
  delete from public.movie_api_cache where slug='blvietsub-5979-du-bao-cam-giac-co-the';
  delete from public.home_page_cache where id<>'__never__';
end;
$repair$;
