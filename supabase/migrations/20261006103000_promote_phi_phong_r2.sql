begin;

do $$
declare
  target_movie_id uuid;
begin
  select id
  into target_movie_id
  from public.movies
  where slug = 'phi-phong-quy-mau-rung-thieng'
  limit 1;

  if target_movie_id is null then
    raise exception 'Phí Phông movie row was not found';
  end if;

  update public.movies
  set
    name = 'Phí Phông Bản Đẹp: Quỷ Máu Rừng Thiêng',
    title_vi = 'Phí Phông Bản Đẹp: Quỷ Máu Rừng Thiêng',
    normalized_name = 'phi phong ban dep quy mau rung thieng',
    quality = 'FHD',
    lang = 'Vietsub',
    episode_current = 'Full',
    source_site = 'khophim-r2',
    source_name = 'KhoPhim R2',
    is_published = true,
    seo_catalog_status = 'published',
    published_at = now(),
    last_episode_change_at = now(),
    updated_at = now()
  where id = target_movie_id;

  update public.movie_episodes
  set
    is_backup = true,
    updated_at = now()
  where movie_id = target_movie_id
    and episode_number = 1
    and source is distinct from 'khophim-r2';

  insert into public.movie_episodes (
    movie_id,
    episode_number,
    episode_name,
    slug,
    server_name,
    link_m3u8,
    link_embed,
    thumbnail_url,
    duration,
    source,
    is_backup,
    subtitle_url,
    audio_type,
    created_at,
    updated_at
  ) values (
    target_movie_id,
    1,
    'Full',
    'full',
    'KhoPhim R2 · Bản đẹp',
    'https://khophim.org/hls/ph%C3%AD%20ph%C3%B4ng/%E8%A1%80%E9%AD%94%20Ph%C3%AD%20Ph%C3%B4ng%20Qu%E1%BB%B7%20M%C3%A1u%20R%E1%BB%ABng%20Thi%C3%AAng.2026.HD1080P.%E5%AE%98%E6%96%B9%E8%B6%8A%E5%8D%97%E8%AF%AD%E4%B8%AD%E5%AD%97.m3u8',
    '',
    '',
    '2:00:00',
    'khophim-r2',
    false,
    '',
    'vietsub',
    now(),
    now()
  )
  on conflict (movie_id, server_name, episode_number)
  do update set
    episode_name = excluded.episode_name,
    slug = excluded.slug,
    link_m3u8 = excluded.link_m3u8,
    link_embed = excluded.link_embed,
    thumbnail_url = excluded.thumbnail_url,
    duration = excluded.duration,
    source = excluded.source,
    is_backup = excluded.is_backup,
    subtitle_url = excluded.subtitle_url,
    audio_type = excluded.audio_type,
    updated_at = now();
end $$;

commit;
