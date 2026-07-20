import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWatchHistory } from '../../../hooks/useWatchHistory';
import { getThumbUrl, getSmallThumbUrl } from '../../../services/movieApi';
import { isImagePreloaded, markImagePreloaded } from '../../../utils/imagePreloader';

type HistoryEntry = ReturnType<typeof useWatchHistory>['history'][number];

export default function ContinueWatching() {
  const { history, removeEntry } = useWatchHistory();
  if (history.length === 0) return null;

  return (
    <section className="continue-watching-panel mb-6 md:mb-10 home-section-surface">
      <div className="mb-3 flex items-center justify-between gap-3 md:mb-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-orange-400/20 bg-orange-500/12 text-orange-300">
            <i className="ri-history-line text-sm" />
          </div>
          <h3 className="truncate text-[1.05rem] font-black text-white md:text-xl">Xem tiếp</h3>
        </div>
        <Link
          to="/yeu-thich"
          className="flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.045] px-3 text-xs font-bold text-white/58 transition-colors hover:text-red-400"
        >
          Lịch sử đầy đủ <i className="ri-arrow-right-line" />
        </Link>
      </div>

      <div className="continue-watching-grid grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 md:grid-cols-6 md:gap-3">
        {history.slice(0, 6).map((entry) => (
          <HistoryCard key={entry._id} entry={entry} onRemove={removeEntry} />
        ))}
        {history.length < 6 && (
          <Link
            to="/phim-moi-nhat"
            className="continue-watching-cta hidden min-h-[220px] flex-col justify-between rounded-xl border border-white/[0.075] bg-white/[0.035] p-4 text-left transition-colors hover:border-orange-300/25 hover:bg-white/[0.055] md:col-span-2 md:flex"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-300/20 bg-orange-500/12 text-orange-200">
              <i className="ri-compass-3-line text-lg" />
            </span>
            <span>
              <span className="block text-sm font-black text-white">Khám phá phim mới</span>
              <span className="mt-1 block text-xs leading-5 text-white/42">
                Chọn thêm phim đang hot để hàng xem tiếp của bạn luôn đầy đủ.
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-200">
              Xem phim mới <i className="ri-arrow-right-line" />
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}

interface HistoryCardProps {
  entry: HistoryEntry;
  onRemove: (id: string) => void;
}

function HistoryCard({ entry, onRemove }: HistoryCardProps) {
  const imgUrl = getThumbUrl(entry.thumb_url);
  const [imgLoaded, setImgLoaded] = useState(isImagePreloaded(imgUrl));
  const [imgError, setImgError] = useState(false);

  const watchUrl = entry.lastEpSlug
    ? `/xem-phim/${encodeURIComponent(entry.slug)}/${encodeURIComponent(entry.lastEpSlug)}`
    : `/xem-phim/${encodeURIComponent(entry.slug)}`;

  const progress = entry.watchedDuration && entry.watchedDuration > 0
    ? Math.min((entry.watchedTime ?? 0) / entry.watchedDuration, 1)
    : 0;

  return (
    <div className="group relative min-w-0">
      <Link to={watchUrl} className="block cursor-pointer">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[#1a1d27] shadow-[0_10px_24px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.05]">
          {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
          {imgError && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#1a1d27]">
              <i className="ri-image-line text-2xl text-white/20" />
            </div>
          )}
          <img
            src={getSmallThumbUrl(entry.thumb_url)}
            alt={entry.name}
            loading="lazy"
            decoding="async"
            className={`h-full w-full object-cover object-top transition-all duration-300 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => { setImgLoaded(true); markImagePreloaded(imgUrl); }}
            onError={() => { setImgError(true); setImgLoaded(true); }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/90 sm:h-10 sm:w-10">
              <i className="ri-play-fill ml-0.5 text-base text-white sm:text-lg" />
            </div>
          </div>
          {entry.lastEpName && entry.lastEpName !== 'Full' && (
            <div className="absolute bottom-1 left-1 right-1">
              <span className="block truncate rounded bg-orange-500/90 px-1.5 py-0.5 text-center text-[10px] text-white">
                {entry.lastEpName}
              </span>
            </div>
          )}
          {entry.quality && (
            <div className="absolute right-1 top-1">
              <span className="rounded border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {entry.quality}
              </span>
            </div>
          )}
          {progress > 0.02 && progress < 0.98 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <div
                className="h-full rounded-r bg-orange-500"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
        <p className="mt-1.5 min-h-[32px] text-[11px] font-bold leading-4 text-white/90 line-clamp-2 transition-colors group-hover:text-orange-400 md:mt-2 md:text-xs">
          {entry.name}
        </p>
      </Link>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(entry._id); }}
        title="Xóa"
        className="absolute left-1 top-1 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-black/70 text-white opacity-0 transition-all hover:bg-red-500 group-hover:opacity-100"
      >
        <i className="ri-close-line text-xs" />
      </button>
    </div>
  );
}
