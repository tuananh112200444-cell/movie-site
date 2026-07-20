import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import SEO from '../../components/base/SEO';
import { useFavorites } from '../../hooks/useFavorites';
import { useWatchHistory } from '../../hooks/useWatchHistory';
import { useResumeWatch } from '../../hooks/useResumeWatch';
import { getPosterUrl } from '../../services/movieApi';
import type { FavMovie } from '../../hooks/useFavorites';
import type { WatchEntry } from '../../hooks/useWatchHistory';

type TabType = 'continue' | 'favorites';
type SortType = 'recent' | 'progress' | 'unfinished';
type FavSortType = 'recent' | 'name';

/* ─── Helper: format time mm:ss ─── */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ─── Continue Watching Card ─── */
function ContinueCard({
  entry,
  progressInfo,
  onRemove,
}: {
  entry: WatchEntry;
  progressInfo?: {
    progress: number;
    time: number;
    duration: number;
    epSlug: string;
  };
  onRemove: () => void;
}) {
  const hasProgress = progressInfo && progressInfo.progress > 0.05 && progressInfo.progress < 0.95;
  const pct = hasProgress ? Math.round(progressInfo.progress * 100) : 0;
  const isFinished = progressInfo && progressInfo.progress >= 0.95;

  return (
    <div className="group relative flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-200">
      {/* Thumbnail + Progress */}
      <Link
        to={`/xem-phim/${encodeURIComponent(entry.slug)}${progressInfo && progressInfo.epSlug !== 'full' ? `/${encodeURIComponent(progressInfo.epSlug)}` : ''}`}
        className="relative flex-shrink-0 w-[120px] sm:w-[180px] md:w-[220px] aspect-[16/9] rounded-lg overflow-hidden bg-[#1a1d27] block"
      >
        <img
          src={getPosterUrl(entry.thumb_url)}
          alt={entry.name}
          loading="lazy"
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Hover play button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-500/90 flex items-center justify-center">
            <i className="ri-play-fill text-lg sm:text-xl text-white ml-0.5" />
          </div>
        </div>

        {/* Progress bar at bottom */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className="h-full bg-red-500 rounded-r"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {/* Episode badge */}
        {entry.lastEpName && entry.lastEpName !== 'Full' && (
          <div className="absolute top-1 sm:top-1.5 left-1 sm:left-1.5">
            <span className="text-[9px] sm:text-xs font-semibold bg-black/70 text-white px-1 py-0.5 sm:px-1.5 sm:py-0.5 rounded-md border border-white/10">
              {entry.lastEpName}
            </span>
          </div>
        )}

        {/* Quality */}
        {entry.quality && (
          <div className="absolute top-1 sm:top-1.5 right-1 sm:right-1.5">
            <span className="text-[9px] sm:text-[10px] font-bold bg-red-500/90 text-white px-1 py-0.5 sm:px-1.5 sm:py-0.5 rounded">
              {entry.quality}
            </span>
          </div>
        )}

        {/* Finished badge */}
        {isFinished && (
          <div className="absolute top-1 sm:top-1.5 left-1 sm:left-1.5">
            <span className="text-[9px] sm:text-[10px] font-semibold bg-green-500/90 text-white px-1 py-0.5 sm:px-1.5 sm:py-0.5 rounded-md">
              Đã xem
            </span>
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <Link
          to={`/phim/${encodeURIComponent(entry.slug)}`}
          className="block"
        >
          <h3 className="text-white text-sm sm:text-base font-semibold leading-snug line-clamp-1 group-hover:text-red-400 transition-colors">
            {entry.name}
          </h3>
        </Link>
        {entry.origin_name && (
          <p className="text-white/30 text-[11px] sm:text-xs mt-0.5 line-clamp-1">
            {entry.origin_name}
          </p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
          {entry.year > 0 && (
            <span className="text-[10px] sm:text-xs text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
              {entry.year}
            </span>
          )}
          {entry.lang && (
            <span className="text-[10px] sm:text-xs text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
              {entry.lang}
            </span>
          )}
          {entry.episode_current && entry.episode_current !== 'Full' && (
            <span className="text-[10px] sm:text-xs text-orange-400/80 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
              {entry.episode_current}
            </span>
          )}
        </div>

        {/* Progress text */}
        {hasProgress && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: pct < 30
                    ? 'linear-gradient(90deg, #ef4444, #f87171)'
                    : pct < 70
                      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                      : 'linear-gradient(90deg, #22c55e, #4ade80)',
                }}
              />
            </div>
            <span className="text-[10px] sm:text-[11px] text-white/30 flex-shrink-0">
              {fmtTime(progressInfo.time)} / {fmtTime(progressInfo.duration)}
            </span>
          </div>
        )}

        {/* Last watched */}
        <p className="text-white/20 text-[10px] sm:text-xs mt-2">
          Xem lần cuối: {new Date(entry.watchedAt).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>

        {/* Hover actions */}
        <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Link
            to={`/xem-phim/${encodeURIComponent(entry.slug)}${progressInfo && progressInfo.epSlug !== 'full' ? `/${encodeURIComponent(progressInfo.epSlug)}` : ''}`}
            className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
          >
            <i className="ri-play-circle-line" />
            {hasProgress ? 'Xem tiếp' : 'Xem lại'}
          </Link>
          <button
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-white/20 hover:text-red-400 transition-colors cursor-pointer"
          >
            <i className="ri-delete-bin-line" />
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Favorite Card (compact horizontal) ─── */
function FavoriteCard({
  movie,
  onRemove,
}: {
  movie: FavMovie;
  onRemove: () => void;
}) {
  return (
    <div className="group relative flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-200">
      <Link
        to={`/phim/${encodeURIComponent(movie.slug)}`}
        className="relative flex-shrink-0 w-[80px] sm:w-[120px] aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1d27] block"
      >
        <img
          src={getPosterUrl(movie.thumb_url)}
          alt={movie.name}
          loading="lazy"
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-500/90 flex items-center justify-center">
            <i className="ri-play-fill text-xs sm:text-sm text-white ml-0.5" />
          </div>
        </div>
        {movie.quality && (
          <div className="absolute top-1 right-1">
            <span className="text-[9px] sm:text-[10px] font-bold bg-red-500/90 text-white px-1 py-0.5 sm:px-1.5 rounded">
              {movie.quality}
            </span>
          </div>
        )}
      </Link>

      <div className="flex-1 min-w-0 py-0.5">
        <Link to={`/phim/${encodeURIComponent(movie.slug)}`}>
          <h3 className="text-white text-sm sm:text-base font-semibold leading-snug line-clamp-1 group-hover:text-red-400 transition-colors">
            {movie.name}
          </h3>
        </Link>
        {movie.origin_name && (
          <p className="text-white/30 text-[11px] sm:text-xs mt-0.5 line-clamp-1">{movie.origin_name}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
          {movie.year > 0 && (
            <span className="text-[10px] sm:text-xs text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{movie.year}</span>
          )}
          {movie.lang && (
            <span className="text-[10px] sm:text-xs text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{movie.lang}</span>
          )}
          {movie.episode_current && movie.episode_current !== 'Full' && (
            <span className="text-[10px] sm:text-xs text-orange-400/80 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
              {movie.episode_current}
            </span>
          )}
        </div>
        <p className="text-white/20 text-[10px] sm:text-xs mt-2">
          Đã thêm: {new Date().toLocaleDateString('vi-VN')}
        </p>
      </div>

      <button
        onClick={onRemove}
        title="Xóa khỏi yêu thích"
        className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-400 rounded-lg transition-all cursor-pointer"
      >
        <i className="ri-heart-fill text-xs sm:text-sm" />
      </button>
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({
  icon,
  title,
  desc,
  actionText,
  actionTo,
}: {
  icon: string;
  title: string;
  desc: string;
  actionText: string;
  actionTo: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-white/30">
      <i className={`${icon} text-4xl sm:text-5xl mb-3`} />
      <p className="text-sm sm:text-base font-medium">{title}</p>
      <p className="text-xs sm:text-sm mt-1 text-white/20">{desc}</p>
      <Link
        to={actionTo}
        className="mt-4 text-red-400 text-xs sm:text-sm hover:text-red-300 transition-colors font-medium"
      >
        {actionText} →
      </Link>
    </div>
  );
}

/* ─── Main Page ─── */
export default function FavoritesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('continue');
  const [sortMode, setSortMode] = useState<SortType>('recent');
  const [favSortMode, setFavSortMode] = useState<FavSortType>('recent');

  const { favorites, remove: removeFav } = useFavorites();
  const { history, removeEntry, clearAll } = useWatchHistory();
  const { getAllProgress } = useResumeWatch();

  // Load progress map once
  const progressMap = useMemo(() => getAllProgress(), [getAllProgress]);

  /* ── Filtered & sorted Continue Watching ── */
  const filteredHistory = useMemo(() => {
    let items = [...history];
    if (sortMode === 'unfinished') {
      items = items.filter((e) => {
        const p = progressMap[e.slug];
        return p && p.shouldResume;
      });
    }
    if (sortMode === 'progress') {
      items.sort((a, b) => {
        const pa = progressMap[a.slug]?.progress ?? 0;
        const pb = progressMap[b.slug]?.progress ?? 0;
        return pb - pa;
      });
    }
    // 'recent' is default order (history is already sorted by watchedAt desc)
    return items;
  }, [history, sortMode, progressMap]);

  /* ── Sorted Favorites ── */
  const sortedFavorites = useMemo(() => {
    if (favSortMode === 'name') {
      return [...favorites].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }
    return favorites; // recent = default order
  }, [favorites, favSortMode]);

  const handleClearHistory = useCallback(() => {
    if (window.confirm('Xóa toàn bộ lịch sử xem?')) {
      clearAll();
    }
  }, [clearAll]);

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <SEO
        title="Phim Yêu Thích & Lịch Sử Xem – KhoPhim"
        description="Danh sách phim yêu thích và lịch sử xem phim của bạn tại KhoPhim."
        noIndex={true}
      />
      <Navbar />

      <main className="max-w-[1100px] mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">Thư Viện Phim</h1>
          <p className="text-white/30 text-xs sm:text-sm">Quản lý phim yêu thích và tiến độ xem của bạn</p>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 mb-6 sm:mb-8 w-fit">
          <button
            onClick={() => setActiveTab('continue')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'continue'
                ? 'bg-red-500 text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <i className="ri-history-line" />
            Tiếp Tục Xem
            {history.length > 0 && (
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md">{history.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'favorites'
                ? 'bg-red-500 text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <i className="ri-heart-line" />
            Phim Yêu Thích
            {favorites.length > 0 && (
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md">{favorites.length}</span>
            )}
          </button>
        </div>

        {/* ── TAB: Tiếp Tục Xem ── */}
        {activeTab === 'continue' && (
          <section>
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4 sm:mb-5 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-xs sm:text-sm">Sắp xếp:</span>
                <div className="flex gap-1">
                  {([
                    { key: 'recent' as SortType, label: 'Gần đây' },
                    { key: 'progress' as SortType, label: 'Tiến độ' },
                    { key: 'unfinished' as SortType, label: 'Đang xem dở' },
                  ]).map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSortMode(s.key)}
                      className={`px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                        sortMode === s.key
                          ? 'bg-white/10 text-white border border-white/10'
                          : 'text-white/30 hover:text-white/60'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-[10px] sm:text-xs text-white/20 hover:text-red-400 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                >
                  <i className="ri-delete-bin-line" />
                  Xóa tất cả
                </button>
              )}
            </div>

            {filteredHistory.length === 0 ? (
              <EmptyState
                icon="ri-history-line"
                title="Chưa có lịch sử xem"
                desc={sortMode === 'unfinished' ? 'Không có phim nào đang xem dở' : 'Bắt đầu xem phim để lưu lại tiến độ'}
                actionText="Khám phá phim ngay"
                actionTo="/"
              />
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {filteredHistory.map((entry) => (
                  <ContinueCard
                    key={entry._id}
                    entry={entry}
                    progressInfo={progressMap[entry.slug]}
                    onRemove={() => removeEntry(entry._id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── TAB: Phim Yêu Thích ── */}
        {activeTab === 'favorites' && (
          <section>
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4 sm:mb-5 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-xs sm:text-sm">Sắp xếp:</span>
                <div className="flex gap-1">
                  {([
                    { key: 'recent' as FavSortType, label: 'Mới nhất' },
                    { key: 'name' as FavSortType, label: 'Tên A–Z' },
                  ]).map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setFavSortMode(s.key)}
                      className={`px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                        favSortMode === s.key
                          ? 'bg-white/10 text-white border border-white/10'
                          : 'text-white/30 hover:text-white/60'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {sortedFavorites.length === 0 ? (
              <EmptyState
                icon="ri-heart-line"
                title="Chưa có phim yêu thích"
                desc="Nhấn trái tim trên trang phim để lưu vào đây"
                actionText="Khám phá phim ngay"
                actionTo="/"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {sortedFavorites.map((movie) => (
                  <FavoriteCard
                    key={movie._id}
                    movie={movie}
                    onRemove={() => removeFav(movie._id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
