import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SEO from '../components/base/SEO';
import Navbar from '../components/feature/Navbar';
import MovieCard from '../components/base/MovieCard';
import { fetchTrendingMovies, fetchMoviesByType } from '../services/movieApi';
import type { MovieItem } from '../types/movie';

const QUICK_LINKS = [
  { label: 'Phim Lẻ', to: '/phim-le', icon: 'ri-movie-2-line', desc: 'Phim điện ảnh vietsub HD' },
  { label: 'Phim Bộ', to: '/phim-bo', icon: 'ri-tv-2-line', desc: 'Series dài tập cập nhật' },
  { label: 'Phim Hàn', to: '/phim-han-quoc', icon: 'ri-heart-3-line', desc: 'Drama Hàn Quốc hot' },
  { label: 'Phim Trung', to: '/phim-trung-quoc', icon: 'ri-ancient-pavilion-line', desc: 'Cổ trang, tiên hiệp' },
  { label: 'Phim Âu Mỹ', to: '/phim-au-my', icon: 'ri-rocket-2-line', desc: 'Hollywood blockbuster' },
  { label: 'Hoạt Hình', to: '/hoat-hinh', icon: 'ri-gamepad-line', desc: 'Anime vietsub mới nhất' },
  { label: 'TV Shows', to: '/tv-shows', icon: 'ri-broadcast-line', desc: 'Series truyền hình' },
  { label: 'Chiếu Rạp', to: '/phim-chieu-rap', icon: 'ri-building-4-line', desc: 'Phim rạp vietsub HD' },
];

const POPULAR_SEARCHES = [
  'phim hành động', 'phim tình cảm', 'phim kinh dị', 'phim hài hước',
  'phim viễn tưởng', 'phim cổ trang', 'phim Hàn Quốc', 'phim Trung Quốc',
  'phim chiếu rạp 2026', 'phim hoạt hình', 'Squid Game', 'Vincenzo',
];

export default function NotFound() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<MovieItem[]>([]);
  const [newMovies, setNewMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Lấy phim gợi ý
  useEffect(() => {
    Promise.allSettled([
      fetchTrendingMovies(),
      fetchMoviesByType('phim-le', 1),
    ]).then((results) => {
      const trending = results[0].status === 'fulfilled' ? (results[0].value.items ?? []).slice(0, 6) : [];
      const newest = results[1].status === 'fulfilled' ? (results[1].value.items ?? []).slice(0, 6) : [];
      setSuggestions(trending);
      setNewMovies(newest);
      setLoading(false);
    });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#080a10] text-white flex flex-col">
      <SEO
        title="404 – Trang Không Tìm Thấy | KhoPhim"
        description="Trang bạn tìm kiếm không tồn tại. Xem phim online miễn phí vietsub HD tại KhoPhim - kho phim lớn nhất Việt Nam với hàng nghìn bộ phim mới cập nhật hàng ngày."
        noIndex={true}
      />
      <Navbar />

      <main className="flex-1 px-4 pt-24 pb-16 max-w-[1400px] mx-auto w-full">

        {/* Hero 404 */}
        <div className="flex flex-col items-center text-center mb-12">
          <div className="relative select-none mb-4">
            <span className="text-[9rem] md:text-[13rem] font-black leading-none text-white/[0.03] tracking-tighter">
              404
            </span>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center bg-red-500/10 border border-red-500/20 rounded-2xl">
                  <i className="ri-film-line text-3xl md:text-4xl text-red-400" />
                </div>
              </div>
            </div>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Ối! Trang này không tồn tại
          </h1>
          <p className="text-white/40 text-sm md:text-base max-w-md mb-6 leading-relaxed">
            Trang bạn đang tìm đã bị xóa, di chuyển hoặc chưa từng tồn tại.
            Nhưng đừng lo — còn hàng nghìn bộ phim hay đang chờ bạn!
          </p>

          {/* Search Box */}
          <form onSubmit={handleSearch} className="w-full max-w-lg mb-6">
            <div className="flex items-center gap-2 bg-white/[0.06] border border-white/[0.10] rounded-xl px-4 py-3 focus-within:border-red-500/30 focus-within:bg-white/[0.08] transition-all">
              <i className="ri-search-line text-white/30 text-lg" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm phim..."
                className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 outline-none"
              />
              <button
                type="submit"
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Tìm
              </button>
            </div>
          </form>

          {/* Popular searches */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-8 max-w-lg">
            <span className="text-white/25 text-xs mr-1">Tìm kiếm phổ biến:</span>
            {POPULAR_SEARCHES.map((term) => (
              <button
                key={term}
                onClick={() => navigate(`/?search=${encodeURIComponent(term)}`)}
                className="text-xs bg-white/[0.04] hover:bg-red-500/15 text-white/40 hover:text-red-400 border border-white/[0.06] hover:border-red-500/20 px-2.5 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap"
              >
                {term}
              </button>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-10">
            <Link
              to="/"
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold px-7 py-3 rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-home-4-line" />
              Về Trang Chủ
            </Link>
            <Link
              to="/phim-moi-nhat"
              className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] text-white/70 hover:text-white font-medium px-7 py-3 rounded-xl border border-white/[0.10] hover:border-white/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-fire-line" />
              Phim Mới Nhất
            </Link>
          </div>
        </div>

        {/* Quick category links */}
        <div className="mb-12">
          <h2 className="text-base font-bold text-white mb-4 text-center">Khám Phá KhoPhim</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {QUICK_LINKS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-red-500/20 rounded-xl px-4 py-3 transition-all cursor-pointer"
              >
                <div className="w-9 h-9 flex items-center justify-center bg-red-500/10 rounded-lg flex-shrink-0">
                  <i className={`${item.icon} text-red-400 text-sm`} />
                </div>
                <div className="min-w-0">
                  <p className="text-white/80 text-sm font-medium group-hover:text-red-400 transition-colors whitespace-nowrap">{item.label}</p>
                  <p className="text-white/25 text-[10px] truncate">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Phim đang hot */}
        {suggestions.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-5 bg-red-500 rounded-full" />
              <h2 className="text-base font-bold text-white">Phim Đang Hot — Xem Ngay</h2>
              <Link to="/" className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors whitespace-nowrap">
                Xem tất cả
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {suggestions.map((m) => (
                <MovieCard key={m._id} movie={m} />
              ))}
            </div>
          </div>
        )}

        {/* Phim mới cập nhật */}
        {newMovies.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-5 bg-emerald-500 rounded-full" />
              <h2 className="text-base font-bold text-white">Phim Mới Cập Nhật</h2>
              <Link to="/phim-moi-cap-nhat" className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors whitespace-nowrap">
                Xem tất cả
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {newMovies.map((m) => (
                <MovieCard key={m._id} movie={m} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}