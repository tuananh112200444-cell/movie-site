import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { MovieItem } from '@/types/movie';
import { useImageFallback } from '@/hooks/useImageFallback';

interface MovieListItemProps {
  movie: MovieItem;
  rank?: number;
}

function MovieListItem({ movie, rank }: MovieListItemProps) {
  const posterPath = movie.thumb_url || movie.poster_url;
  const fallbackPath = movie.poster_url || movie.thumb_url;
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    posterPath,
    fallbackPath,
    false,
    180,
    80,
    { preferredAspect: 'portrait' },
  );
  const isFull = (movie.episode_current ?? '').toLowerCase().includes('full') || (movie.episode_current ?? '').toLowerCase().includes('hoàn tất');
  const isNew = movie.year === 2026 || movie.year === 2025;

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug)}`}
      className="group flex gap-3 rounded-2xl border border-white/[0.075] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-3 shadow-[0_12px_34px_rgba(0,0,0,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.045] cursor-pointer"
    >
      {/* Rank badge */}
      {rank !== undefined && (
        <div className="flex items-center justify-center w-7 flex-shrink-0 self-center">
          {rank <= 3 ? (
            <div className={`w-7 h-7 flex items-center justify-center rounded-lg font-black text-sm ${
              rank === 1 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              rank === 2 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' :
              'bg-orange-700/20 text-orange-500 border border-orange-700/30'
            }`}>
              {rank}
            </div>
          ) : (
            <span className="font-bold text-sm text-white/15 w-7 text-center">{rank}</span>
          )}
        </div>
      )}

      {/* Poster */}
      <div className="w-[52px] h-[74px] flex-shrink-0 rounded-xl overflow-hidden bg-[#141823] ring-1 ring-white/[0.07] relative">
        <img
          src={currentSrc}
          alt={movie.name}
          width="104"
          height="148"
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover object-center group-hover:scale-105 transition-[opacity,transform] duration-300 ${loaded && !hasError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={onLoad}
          onError={onError}
        />
        {!loaded && !hasError && <div className="absolute inset-0 skeleton" />}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_0%,rgba(239,68,68,0.12),transparent_70%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] text-white/30">
            <i className="ri-film-line text-lg" />
          </div>
        )}
        {/* Episode overlay */}
        {movie.episode_current && !isFull && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/75 text-white text-[8px] text-center py-0.5 font-bold leading-tight">
            {movie.episode_current}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="flex items-start gap-2">
          <h3 className="text-white text-sm font-semibold line-clamp-1 group-hover:text-red-300 transition-colors flex-1 min-w-0">
            {movie.name}
          </h3>
          {isNew && (
            <span className="text-[9px] font-bold bg-green-500/20 text-green-400 border border-green-500/25 px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
              MỚI
            </span>
          )}
        </div>
        <p className="text-white/35 text-xs line-clamp-1">{movie.origin_name}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {movie.year && (
            <span className="text-white/35 text-[11px] flex items-center gap-1">
              <i className="ri-calendar-line text-white/20 text-[10px]" />
              {movie.year}
            </span>
          )}
          {movie.time && (
            <span className="text-white/35 text-[11px] flex items-center gap-1">
              <i className="ri-time-line text-white/20 text-[10px]" />
              {movie.time}
            </span>
          )}
          {movie.lang && (
            <span className="text-white/35 text-[11px] flex items-center gap-1">
              <i className="ri-translate-2 text-white/20 text-[10px]" />
              {movie.lang}
            </span>
          )}
        </div>

        {/* Categories */}
        {movie.category && movie.category.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {movie.category.slice(0, 3).map(cat => (
              <span key={cat.id} className="text-[10px] bg-white/[0.04] text-white/30 px-1.5 py-0.5 rounded-md border border-white/[0.05]">
                {cat.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right: badges + play */}
      <div className="flex flex-col items-end justify-between flex-shrink-0 gap-2">
        <div className="flex flex-col items-end gap-1">
          {movie.quality && (
            <span className="text-[10px] font-bold bg-red-500/80 text-white px-1.5 py-0.5 rounded-md">
              {movie.quality}
            </span>
          )}
          {isFull && (
            <span className="text-[10px] font-bold bg-green-600/70 text-white px-1.5 py-0.5 rounded-md">
              Full
            </span>
          )}
        </div>
        <div className="w-8 h-8 flex items-center justify-center bg-white/[0.07] text-white/45 group-hover:bg-white group-hover:text-black rounded-full transition-all duration-200 flex-shrink-0 shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
          <i className="ri-play-fill text-sm ml-0.5" />
        </div>
      </div>
    </Link>
  );
}

export default memo(MovieListItem);
