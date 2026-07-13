import { memo, useMemo, useState, useCallback, useRef } from 'react';
import { useImageFallback } from '../../hooks/useImageFallback';
import { Link } from 'react-router-dom';
import type { MovieItem } from '../../types/movie';
import { getImageUrl, getMovieDisplayName } from '../../services/movieApi';
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
  const badgeBase = 'max-w-[7.5rem] truncate rounded-md px-1.5 py-0.5 text-[9px] font-black leading-none tracking-wide shadow-sm ring-1 ring-white/10';
  const s = episode_current.toLowerCase().trim();
  if (s === 'trailer') return (
    <span className={`${badgeBase} bg-orange-500/95 text-white`}>Trailer</span>
  );
  if (s === 'full' || s === 'hoàn tất' || s === 'full hd') return (
    <span className={`${badgeBase} bg-emerald-500/95 text-white`}>Full</span>
  );
  return <span className={`${badgeBase} bg-red-500/95 text-white`}>{episode_current}</span>;
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

function getDisplayTime(movie: MovieItem): string | null {
  const value = String(movie.time ?? '').trim();
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized.includes('undefined') ||
    normalized.includes('? phút') ||
    normalized === '0 phút' ||
    normalized === '0 phút/tập' ||
    normalized === 'đang cập nhật'
  ) {
    return null;
  }
  return value;
}

/* ─────────────────────────────────────────
   DEFAULT CARD
───────────────────────────────────────── */
function getVerticalPosterPaths(movie: MovieItem): { primary?: string; fallback?: string } {
  // Most sources store portrait covers in thumb_url and wide backdrops in poster_url.
  const primary = movie.thumb_url || movie.poster_url;
  const fallback = movie.poster_url && movie.poster_url !== primary ? movie.poster_url : undefined;
  return { primary, fallback };
}

