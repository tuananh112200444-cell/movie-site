import type { MovieItem } from '../types/movie';

export const PINNED_HOME_HERO_MOVIES = [
  {
    _id: '71ec779093d8834cb2568cb676fc4482',
    slug: 'bac-si-x',
    name: 'Bác Sĩ X',
    origin_name: 'Doctor X: Mafia in White',
    type: 'series',
    status: 'ongoing',
    thumb_url: 'https://phimimg.com/uploads/movies/20261010/bac-si-x-thumb.webp',
    poster_url: 'https://phimimg.com/uploads/movies/20261010/bac-si-x-poster.webp',
    hero_backdrop_url: 'https://phimimg.com/uploads/movies/20261010/bac-si-x-thumb.webp',
    hero_poster_url: 'https://phimimg.com/uploads/movies/20261010/bac-si-x-poster.webp',
    sub_docquyen: false,
    chieurap: false,
    time: '66 phút/tập',
    episode_current: 'Tập 2',
    episode_total: '12',
    current_episode: 2,
    total_episodes: 12,
    quality: 'FHD',
    lang: 'Vietsub',
    year: 2026,
    category: [
      { id: '2fb53017b3be83cd754a08adab3e916c', name: 'Bí Ẩn', slug: 'bi-an' },
      { id: '37a7b38b6184a5ebd3c43015aa20709d', name: 'Chính Kịch', slug: 'chinh-kich' },
      { id: '7a035ac0b37f5854f0f6979260899c90', name: 'Hình Sự', slug: 'hinh-su' },
      { id: 'a7b065b92ad356387ef2e075dee66529', name: 'Tâm Lý', slug: 'tam-ly' },
    ],
    country: [{ id: '05de95be5fc404da9680bbb3dd8262e6', name: 'Hàn Quốc', slug: 'han-quoc' }],
    is_published: true,
    seo_catalog_status: 'published',
    trailer_url: 'https://www.youtube.com/watch?v=v6KNnhkLnnY',
    content: 'Một bác sĩ phẫu thuật bí ẩn nhưng tài năng nhận những ca tưởng chừng bất khả thi tại bệnh viện nơi cái tôi và tham nhũng lộng hành.',
  },
  {
    _id: '4895d244a58265c4748906cc0b46f295',
    slug: 'ban-nang-thu',
    name: 'Bản Năng Thú',
    origin_name: 'Animals',
    type: 'single',
    status: 'completed',
    thumb_url: 'https://phimimg.com/uploads/movies/20261010/ban-nang-thu-thumb.webp',
    poster_url: 'https://phimimg.com/uploads/movies/20261010/ban-nang-thu-poster.webp',
    hero_backdrop_url: 'https://phimimg.com/uploads/movies/20261010/ban-nang-thu-thumb.webp',
    hero_poster_url: 'https://phimimg.com/uploads/movies/20261010/ban-nang-thu-poster.webp',
    sub_docquyen: false,
    chieurap: false,
    time: '',
    episode_current: 'Full',
    episode_total: '1',
    current_episode: 1,
    total_episodes: 1,
    quality: 'FHD',
    lang: 'Vietsub',
    year: 2026,
    category: [
      { id: 'a7b065b92ad356387ef2e075dee66529', name: 'Tâm Lý', slug: 'tam-ly' },
      { id: '37a7b38b6184a5ebd3c43015aa20709d', name: 'Chính Kịch', slug: 'chinh-kich' },
    ],
    country: [{ id: '74d9fa92f4dea9ecea8fc2233dc7921a', name: 'Âu Mỹ', slug: 'au-my' }],
    is_published: true,
    seo_catalog_status: 'published',
    trailer_url: 'https://www.youtube.com/watch?v=ZkN2M4ODdys',
    content: 'Khi con trai bị bắt cóc, một ứng viên thị trưởng Los Angeles và vợ phải xoay xở tiền chuộc, đồng thời đối mặt với những lựa chọn có thể phá tan thế giới của họ.',
  },
] satisfies MovieItem[];

export const HOME_HERO_EXCLUDED_SLUGS = new Set([
  'phi-phong-quy-mau-rung-thieng',
  'tham-tu-lung-danh-conan-vu-an-tien-gia-ultra-30',
]);

// Cinema rails keep the provider's verified source order. Hero curation is a
// separate concern and must not relabel series/non-cinema movies as theatrical.
export const PINNED_CINEMA_MOVIES = [] satisfies MovieItem[];

export function pinCinemaPromotions(movies: MovieItem[], limit?: number): MovieItem[] {
  return typeof limit === 'number' ? movies.slice(0, limit) : movies;
}

export function pinHomeHeroPromotions(movies: MovieItem[], limit?: number): MovieItem[] {
  const publicMovies = movies.filter((movie) => {
    const status = String(movie.seo_catalog_status || 'published').trim().toLowerCase();
    return movie.is_published !== false
      && !movie.superseded_by_movie_id
      && !['hidden', 'draft', 'superseded', 'awaiting_playback'].includes(status);
  });
  const liveBySlug = new Map(publicMovies.map((movie) => [movie.slug, movie]));
  const pinnedSlugs = new Set(PINNED_HOME_HERO_MOVIES.map((movie) => movie.slug));
  const promoted = [
    ...PINNED_HOME_HERO_MOVIES.flatMap((promotion) => {
      const live = liveBySlug.get(promotion.slug);
      if (!live) return [];
      return [{ ...promotion, ...live }];
    }),
    ...publicMovies.filter((movie) => !pinnedSlugs.has(movie.slug) && !HOME_HERO_EXCLUDED_SLUGS.has(movie.slug)),
  ];
  return typeof limit === 'number' ? promoted.slice(0, limit) : promoted;
}
