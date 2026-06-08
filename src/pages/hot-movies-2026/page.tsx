import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import SEO from '../../components/base/SEO';
import Countdown from '../../components/base/Countdown';
import { hotMovies2026, getDaysUntilRelease, formatReleaseDate } from '../../mocks/hotMovies2026';

const hypeFilters = [
  { key: 'all', label: 'Tất Cả', color: 'bg-white/10' },
  { key: 'cực hot', label: '🔥 Cực Hot', color: 'bg-red-500' },
  { key: 'hot', label: '⭐ Hot', color: 'bg-orange-500' },
  { key: 'đáng chờ đợi', label: '💎 Đáng Chờ Đợi', color: 'bg-blue-500' },
];

const genreFilters = [
  'Tất Cả',
  'Hành Động',
  'Khoa Học Viễn Tưởng',
  'Siêu Anh Hùng',
  'Hoạt Hình',
  'Kinh Dị',
  'Tiểu Sử',
];

export default function HotMovies2026Page() {
  const [activeHype, setActiveHype] = useState('all');
  const [activeGenre, setActiveGenre] = useState('Tất Cả');

  const filteredMovies = useMemo(() => {
    let movies = hotMovies2026;

    if (activeHype !== 'all') {
      movies = movies.filter((m) => m.hype === activeHype);
    }

    if (activeGenre !== 'Tất Cả') {
      movies = movies.filter((m) => m.genre.includes(activeGenre));
    }

    // Sắp xếp: Cực hot trước, rồi đến ngày ra mắt
    const hypeOrder = { 'cực hot': 0, hot: 1, 'đáng chờ đợi': 2 };
    return movies.sort((a, b) => {
      const hypeDiff = hypeOrder[a.hype] - hypeOrder[b.hype];
      if (hypeDiff !== 0) return hypeDiff;
      return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
    });
  }, [activeHype, activeGenre]);

  const featuredMovie = hotMovies2026.find((m) => m.id === 'avengers-doomsday');

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Phim Hot 2026 - Những Bom Tấn Được Mong Chờ Nhất',
    url: 'https://khophim.org/phim-hot-2026',
    description: 'Danh sách phim hot nhất 2026: Avengers: Doomsday, The Odyssey, Spider-Man 4, Dune 3, Toy Story 5. Xem thông tin và countdown tại khophim.org',
    about: {
      '@type': 'Thing',
      name: 'Phim 2026',
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: hotMovies2026.map((movie, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Movie',
          name: movie.title,
          datePublished: movie.releaseDate,
          director: {
            '@type': 'Person',
            name: movie.director,
          },
          actor: movie.cast.map((actor) => ({
            '@type': 'Person',
            name: actor,
          })),
          genre: movie.genre,
          description: movie.description,
          image: movie.poster,
        },
      })),
    },
  };

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <SEO
        title="Phim Hot 2026 – Bom Tấn Điện Ảnh | KhoPhim"
        description="Danh sách phim hot nhất 2026: Avengers: Doomsday, The Odyssey (Nolan), Spider-Man: Brand New Day, Dune 3, Toy Story 5. Countdown ngày ra mắt tại khophim.org!"
        keywords="phim hot 2026, phim 2026, avengers doomsday, the odyssey, spider man 4, dune 3, toy story 5, phim marvel 2026, phim chieu rap 2026, khophim"
        canonical="/phim-hot-2026"
        ogType="website"
        schema={schema}
      />
      <Navbar />

      {/* Hero Section - Featured Movie */}
      {featuredMovie && (
        <section className="relative pt-20 pb-8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-red-500/10 via-transparent to-transparent" />
          {/* Background blur poster */}
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={featuredMovie.poster}
              alt=""
              className="w-full h-full object-cover object-top opacity-10 blur-2xl scale-110"
              aria-hidden="true"
            />
          </div>
          <div className="max-w-[1400px] mx-auto px-4 lg:px-6 relative">
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start lg:items-center">
              {/* Poster */}
              <div className="flex-shrink-0 w-[200px] sm:w-[240px] lg:w-[260px] xl:w-[280px]">
                <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl shadow-red-500/30 border border-white/10">
                  <img
                    src={featuredMovie.poster}
                    alt={featuredMovie.title}
                    width="280"
                    height="420"
                    className="w-full h-auto block"
                    style={{ aspectRatio: '2/3', objectFit: 'cover', objectPosition: 'top' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://placehold.co/280x420/1a1d29/FF6B6B?text=No+Image';
                    }}
                  />
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 bg-red-500 text-white text-[10px] font-bold rounded-md uppercase tracking-wider">
                      Cực Hot 2026
                    </span>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full mb-3">
                  <i className="ri-fire-line text-red-400 text-sm" />
                  <span className="text-red-400 text-xs font-semibold">Phim Được Mong Chờ Nhất 2026</span>
                </div>

                <h1 className="text-2xl lg:text-4xl font-bold mb-2">
                  {featuredMovie.title}
                </h1>
                <p className="text-white/50 text-sm mb-4">{featuredMovie.originTitle}</p>

                <p className="text-white/60 text-sm leading-relaxed max-w-2xl mb-4">
                  {featuredMovie.description}
                </p>

                <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-5">
                  {featuredMovie.genre.map((g) => (
                    <span key={g} className="px-2.5 py-1 bg-white/5 text-white/60 text-xs rounded-md">
                      {g}
                    </span>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 mb-5">
                  <div className="text-center sm:text-left">
                    <p className="text-white/40 text-xs mb-1">Công chiếu: {formatReleaseDate(featuredMovie.releaseDate)}</p>
                    <Countdown targetDate={featuredMovie.releaseDate} />
                  </div>
                </div>

                <div className="flex flex-wrap justify-center lg:justify-start gap-3">
                  <button className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap">
                    <i className="ri-notification-3-line" />
                    Nhận Thông Báo
                  </button>
                  <Link
                    to="/blog/review-avengers-doomsday-2026"
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                  >
                    <i className="ri-article-line" />
                    Đọc Review
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="sticky top-16 z-40 bg-[#080a10]/95 border-y border-white/[0.06] py-4">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Hype Filter */}
            <div className="flex flex-wrap gap-2">
              {hypeFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setActiveHype(filter.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    activeHype === filter.key
                      ? `${filter.color} text-white`
                      : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Genre Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
              <span className="text-white/30 text-xs whitespace-nowrap">Thể loại:</span>
              {genreFilters.map((genre) => (
                <button
                  key={genre}
                  onClick={() => setActiveGenre(genre)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer whitespace-nowrap ${
                    activeGenre === genre
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Movies Grid */}
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">
            Danh Sách Phim Hot 2026
            <span className="text-white/30 text-sm font-normal ml-2">({filteredMovies.length} phim)</span>
          </h2>
        </div>

        {filteredMovies.length === 0 ? (
          <div className="text-center py-16">
            <i className="ri-movie-2-line text-5xl text-white/10 mb-4" />
            <p className="text-white/40 text-sm">Không tìm thấy phim phù hợp</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
            {filteredMovies.map((movie) => {
              const daysLeft = getDaysUntilRelease(movie.releaseDate);
              const isReleased = daysLeft <= 0;

              return (
                <article
                  key={movie.id}
                  className="group bg-[#0d0f18] border border-white/[0.06] rounded-xl overflow-hidden hover:border-red-500/20 transition-all duration-300"
                >
                  {/* Poster */}
                  <div className="relative w-full overflow-hidden" style={{ paddingBottom: '150%' }}>
                    <img
                      src={movie.poster}
                      alt={movie.title}
                      width="300"
                      height="450"
                      className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/300x450/1a1d29/FF6B6B?text=No+Image';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f18] via-transparent to-transparent" />

                    {/* Hype Badge */}
                    <div className="absolute top-2 left-2 z-10">
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase ${
                          movie.hype === 'cực hot'
                            ? 'bg-red-500 text-white'
                            : movie.hype === 'hot'
                            ? 'bg-orange-500 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {movie.hype === 'cực hot' ? '🔥 Hot' : movie.hype === 'hot' ? '⭐ Hot' : '💎 Hay'}
                      </span>
                    </div>

                    {/* Days Left */}
                    <div className="absolute top-2 right-2 z-10">
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                          isReleased
                            ? 'bg-green-500/80 text-white'
                            : daysLeft <= 30
                            ? 'bg-red-500/80 text-white'
                            : 'bg-black/60 text-white/70'
                        }`}
                      >
                        {isReleased ? '✓ Ra mắt' : `${daysLeft}d`}
                      </span>
                    </div>

                    {/* Countdown Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
                      <Countdown targetDate={movie.releaseDate} className="justify-center" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-3">
                    <h3 className="font-bold text-white text-[13px] group-hover:text-red-400 transition-colors line-clamp-1 mb-0.5">
                      {movie.title}
                    </h3>
                    <p className="text-white/35 text-[10px] line-clamp-1 mb-2 italic">{movie.originTitle}</p>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {movie.genre.slice(0, 2).map((g) => (
                        <span key={g} className="px-1.5 py-0.5 bg-white/5 text-white/40 text-[9px] rounded">
                          {g}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-white/30">
                      <span className="flex items-center gap-1 truncate">
                        <i className="ri-calendar-line text-[9px]" />
                        {formatReleaseDate(movie.releaseDate)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* CTA Section */}
      <section className="max-w-[1400px] mx-auto px-4 lg:px-6 py-12">
        <div className="bg-gradient-to-r from-red-500/10 via-orange-500/5 to-red-500/10 border border-red-500/20 rounded-2xl p-4 sm:p-6 md:p-8 text-center">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-3">
            Đừng Bỏ Lỡ Phim Hot 2026!
          </h2>
          <p className="text-white/50 text-sm max-w-xl mx-auto mb-5">
            Đăng ký nhận thông báo để cập nhật ngay khi phim ra mắt trên{' '}
            <strong className="text-red-400">khophim.org</strong>. Xem phim HD vietsub miễn phí!
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
            >
              <i className="ri-home-4-line" />
              Về Trang Chủ
            </Link>
            <Link
              to="/blog"
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
            >
              <i className="ri-article-line" />
              Đọc Blog Phim
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}