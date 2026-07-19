-- Do not advertise records that have neither persisted episodes nor a live
-- fallback. Sync jobs may republish them once a playable source is available.
update public.movies
set is_published=false, updated_at=now()
where slug in (
  'teach-you-a-lesson-2026',
  'dazzling-2026',
  'the-first-jasmine-mo-li',
  'the-jinx-the-life-and-deaths-of-robert-durst-phan-1'
)
and not exists(select 1 from public.movie_episodes me where me.movie_id=movies.id and (nullif(trim(me.link_m3u8),'') is not null or nullif(trim(me.link_embed),'') is not null))
and not exists(select 1 from public.episodes e where e.movie_id=movies.id and (nullif(trim(e.link_m3u8),'') is not null or nullif(trim(e.link_embed),'') is not null))
and not exists(select 1 from public.streams s where s.movie_id=movies.id and s.is_active=true and (nullif(trim(s.stream_url),'') is not null or nullif(trim(s.embed_url),'') is not null));

update public.movies
set episode_current='Tập 9', updated_at=now()
where slug='nhung-cuoc-phieu-luu-rung-ron-cua-sabrina-phan-22'
  and current_episode=9;

delete from public.movie_api_cache where slug in (
  'teach-you-a-lesson-2026','dazzling-2026','the-first-jasmine-mo-li',
  'the-jinx-the-life-and-deaths-of-robert-durst-phan-1',
  'nhung-cuoc-phieu-luu-rung-ron-cua-sabrina-phan-22'
);
delete from public.home_page_cache where id <> '__never__';
