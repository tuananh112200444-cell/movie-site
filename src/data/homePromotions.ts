import type { MovieItem } from '../types/movie';

export const PINNED_CINEMA_MOVIES = [
  {
    _id: '8fc6cf17-0c4b-4668-8c6d-6b586fb25cff',
    name: 'Phí Phông Bản Đẹp: Quỷ Máu Rừng Thiêng',
    slug: 'phi-phong-quy-mau-rung-thieng',
    origin_name: 'Phi Phong: The Blood Demon',
    type: 'single',
    thumb_url: 'https://phimimg.com/upload/vod/20260620-1/f9f017b676af1005b05491f5a520cc7f.jpg',
    poster_url: 'https://phimimg.com/upload/vod/20260620-1/3ed9a180dfc699fbc0502962e67d86b7.jpg',
    hero_backdrop_url: 'https://image.tmdb.org/t/p/w1280/dgBVAby8uWwTClrUmbsda9r9rQA.jpg',
    hero_poster_url: 'https://image.tmdb.org/t/p/w500/1c5XWuA9ETEUZcMAF1ngk0kBNEh.jpg',
    sub_docquyen: false,
    chieurap: true,
    time: '120 phút',
    episode_current: 'Full',
    episode_total: '1 tập',
    current_episode: 1,
    total_episodes: 1,
    quality: 'FHD',
    lang: 'Vietsub',
    year: 2026,
    category: [
      { id: '4db8d7d4b9873981e3eeb76d02997d58', name: 'Kinh Dị', slug: 'kinh-di' },
      { id: '2fb53017b3be83cd754a08adab3e916c', name: 'Bí Ẩn', slug: 'bi-an' },
    ],
    country: [{ id: 'f6ce1ae8b39af9d38d653b8a0890adb8', name: 'Việt Nam', slug: 'viet-nam' }],
    content: 'Phí Phông: Quỷ Máu Rừng Thiêng là phim kinh dị Việt Nam năm 2026. Bản đẹp FHD được phát trực tiếp từ KhoPhim R2.',
    source_site: 'khophim-r2',
    source_name: 'KhoPhim R2',
    is_published: true,
    seo_catalog_status: 'published',
    modified: { time: '2026-10-06T00:00:00Z' },
  },
  {
    _id: 'fbc1045c-df6c-4021-8e61-9c75c8fcc30a',
    name: 'Thám Tử Lừng Danh Conan: Vụ Án Tiền Giả Ultra 30',
    slug: 'tham-tu-lung-danh-conan-vu-an-tien-gia-ultra-30',
    origin_name: 'Detective Conan: The Counterfeit Case of Ultra 30',
    type: 'single',
    thumb_url: 'https://vsmov.com/storage/images/pT9RIHf4K9OyOB3eqYj97E5h0YA.jpg',
    poster_url: 'https://vsmov.com/storage/images/v0T74v8LPZBSL247oGeTOp06tnm.jpg',
    hero_backdrop_url: 'https://vsmov.com/storage/images/pT9RIHf4K9OyOB3eqYj97E5h0YA.jpg',
    hero_poster_url: 'https://vsmov.com/storage/images/v0T74v8LPZBSL247oGeTOp06tnm.jpg',
    sub_docquyen: false,
    chieurap: true,
    time: '1 giờ 33 phút',
    episode_current: 'Full',
    episode_total: '1 tập',
    current_episode: 1,
    total_episodes: 1,
    quality: 'FHD',
    lang: 'Vietsub',
    year: 2026,
    category: [
      { id: 'mystery', name: 'Bí Ẩn', slug: 'bi-an' },
      { id: 'crime', name: 'Hình Sự', slug: 'hinh-su' },
      { id: 'action', name: 'Hành Động', slug: 'hanh-dong' },
      { id: 'adventure', name: 'Phiêu Lưu', slug: 'phieu-luu' },
    ],
    country: [{ id: 'japan', name: 'Nhật Bản', slug: 'nhat-ban' }],
    content: 'TV Special kỷ niệm 30 năm anime Thám Tử Lừng Danh Conan. Conan và Heiji lần theo vụ án tiền giả quy mô toàn quốc liên quan tới mẫu tiền 10.000 yên mới.',
    source_site: 'vsmov',
    source_name: 'VSMOV',
    is_published: true,
    seo_catalog_status: 'published',
    modified: { time: '2026-09-29T00:00:00Z' },
  },
] satisfies MovieItem[];

export function pinCinemaPromotions(movies: MovieItem[], limit?: number): MovieItem[] {
  const pinnedSlugs = new Set(PINNED_CINEMA_MOVIES.map((movie) => movie.slug));
  const promoted = [
    ...PINNED_CINEMA_MOVIES,
    ...movies.filter((movie) => !pinnedSlugs.has(movie.slug)),
  ];
  return typeof limit === 'number' ? promoted.slice(0, limit) : promoted;
}
