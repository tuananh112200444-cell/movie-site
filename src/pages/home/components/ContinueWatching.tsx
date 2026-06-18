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
    <section className="mb-8 md:mb-10">
      <div className="mb-3 flex items-center justify-between md:mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-orange-500 rounded-full" />
          <h3 className="text-lg font-bold text-white">🕐 Xem Tiếp</h3>
        </div>
        <Link to="/yeu-thich" className="text-white/40 hover:text-red-400 text-xs transition-colors whitespace-nowrap flex items-center gap-1">
          Lịch sử đầy đủ <i className="ri-arrow-right-line" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 md:gap-3">
        {history.slice(0, 6).map((entry) => (
          <HistoryCard key={entry._id} entry={entry} onRemove={removeEntry} />
        ))}
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
    ? `/xem/${entry.slug}?ep=${entry.lastEpSlug}&server=0`
    : `/xem/${entry.slug}`;

  const progress = entry.watchedDuration && entry.watchedDuration > 0
    ? Math.min((entry.watchedTime ?? 0) / entry.watchedDuration, 1)
    : 0;

  return (
    <div className="relative group">
      <Link to={watchUrl} className="block cursor-pointer">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[#1a1d27] shadow-[0_10px_24px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.05]">
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <i className="ri-image-line text-white/20 text-2xl" />
          </div>
        )}
        <img
          src={getSmallThumbUrl(entry.thumb_url)}
          alt={entry.name}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover object-top group-hover:scale-105 transition-all duration-300 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => { setImgLoaded(true); markImagePreloaded(imgUrl); }}
          onError={() => { setImgError(true); setImgLoaded(true); }}
        />
          {/* Continue overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/90 sm:h-10 sm:w-10">
              <i className="ri-play-fill ml-0.5 text-base text-white sm:text-lg" />
            </div>
          </div>
          {/* Last episode badge */}
          {entry.lastEpName && entry.lastEpName !== 'Full' && (
            <div className="absolute bottom-1 left-1 right-1">
              <span className="text-[10px] bg-orange-500/90 text-white px-1.5 py-0.5 rounded block text-center truncate">
                {entry.lastEpName}
              </span>
            </div>
          )}
          {entry.quality && (
            <div className="absolute top-1 right-1">
              <span className="text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded border border-white/10">
                {entry.quality}
              </span>
            </div>
          )}
          {/* Progress bar */}
          {progress > 0.02 && progress < 0.98 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
              <div
                className="h-full bg-orange-500 rounded-r"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
        <p className="mt-1.5 min-h-[34px] text-[11px] font-semibold leading-snug text-white/90 line-clamp-2 transition-colors group-hover:text-orange-400 md:mt-2 md:text-xs">
          {entry.name}
        </p>
      </Link>
      {/* Remove button */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(entry._id); }}
        title="Xóa"
        className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center bg-black/70 hover:bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
      >
        <i className="ri-close-line text-xs" />
      </button>
    </div>
  );
}
