import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MovieCard from '@/components/base/MovieCard';
import { searchMovies, getImageUrl } from '@/services/movieApi';
import type { MovieItem } from '@/types/movie';

interface ActorMoviesProps {
  actorName: string;
  apiKeyword: string;
  knownFor?: string[];
}

type TabKey = 'all' | 'featured';

export default function ActorMovies({ actorName, apiKeyword, knownFor = [] }: ActorMoviesProps) {
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tab, setTab] = useState<TabKey>('all');

  useEffect(() => {
    setLoading(true);
    searchMovies(apiKeyword, page)
      .then((res) => {
        setMovies(res.items ?? []);
        setTotalPages(res.pagination?.totalPages ?? 1);
      })
      .catch(() => setMovies([]))
      .finally(() => setLoading(false));
  }, [apiKeyword, page]);

  /* Featured = phim có tên trùng với knownFor */
  const featuredMovies = movies.filter((m) =>
    knownFor.some((title) =>
      m.name.toLowerCase().includes(title.toLowerCase()) ||
      (m.origin_name ?? '').toLowerCase().includes(title.toLowerCase())
    )
  );

  const displayMovies = tab === 'featured' && featuredMovies.length > 0 ? featuredMovies : movies;

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-1 h-4 bg-red-500 rounded-full flex-shrink-0" />
          Phim Của {actorName}
        </h3>
        <div className="flex items-center gap-2">
          {!loading && movies.length > 0 && (
            <span className="text-xs text-white/30 bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-full">
              {movies.length} phim
            </span>
          )}
          <Link
            to={`/search?q=${encodeURIComponent(apiKeyword)}`}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            Xem tất cả <i className="ri-arrow-right-s-line" />
          </Link>
        </div>
      </div>

      {/* Tabs */}
      {knownFor.length > 0 && (
        <div className="flex items-center gap-1 bg-[#1a1d27] border border-white/[0.06] rounded-xl p-1 mb-5 w-fit">
          {([
            { key: 'all', label: 'Tất Cả Phim', icon: 'ri-film-line' },
            { key: 'featured', label: 'Phim Nổi Bật', icon: 'ri-star-line' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-all cursor-pointer whitespace-nowrap font-medium ${
                tab === t.key
                  ? 'bg-red-500 text-white'
                  : 'text-white/45 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <i className={`${t.icon} text-xs`} />
              {t.label}
              {t.key === 'featured' && featuredMovies.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === 'featured' ? 'bg-white/20 text-white' : 'bg-red-500/20 text-red-400'}`}>
                  {featuredMovies.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Known for quick list (featured tab) */}
      {tab === 'featured' && knownFor.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {knownFor.map((title) => (
            <Link
              key={title}
              to={`/search?q=${encodeURIComponent(title)}`}
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-red-400 bg-white/[0.04] hover:bg-red-500/[0.08] border border-white/[0.07] hover:border-red-500/20 px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-film-line text-[10px]" />
              {title}
            </Link>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] skeleton rounded-xl" />
              <div className="mt-2 h-3 skeleton rounded w-3/4" />
              <div className="mt-1 h-2.5 skeleton rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : displayMovies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/25 bg-[#0d0f1a] rounded-2xl border border-white/[0.06]">
          <i className="ri-film-line text-4xl mb-3" />
          <p className="text-sm">
            {tab === 'featured' ? 'Không tìm thấy phim nổi bật' : 'Chưa tìm thấy phim nào'}
          </p>
          {tab === 'featured' && (
            <button
              onClick={() => setTab('all')}
              className="mt-3 text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              Xem tất cả phim
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {displayMovies.map((m, idx) => (
              <MovieCard key={m._id} movie={m} priority={idx < 6} />
            ))}
          </div>

          {/* Pagination (only for all tab) */}
          {tab === 'all' && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-9 h-9 flex items-center justify-center bg-[#1a1d27] border border-white/10 rounded-lg text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <i className="ri-arrow-left-s-line" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                    page === p
                      ? 'bg-red-500 text-white'
                      : 'bg-[#1a1d27] border border-white/10 text-white/50 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-9 h-9 flex items-center justify-center bg-[#1a1d27] border border-white/10 rounded-lg text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <i className="ri-arrow-right-s-line" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
