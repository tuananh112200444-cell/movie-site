import { memo, useMemo, useState, useCallback, useRef } from 'react';
import { useImageFallback } from '../../hooks/useImageFallback';
import { Link } from 'react-router-dom';
import type { MovieItem } from '../../types/movie';
import { getImageUrl, getOptimizedImageUrl, getMovieDisplayName } from '../../services/movieApi';
import { movieDetailUrl } from '../../utils/slugEncoder';
import { prefetchMovieDetail, cancelPrefetchMovieDetail } from '../../utils/prefetchRoute';
import { isImagePreloaded, markImagePreloaded } from '../../utils/imagePreloader';
import MovieCountdown from './MovieCountdown';

interface MovieCardProps {
  movie: MovieItem;
  rank?: number;
  variant?: 'default' | 'wide' | 'rank';
  priority?: boolean;
}

function isNewMovie(movie: MovieItem): boolean {
  const modTime = (movie as unknown as { modified?: { time?: string } }).modified?.time;
  if (!modTime) return false;
  return Date.now() - new Date(modTime).getTime() < 30 * 24 * 60 * 60 * 1000;
}

function getEpisodeBadge(episode_current?: string) {
  if (!episode_current) return null;
  const s = episode_current.toLowerCase().trim();
  if (s === 'trailer') return (
    <span className="text-[9px] font-bold bg-orange-500/90 text-white px-1.5 py-0.5 rounded-md tracking-wide">Trailer</span>
  );
  if (s === 'full' || s === 'hoàn tất' || s === 'full hd') return (
    <span className="text-[9px] font-bold bg-emerald-500/90 text-white px-1.5 py-0.5 rounded-md tracking-wide">Full</span>
  );
  return <span className="text-[9px] font-bold bg-red-500/90 text-white px-1.5 py-0.5 rounded-md">{episode_current}</span>;
}

function buildAlt(movie: MovieItem): string {
  const parts = [movie.name];
  if (movie.origin_name && movie.origin_name !== movie.name) parts.push(`(${movie.origin_name})`);
  if (movie.year) parts.push(String(movie.year));
  let alt = parts.join(' ');
  if (alt.length > 90) alt = alt.slice(0, 87) + '...';
  return alt;
}

function getDisplayTitle(movie: MovieItem): string {
  return getMovieDisplayName(movie);
}
function getDisplayOrigin(movie: MovieItem): string {
  return movie.title_en?.trim() || movie.origin_name;
}

