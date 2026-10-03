import type { MovieItem } from '../types/movie';

export const PINNED_CINEMA_MOVIES = [
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