function DefaultCard({ movie, priority }: MovieCardProps) {
  // Use optimized image for homepage cards to reduce bandwidth
  const { primary: posterPath, fallback: fallbackPath } = getVerticalPosterPaths(movie);
  
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    posterPath,
    fallbackPath,
    isImagePreloaded(getImageUrl(posterPath)),
    420,
    84,
    { preferredAspect: 'portrait' },
  );
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rating  = useMemo(() => (7 + Math.abs(movie.name.charCodeAt(0) % 3) * 0.5).toFixed(1), [movie.name]);
  const altText = buildAlt(movie);
  const isNew   = isNewMovie(movie);
  const displayTime = getDisplayTime(movie);

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
      className="group flex h-full cursor-pointer flex-col rounded-xl active:scale-[0.985] transition-transform duration-150"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Wrapper: không scale toàn card, chỉ scale ảnh */}
      <div className="relative flex h-full flex-col rounded-xl p-0.5 transition-[transform,box-shadow,background-color,border-color] duration-300 ease-out md:hover:z-30 md:hover:-translate-y-1 md:hover:bg-white/[0.045] md:hover:shadow-[0_18px_46px_-24px_rgba(0,0,0,0.92)]">
        {/* Poster */}
        <div
          className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-lg bg-[#151824] ring-1 ring-white/[0.055] transition-[ring-color,box-shadow] duration-300 group-hover:ring-white/[0.16] group-hover:shadow-[0_16px_38px_-30px_rgba(255,255,255,0.75)]"
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
            height={480}
            sizes="(min-width: 1536px) 184px, (min-width: 1280px) 168px, (min-width: 1024px) 16vw, (min-width: 768px) 19vw, (min-width: 640px) 23vw, 31vw"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className={`h-full w-full object-cover object-center transition-[opacity,transform,filter] duration-500 group-hover:scale-[1.025] ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
            style={{ filter: 'contrast(1.03) saturate(1.08)' }}
            onLoad={(event) => { onLoad(event); markImagePreloaded(currentSrc); }}
            onError={onError}
          />

          {/* Single gradient overlay */}
          <div className="absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0)_28%,rgba(0,0,0,0.18)_63%,rgba(0,0,0,0.82)_100%)] pointer-events-none" />

          <div className="absolute left-1.5 right-1.5 top-1.5 z-[3] flex items-start justify-between gap-1 sm:left-2 sm:right-2 sm:top-2">
            <div className="flex min-w-0 flex-col gap-1">
              {isNew && (
                <span className="text-[9px] font-black bg-gradient-to-r from-red-500 to-red-600 text-white px-1.5 py-0.5 rounded-md tracking-wide shadow-sm">MỚI</span>
              )}
              <MovieCountdown movie={movie} />
              {getEpisodeBadge(movie.episode_current)}
            </div>
            {movie.quality && (
              <span className="rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[8px] font-black leading-none tracking-wider text-white/90 backdrop-blur-sm sm:text-[9px]">
                {movie.quality}
              </span>
            )}
          </div>

          {/* Play button: GIẢM shadow layers, ngắn duration */}
          <div className="absolute inset-0 z-[3] flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <div className="absolute inset-0 bg-black/28" />
            <div className="relative flex h-9 w-9 scale-90 items-center justify-center rounded-full bg-white text-black shadow-[0_12px_32px_-16px_rgba(255,255,255,0.85)] transition-transform duration-200 group-hover:scale-100 sm:h-10 sm:w-10">
              <i className="ri-play-fill text-base sm:text-lg ml-0.5" />
            </div>
          </div>

          {/* Info overlay on hover — visible on mobile via active state */}
          <div className="absolute bottom-0 left-0 right-0 z-[3] hidden translate-y-1 p-2.5 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 sm:block">
            <div className="flex flex-wrap items-center gap-1.5">
              {displayTime && (
                <span className="flex items-center gap-0.5 rounded bg-black/38 px-1.5 py-0.5 text-[10px] font-medium text-white/72 backdrop-blur-sm">
                  <i className="ri-time-line text-[9px]" />
                  {displayTime}
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

          <div className="absolute inset-0 rounded-md ring-1 ring-white/[0.04] group-hover:ring-white/20 transition-colors duration-200 pointer-events-none z-[3] sm:rounded-lg" />
        </div>

        {/* Info below — mobile: hiện rating + tập luôn */}
          <div className="mt-1.5 flex min-h-[52px] flex-col px-0.5 transition-[padding] duration-300 sm:mt-1.5 md:mt-2 md:min-h-[68px] md:group-hover:px-2 md:group-hover:pb-2">
          <p className="min-h-[32px] text-[11px] font-bold leading-4 text-white/92 line-clamp-2 group-hover:text-white transition-colors duration-200 sm:min-h-[30px] sm:text-[11px] md:min-h-[34px] md:text-[13px]">
            {getDisplayTitle(movie)}
          </p>
          <p className="mt-0.5 hidden min-h-[13px] text-white/30 text-[9px] md:min-h-[18px] md:text-[11px] truncate sm:block">
            {getDisplayOrigin(movie) && getDisplayOrigin(movie) !== getDisplayTitle(movie) ? getDisplayOrigin(movie) : '\u00a0'}
          </p>
          <div className="mt-auto flex min-h-[18px] items-center gap-1 md:gap-2 pt-0.5 md:min-h-[18px]">
            {movie.year && <span className="text-[9px] md:text-[11px] text-white/48 font-semibold">{movie.year}</span>}
            {epText && (
              <>
                <span className="text-white/15 text-[9px]">·</span>
                <span className={`max-w-[3.9rem] truncate text-[9px] md:text-[11px] font-semibold ${epText.cls}`}>{epText.label}</span>
              </>
            )}
            <span className="ml-auto flex items-center gap-0.5 flex-shrink-0">
              <i className="ri-star-fill text-amber-400/70 text-[8px] md:text-[9px]" />
              <span className="text-[9px] md:text-[11px] text-white/40 font-semibold">{rating}</span>
            </span>
          </div>
          <div className="hidden items-center gap-1.5 pt-2 opacity-0 transition-opacity duration-200 md:flex md:group-hover:opacity-100">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-black">
              <i className="ri-play-fill text-sm ml-0.5" />
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 text-white/80">
              <i className="ri-add-line text-sm" />
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 text-white/80">
              <i className="ri-thumb-up-line text-sm" />
            </span>
            <span className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 text-white/80">
              <i className="ri-arrow-down-s-line text-sm" />
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
function DefaultCardV2({ movie, priority }: MovieCardProps) {
  const { primary: posterPath, fallback: fallbackPath } = getVerticalPosterPaths(movie);

  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    posterPath,
    fallbackPath,
    isImagePreloaded(getImageUrl(posterPath)),
    480,
    84,
    { preferredAspect: 'portrait' },
  );
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rating = useMemo(() => (7 + Math.abs(movie.name.charCodeAt(0) % 3) * 0.5).toFixed(1), [movie.name]);
  const altText = buildAlt(movie);
  const isNew = isNewMovie(movie);
  const displayTime = getDisplayTime(movie);
  const origin = getDisplayOrigin(movie);
  const title = getDisplayTitle(movie);
  const ep = (movie.episode_current ?? '').toLowerCase().trim();
  const epText = ep === 'full' || ep === 'full hd' || ep === 'hoan tat' || ep === 'hoàn tất'
    ? { label: 'Full', cls: 'text-emerald-400' }
    : ep && ep !== 'trailer'
      ? { label: movie.episode_current!, cls: 'text-white/48' }
      : null;

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
  const detailUrl = isOphimSource ? `${movieDetailUrl(movie.slug)}?source=ophim` : movieDetailUrl(movie.slug);

  return (
    <Link
      to={detailUrl}
      className="group flex h-full cursor-pointer flex-col rounded-xl active:scale-[0.985] transition-transform duration-150"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative flex h-full flex-col rounded-xl p-0.5 transition-[transform,box-shadow,background-color] duration-300 ease-out md:hover:z-30 md:hover:-translate-y-1 md:hover:bg-white/[0.035] md:hover:shadow-[0_18px_44px_-28px_rgba(0,0,0,0.88)]">
        <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-lg bg-[#151824] ring-1 ring-white/[0.06] transition-[ring-color,box-shadow] duration-300 group-hover:ring-white/[0.16] group-hover:shadow-[0_16px_36px_-30px_rgba(255,255,255,0.62)]">
          <div className={`absolute inset-0 z-[1] blur-placeholder transition-opacity duration-500 ${imgLoaded ? 'opacity-0' : 'opacity-100'}`} />
          {imgError && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#1a1d27]">
              <i className="ri-image-line text-3xl text-white/20" />
            </div>
          )}
          <img
            src={currentSrc}
            alt={altText}
            width={320}
            height={480}
            sizes="(min-width: 1800px) 220px, (min-width: 1536px) 210px, (min-width: 1280px) 190px, (min-width: 1024px) 17vw, (min-width: 768px) 22vw, (min-width: 640px) 24vw, 31vw"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className={`h-full w-full object-cover object-center transition-[opacity,transform,filter] duration-500 group-hover:scale-[1.025] ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
            style={{ filter: 'contrast(1.03) saturate(1.08)' }}
            onLoad={(event) => { onLoad(event); markImagePreloaded(currentSrc); }}
            onError={onError}
          />

          <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0)_34%,rgba(0,0,0,0.12)_68%,rgba(0,0,0,0.72)_100%)]" />

          <div className="absolute left-1.5 right-1.5 top-1.5 z-[3] flex items-start justify-between gap-1 sm:left-2 sm:right-2 sm:top-2">
            <div className="flex min-w-0 flex-col gap-1">
              {isNew && <span className="w-fit rounded-md bg-gradient-to-r from-red-500 to-red-600 px-1.5 py-0.5 text-[9px] font-black leading-none tracking-wide text-white shadow-sm ring-1 ring-white/10">Mới</span>}
              <MovieCountdown movie={movie} />
              {getEpisodeBadge(movie.episode_current)}
            </div>
            {movie.quality && (
              <span className="rounded-md border border-white/10 bg-black/55 px-1.5 py-0.5 text-[8px] font-black leading-none tracking-wider text-white/90 backdrop-blur-sm sm:text-[9px]">
                {movie.quality}
              </span>
            )}
          </div>

          <div className="absolute inset-0 z-[3] flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <div className="absolute inset-0 bg-black/22" />
            <div className="relative flex h-9 w-9 scale-90 items-center justify-center rounded-full bg-white text-black shadow-[0_12px_32px_-16px_rgba(255,255,255,0.85)] transition-transform duration-200 group-hover:scale-100 sm:h-10 sm:w-10">
              <i className="ri-play-fill ml-0.5 text-base sm:text-lg" />
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-[3] hidden translate-y-1 p-2.5 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 sm:block">
            <div className="flex flex-wrap items-center gap-1.5">
              {displayTime && (
                <span className="flex items-center gap-1 rounded bg-black/42 px-2 py-1 text-[11px] font-semibold text-white/76 backdrop-blur-sm">
                  <i className="ri-time-line text-[10px]" />
                  {displayTime}
                </span>
              )}
              {movie.category?.[0]?.name && (
                <span className="max-w-[8.5rem] truncate rounded bg-black/38 px-2 py-1 text-[10.5px] font-semibold text-white/68 backdrop-blur-sm">
                  {movie.category[0].name}
                </span>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 z-[3] rounded-lg ring-1 ring-white/[0.035] transition-colors duration-200 group-hover:ring-white/16" />
        </div>

        <div className="mt-2 flex min-h-[68px] flex-col px-0.5 pb-1 sm:mt-2 md:min-h-[78px]">
          <p className="min-h-[32px] text-[12px] font-bold leading-snug text-white/92 line-clamp-2 transition-colors duration-200 group-hover:text-white sm:min-h-[36px] sm:text-[13px] md:min-h-[39px] md:text-[14px] xl:text-[14.5px]">
            {title}
          </p>
          <p className="mt-0.5 hidden min-h-[15px] truncate text-[10.5px] font-medium text-white/36 sm:block md:min-h-[18px] md:text-[12px]">
            {origin && origin !== title ? origin : '\u00a0'}
          </p>
          <div className="mt-auto flex min-h-[21px] items-center gap-1.5 pt-1 md:min-h-[22px] md:gap-2">
            {movie.year && <span className="rounded-md bg-white/[0.055] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white/55 md:text-[11px]">{movie.year}</span>}
            {epText && <span className={`min-w-0 truncate text-[10px] font-bold md:text-[11px] ${epText.cls}`}>{epText.label}</span>}
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <i className="ri-star-fill text-[9px] text-amber-400/75 md:text-[10px]" />
              <span className="text-[10px] font-bold text-white/50 md:text-[11px]">{rating}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function RankCard({ movie, rank, priority }: MovieCardProps) {
  const { primary: posterPath, fallback: fallbackPath } = getVerticalPosterPaths(movie);
  
  const { currentSrc, loaded: imgLoaded, hasError: imgError, onLoad, onError } = useImageFallback(
    posterPath,
    fallbackPath,
    isImagePreloaded(getImageUrl(posterPath)),
    420,
    84,
    { preferredAspect: 'portrait' },
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
            width={320}
            height={480}
            sizes="(min-width: 1536px) 184px, (min-width: 1280px) 168px, (min-width: 1024px) 16vw, (min-width: 768px) 19vw, (min-width: 640px) 23vw, 31vw"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className={`w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.025] ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
            style={{ filter: 'contrast(1.03) saturate(1.08)' }}
            onLoad={(event) => { onLoad(event); markImagePreloaded(currentSrc); }}
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
    thumbPath,
    fallbackPath,
    isImagePreloaded(getImageUrl(thumbPath)),
    760,
    88,
    { preferredAspect: 'landscape' },
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
            width={560}
            height={315}
            sizes="(min-width: 1280px) 360px, (min-width: 1024px) 30vw, 90vw"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            className={`w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
            style={{ filter: 'contrast(1.04) saturate(1.1)' }}
            onLoad={(event) => { onLoad(event); markImagePreloaded(currentSrc); }}
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
  return                         <DefaultCardV2 movie={movie} priority={priority} />;
}

export default memo(MovieCard);