/* ─────────────────────────────────────────
   DEFAULT CARD
───────────────────────────────────────── */
function DefaultCard({ movie, priority }: MovieCardProps) {
  // Use optimized image for homepage cards to reduce bandwidth
  const posterPath = movie.poster_url || movie.thumb_url;
  const fallbackPath = movie.thumb_url || movie.poster_url;
  
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    getOptimizedImageUrl(posterPath, 420, 84),
    getOptimizedImageUrl(fallbackPath, 420, 84),
    isImagePreloaded(getImageUrl(posterPath)),
  );
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rating  = useMemo(() => (7 + Math.abs(movie.name.charCodeAt(0) % 3) * 0.5).toFixed(1), [movie.name]);
  const altText = buildAlt(movie);
  const isNew   = isNewMovie(movie);

  const epText = (() => {
    const ep = (movie.episode_current ?? '').toLowerCase().trim();
    if (ep === 'full' || ep === 'hoàn tất') return { label: 'Hoàn tất', cls: 'text-emerald-400' };
    if (ep && ep !== 'trailer') return { label: movie.episode_current!, cls: 'text-white/40' };
    return null;
  })();

  const handleMouseEnter = useCallback(() => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      if (movie.slug) prefetchMovieDetail(movie.slug);
    }, 120);
  }, [movie.slug]);
  const handleMouseLeave = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    if (movie.slug) cancelPrefetchMovieDetail(movie.slug);
  }, [movie.slug]);

  const isOphimSource = movie.source_site === 'ophim' || movie.source_name === 'OPhim';
  const detailUrl = isOphimSource
    ? `${movieDetailUrl(movie.slug)}?source=ophim`
    : movieDetailUrl(movie.slug);

  return (
    <Link
      to={detailUrl}
      className="group cursor-pointer flex h-full flex-col active:scale-[0.97] transition-transform duration-150"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Wrapper: không scale toàn card, chỉ scale ảnh */}
      <div className="relative flex h-full flex-col">
        {/* Poster */}
        <div
          className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-lg bg-[#16192a] sm:rounded-xl"
        >
          <div className={`absolute inset-0 blur-placeholder z-[1] transition-opacity duration-500 ${imgLoaded ? 'opacity-0' : 'opacity-100'}`} />
          {imgError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
              <i className="ri-image-line text-white/20 text-3xl" />
            </div>
          )}
          <img
            src={currentSrc}
            alt={altText}
            width={200}
            height={300}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className={`w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
            style={{ filter: 'contrast(1.04) saturate(1.1)' }}
            onLoad={() => { onLoad(); markImagePreloaded(currentSrc); }}
            onError={onError}
          />

          {/* Single gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/15 pointer-events-none z-[2]" />

          <div className="absolute top-1 left-1 right-1 z-[3] flex items-start justify-between gap-1 sm:top-2 sm:left-2 sm:right-2">
            <div className="flex flex-col gap-0.5 sm:gap-1">
              {isNew && (
                <span className="text-[9px] font-black bg-gradient-to-r from-red-500 to-red-600 text-white px-1.5 py-0.5 rounded-md tracking-wide shadow-sm">MỚI</span>
              )}
              <MovieCountdown movie={movie} />
              {getEpisodeBadge(movie.episode_current)}
            </div>
            {movie.quality && (
              <span className="text-[8px] sm:text-[9px] font-black bg-black/60 text-white/90 px-1 py-0.5 sm:px-1.5 rounded border border-white/10 tracking-wider">
                {movie.quality}
              </span>
            )}
          </div>

          {/* Play button: GIẢM shadow layers, ngắn duration */}
          <div className="absolute inset-0 z-[3] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="absolute inset-0 bg-black/30 rounded-lg sm:rounded-xl" />
            <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-red-500 scale-50 group-hover:scale-100 transition-transform duration-200 sm:h-8 sm:w-8">
              <i className="ri-play-fill text-white text-sm sm:text-base ml-0.5" />
            </div>
          </div>

          {/* Info overlay on hover — visible on mobile via active state */}
          <div className="absolute bottom-0 left-0 right-0 z-[3] hidden p-2.5 translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 sm:block">
            <div className="flex items-center gap-1.5 flex-wrap">
              {movie.time && (
                <span className="text-[10px] text-white/60 font-medium flex items-center gap-0.5">
                  <i className="ri-time-line text-[9px]" />
                  {movie.time}
                </span>
              )}
              {movie.category && movie.category[0] && (
                <>
                  <span className="text-white/20 text-[9px]">·</span>
                  <span className="text-[10px] text-white/50 font-medium">{movie.category[0].name}</span>
                </>
              )}
            </div>
          </div>

          <div className="absolute inset-0 rounded-lg border border-white/0 group-hover:border-red-500/30 transition-colors duration-200 pointer-events-none z-[3] sm:rounded-xl" />
        </div>

        {/* Info below — mobile: hiện rating + tập luôn */}
        <div className="mt-1 flex min-h-[62px] flex-col px-0.5 sm:mt-1.5 md:mt-2 md:min-h-[72px]">
          <p className="min-h-[30px] text-[10px] font-semibold leading-tight text-white/90 line-clamp-2 group-hover:text-red-400 transition-colors duration-200 sm:min-h-[30px] sm:text-[11px] md:min-h-[36px] md:text-[13px]">
            {getDisplayTitle(movie)}
          </p>
          <p className="mt-0.5 hidden min-h-[13px] text-white/30 text-[9px] md:min-h-[18px] md:text-[11px] truncate sm:block">
            {getDisplayOrigin(movie) && getDisplayOrigin(movie) !== getDisplayTitle(movie) ? getDisplayOrigin(movie) : '\u00a0'}
          </p>
          <div className="mt-auto flex min-h-[18px] items-center gap-1 md:gap-2 pt-0.5 md:min-h-[18px]">
            {movie.year && <span className="text-[9px] md:text-[11px] text-white/40 font-medium">{movie.year}</span>}
            {epText && (
              <>
                <span className="text-white/15 text-[9px]">·</span>
                <span className={`text-[9px] md:text-[11px] font-semibold ${epText.cls}`}>{epText.label}</span>
              </>
            )}
            <span className="ml-auto flex items-center gap-0.5 flex-shrink-0">
              <i className="ri-star-fill text-amber-400/70 text-[8px] md:text-[9px]" />
              <span className="text-[9px] md:text-[11px] text-white/40 font-semibold">{rating}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────
   RANK CARD
───────────────────────────────────────── */
function RankCard({ movie, rank, priority }: MovieCardProps) {
  const posterPath = movie.poster_url || movie.thumb_url;
  const fallbackPath = movie.thumb_url || movie.poster_url;
  
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    getOptimizedImageUrl(posterPath, 420, 84),
    getOptimizedImageUrl(fallbackPath, 420, 84),
    isImagePreloaded(getImageUrl(posterPath)),
  );
  const altText = buildAlt(movie);

  const isOphimSource = movie.source_site === 'ophim' || movie.source_name === 'OPhim';

  return (
    <Link to={isOphimSource ? `${movieDetailUrl(movie.slug)}?source=ophim` : movieDetailUrl(movie.slug)} className="group cursor-pointer block active:scale-[0.97] transition-transform duration-150">
      <div>
        {/* Poster */}
        <div
          className="relative overflow-hidden rounded-xl bg-[#16192a]"
          style={{ aspectRatio: '2/3' }}
        >
          <div className={`absolute inset-0 blur-placeholder z-[1] transition-opacity duration-500 ${imgLoaded ? 'opacity-0' : 'opacity-100'}`} />
          {imgError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
              <i className="ri-image-line text-white/20 text-3xl" />
            </div>
          )}
          <img
            src={currentSrc}
            alt={altText}
            width={200}
            height={300}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className={`w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
            style={{ filter: 'contrast(1.04) saturate(1.1)' }}
            onLoad={() => { onLoad(); markImagePreloaded(currentSrc); }}
            onError={onError}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none z-[2]" />

          {movie.quality && (
            <div className="absolute top-1.5 right-1.5 z-[3]">
              <span className="text-[9px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-md tracking-wider">{movie.quality}</span>
            </div>
          )}

          {/* Play: bỏ shadow phức tạp */}
          <div className="absolute inset-0 z-[3] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="absolute inset-0 bg-black/40 rounded-xl" />
            <div className="relative w-8 h-8 flex items-center justify-center bg-white/20 rounded-full scale-50 group-hover:scale-100 transition-transform duration-200">
              <i className="ri-play-fill text-white text-base ml-0.5" />
            </div>
          </div>

          <div className="absolute inset-0 rounded-xl border border-white/0 group-hover:border-white/15 transition-colors duration-200 pointer-events-none z-[3]" />
        </div>

        <div className="flex items-start gap-1 mt-0.5">
          {rank !== undefined && (
            <span className="text-xl font-black italic text-white/[0.10] leading-none w-5 flex-shrink-0 -mt-0.5 select-none">{rank}</span>
          )}
          <div className="min-w-0 flex-1 space-y-0">
            <p className="text-white/85 text-[11px] font-semibold line-clamp-2 group-hover:text-red-400 transition-colors leading-tight">{getDisplayTitle(movie)}</p>
            {getDisplayOrigin(movie) && getDisplayOrigin(movie) !== getDisplayTitle(movie) && (
              <p className="text-white/25 text-[8px] truncate italic">{getDisplayOrigin(movie)}</p>
            )}
            <div className="flex items-center gap-1 pt-0">
              {movie.year && <span className="text-[8px] text-white/35">{movie.year}</span>}
              {movie.lang && <><span className="text-white/15 text-[7px]">·</span><span className="text-[8px] text-white/35">{movie.lang}</span></>}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────
   WIDE CARD
───────────────────────────────────────── */
function WideCard({ movie, priority }: MovieCardProps) {
  const thumbPath = movie.thumb_url || movie.poster_url;
  const fallbackPath = movie.poster_url || movie.thumb_url;
  
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    getOptimizedImageUrl(thumbPath, 560, 84),
    getOptimizedImageUrl(fallbackPath, 560, 84),
    isImagePreloaded(getImageUrl(thumbPath)),
  );
  const altText = buildAlt(movie);

  const isOphimSource = movie.source_site === 'ophim' || movie.source_name === 'OPhim';

  return (
    <Link to={isOphimSource ? `${movieDetailUrl(movie.slug)}?source=ophim` : movieDetailUrl(movie.slug)} className="group cursor-pointer block active:scale-[0.97] transition-transform duration-150">
      <div className="relative">
        {/* Poster */}
        <div
          className="relative overflow-hidden rounded-xl bg-[#16192a]"
          style={{ aspectRatio: '16/9' }}
        >
          <div className={`absolute inset-0 blur-placeholder z-[1] transition-opacity duration-500 ${imgLoaded ? 'opacity-0' : 'opacity-100'}`} />
          {imgError && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
              <i className="ri-image-line text-white/20 text-3xl" />
            </div>
          )}
          <img
            src={currentSrc}
            alt={altText}
            width={320}
            height={180}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className={`w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
            style={{ filter: 'contrast(1.04) saturate(1.1)' }}
            onLoad={() => { onLoad(); markImagePreloaded(currentSrc); }}
            onError={onError}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent pointer-events-none z-[2]" />

          <div className="absolute top-2 right-2 flex gap-1 z-[3]">
            {movie.quality && (
              <span className="text-[9px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-md">{movie.quality}</span>
            )}
            {movie.lang && (
              <span className="text-[9px] font-bold bg-black/60 text-white/80 px-1.5 py-0.5 rounded-md border border-white/10">{movie.lang}</span>
            )}
          </div>

          {/* Play: bỏ shadow phức tạp */}
          <div className="absolute inset-0 flex items-center justify-center z-[3] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="absolute inset-0 bg-black/40 rounded-xl" />
            <div className="relative w-8 h-8 flex items-center justify-center bg-white/20 rounded-full scale-50 group-hover:scale-100 transition-transform duration-200">
              <i className="ri-play-fill text-white text-base ml-0.5" />
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-3 z-[3]">
            <p className="text-white text-xs font-semibold line-clamp-1 group-hover:text-red-300 transition-colors">{getDisplayTitle(movie)}</p>
          </div>

          <div className="absolute inset-0 rounded-xl border border-white/0 group-hover:border-white/15 transition-colors duration-200 pointer-events-none z-[3]" />
        </div>

        {movie.origin_name && (
          <p className="text-white/25 text-[11px] mt-1.5 truncate">{getDisplayOrigin(movie)}</p>
        )}
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────
   EXPORT
───────────────────────────────────────── */
function MovieCard({ movie, rank, variant = 'default', priority = false }: MovieCardProps) {
  if (variant === 'rank') return <RankCard  movie={movie} rank={rank} priority={priority} />;
  if (variant === 'wide') return <WideCard  movie={movie} priority={priority} />;
  return                         <DefaultCard movie={movie} priority={priority} />;
}

export default memo(MovieCard);
