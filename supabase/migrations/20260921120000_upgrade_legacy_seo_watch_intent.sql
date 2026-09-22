-- Upgrade only the recognisable legacy generated metadata. Editorial reviews,
-- focus keywords, canonical paths, images, FAQs and topic links are preserved.
-- New metadata consistently targets watch intent without claiming a release
-- state such as trailer-only or upcoming.

create temporary table seo_watch_intent_upgrade on commit drop as
select profile.movie_id,
       movie.slug,
       movie.name,
       movie.origin_name,
       movie.year,
       profile.version + 1 as next_version,
       case
         when char_length('Xem Phim ' || movie.name ||
              case when coalesce(movie.year,0) > 0 then ' (' || movie.year || ')' else '' end ||
              ' Vietsub | KhoPhim') <= 68
           then 'Xem Phim ' || movie.name ||
              case when coalesce(movie.year,0) > 0 then ' (' || movie.year || ')' else '' end ||
              ' Vietsub | KhoPhim'
         when char_length('Xem Phim ' || movie.name || ' | KhoPhim') <= 68
           then 'Xem Phim ' || movie.name || ' | KhoPhim'
         else left('Xem Phim ' || movie.name,56) || ' | KhoPhim'
       end as next_title,
       (
         'Xem phim ' || movie.name ||
         case
           when nullif(trim(coalesce(movie.origin_name,'')),'') is not null
             and lower(trim(movie.origin_name)) <> lower(trim(movie.name))
             then ' (' || trim(movie.origin_name) || ')'
           else ''
         end ||
         case when coalesce(movie.year,0) > 0 then ' ' || movie.year else '' end ||
         ' Vietsub, thuyết minh, full HD tại KhoPhim. Nội dung, diễn viên và các tập phim được cập nhật đầy đủ.'
       ) as next_meta
from public.movie_seo_profiles profile
join public.movies movie on movie.id = profile.movie_id
where profile.status = 'published'
  and (
    profile.meta_description ilike '%trailer%'
    or profile.meta_description ilike '%lịch phát hành%'
    or profile.seo_title ilike '%thông tin phim%'
    or not exists (
      select 1
      from unnest(coalesce(profile.secondary_keywords,array[]::text[])) keyword
      where lower(keyword) like 'xem phim %'
    )
  );

update public.movie_seo_profiles profile
set seo_title = upgrade.next_title,
    meta_description = case
      when char_length(upgrade.next_meta) > 160 then left(upgrade.next_meta,157) || '...'
      when char_length(upgrade.next_meta) < 100 then upgrade.next_meta || ' Xem online nhanh, rõ nét.'
      else upgrade.next_meta
    end,
    secondary_keywords = (
      select array_agg(keyword order by ordinal)
      from (
        select distinct on (lower(trim(value))) trim(value) as keyword, ordinal
        from unnest(
          coalesce(profile.secondary_keywords,array[]::text[])
          || array[
            'xem phim ' || upgrade.name,
            upgrade.name || ' vietsub',
            upgrade.name || ' thuyết minh',
            upgrade.name || ' full'
          ]
        ) with ordinality as source(value,ordinal)
        where nullif(trim(value),'') is not null
        order by lower(trim(value)), ordinal
      ) unique_keywords
    ),
    index_mode = case when profile.index_mode = 'auto' then 'index' else profile.index_mode end,
    version = upgrade.next_version,
    live_audit = jsonb_build_object(
      'passed',false,
      'mode','static-content-refresh-pending',
      'checked_at',now(),
      'url','https://khophim.org/phim/' || upgrade.slug,
      'status',0,
      'checks',jsonb_build_array(jsonb_build_object(
        'code','legacy_watch_intent_upgrade',
        'passed',true,
        'message','Metadata cũ đã được nâng cấp sang mục đích tìm kiếm xem phim và đang chờ bản HTML tĩnh mới.'
      ))
    ),
    last_audited_at = now(),
    updated_at = now()
from seo_watch_intent_upgrade upgrade
where profile.movie_id = upgrade.movie_id;

update public.seo_static_release_requests request
set reason = 'seo_profile_watch_intent_upgrade',
    release_lane = 'urgent',
    requested_version = upgrade.next_version,
    requested_at = now(),
    automatic_retry_count = 0,
    next_retry_at = null,
    error_message = null
from seo_watch_intent_upgrade upgrade
join public.movies movie on movie.id = upgrade.movie_id
where request.movie_id = upgrade.movie_id
  and request.status = 'pending'
  and movie.is_published = true
  and public.movie_has_usable_persisted_playback(movie.id);

insert into public.seo_static_release_requests (
  movie_id,slug,reason,release_lane,requested_version,status,requested_at,
  automatic_retry_count,next_retry_at
)
select upgrade.movie_id,upgrade.slug,'seo_profile_watch_intent_upgrade','urgent',
       upgrade.next_version,'pending',now(),0,null
from seo_watch_intent_upgrade upgrade
join public.movies movie on movie.id = upgrade.movie_id
where movie.is_published = true
  and public.movie_has_usable_persisted_playback(movie.id)
  and not exists (
    select 1 from public.seo_static_release_requests request
    where request.movie_id = upgrade.movie_id
      and request.status in ('pending','processing')
  );

select public.reconcile_published_seo_releases(200);
