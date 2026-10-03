begin;

with upserted_movie as (
  insert into public.movies (
    slug, name, origin_name, title_vi, title_en, title_original,
    normalized_name, content, type, status, thumb_url, poster_url,
    hero_backdrop_url, hero_poster_url, quality, lang, time,
    episode_current, episode_total, year, actor, director, category, country,
    trailer_url, notify, showtimes, source_url, source_site, source_name,
    is_published, seo_catalog_status, catalog_source, canonical_identity_key,
    release_at, published_at, last_episode_change_at, updated_at
  ) values (
    'tham-tu-lung-danh-conan-vu-an-mang-so-30',
    'Thám Tử Lừng Danh Conan – Bản Kỷ Niệm 30 Năm: Vụ Án Mạng Số 30',
    'Detective Conan: The Counterfeit Case of Ultra 30',
    'Thám Tử Lừng Danh Conan – Bản Kỷ Niệm 30 Năm: Vụ Án Mạng Số 30',
    'Detective Conan: The Counterfeit Case of Ultra 30',
    '名探偵コナン 30号殺人事件',
    'tham tu lung danh conan ban ky niem 30 nam vu an mang so 30',
    'Khi mẫu tiền 10.000 yên mới mang hình Tháp Touto được phát hành, Conan, Đội Thám tử nhí, tiến sĩ Agasa, Ran và Sonoko tới tham quan nhà máy in tiền tại Nagano. Cùng lúc đó, cảnh sát phát hiện một tờ tiền giả tại hiện trường án mạng ở Tokyo. Vụ việc nhanh chóng phát triển thành cuộc điều tra quy mô toàn quốc, buộc Conan và Heiji phải lần theo dấu vết tới một nhà máy tại Osaka để ngăn chặn cuộc khủng hoảng tiền giả.',
    'single', 'completed',
    'https://www.ytv.co.jp/conan/30go/ogp.jpg',
    'https://img.anili.st/media/217126',
    'https://www.ytv.co.jp/conan/30go/ogp.jpg',
    'https://img.anili.st/media/217126',
    'FHD', 'Vietsub', '1 giờ 33 phút', 'Full', '1 tập', 2026,
    array['Minami Takayama','Wakana Yamazaki','Rikiya Koyama','Megumi Hayashibara','Ryo Horikawa','Yuko Miyamura'],
    array['Nobuharu Kamanaka'],
    '[{"id":"mystery","name":"Bí Ẩn","slug":"bi-an"},{"id":"crime","name":"Hình Sự","slug":"hinh-su"},{"id":"action","name":"Hành Động","slug":"hanh-dong"},{"id":"adventure","name":"Phiêu Lưu","slug":"phieu-luu"},{"id":"drama","name":"Chính Kịch","slug":"chinh-kich"}]'::jsonb,
    '[{"id":"japan","name":"Nhật Bản","slug":"nhat-ban"}]'::jsonb,
    'https://www.youtube.com/watch?v=7-fuiCowhFI',
    'TV Special kỷ niệm 30 năm anime Thám Tử Lừng Danh Conan',
    'Đã phát sóng ngày 25/09/2026 trên Yomiuri TV / Nippon TV',
    'https://www.ytv.co.jp/conan/30go/',
    'https://www.ytv.co.jp/conan/30go/',
    'Yomiuri TV Official',
    true, 'published', 'khophim-r2', 'anilist:217126',
    '2026-09-25T21:00:00+09:00'::timestamptz, now(), now(), now()
  )
  on conflict (slug) do update set
    name = excluded.name,
    origin_name = excluded.origin_name,
    title_vi = excluded.title_vi,
    title_en = excluded.title_en,
    title_original = excluded.title_original,
    normalized_name = excluded.normalized_name,
    content = excluded.content,
    type = excluded.type,
    status = excluded.status,
    thumb_url = excluded.thumb_url,
    poster_url = excluded.poster_url,
    hero_backdrop_url = excluded.hero_backdrop_url,
    hero_poster_url = excluded.hero_poster_url,
    quality = excluded.quality,
    lang = excluded.lang,
    time = excluded.time,
    episode_current = excluded.episode_current,
    episode_total = excluded.episode_total,
    year = excluded.year,
    actor = excluded.actor,
    director = excluded.director,
    category = excluded.category,
    country = excluded.country,
    trailer_url = excluded.trailer_url,
    notify = excluded.notify,
    showtimes = excluded.showtimes,
    source_url = excluded.source_url,
    source_site = excluded.source_site,
    source_name = excluded.source_name,
    is_published = excluded.is_published,
    seo_catalog_status = excluded.seo_catalog_status,
    catalog_source = excluded.catalog_source,
    canonical_identity_key = excluded.canonical_identity_key,
    release_at = excluded.release_at,
    published_at = coalesce(public.movies.published_at, excluded.published_at),
    last_episode_change_at = excluded.last_episode_change_at,
    updated_at = excluded.updated_at
  returning id
)
insert into public.movie_episodes (
  movie_id, episode_number, episode_name, slug, server_name,
  link_m3u8, link_embed, thumbnail_url, duration, source,
  is_backup, subtitle_url, audio_type, created_at, updated_at
)
select
  id, 0, 'Full', 'full', 'KhoPhim R2 · Bảo mật',
  'https://khophim.org/hls/conan/Xem Thám Tử Lừng Danh Conan- Vụ Án Mạng Số 30  Đại Án Tiền Giả (The Counterfeit Case of Ultra 30) - 2026 - Chợ Phim.m3u8',
  '', '', '1:33:19', 'khophim-r2', false, 'https://khophim.org/hls/conan/conan-30-vi.vtt', 'vietsub', now(), now()
from upserted_movie
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

-- Publication truth is enforced before a movie row is written. On the first
-- insert the episode does not exist yet, so publish only after the protected
-- playback row above has been persisted and can pass that check.
update public.movies
set
  is_published = true,
  seo_catalog_status = 'published',
  updated_at = now()
where slug = 'tham-tu-lung-danh-conan-vu-an-mang-so-30';

commit;
