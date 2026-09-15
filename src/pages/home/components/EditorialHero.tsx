import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent, type TouchEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { getOptimizedImageUrl } from '../../../services/movieApi';
import { movieDetailUrl } from '../../../utils/slugEncoder';
import type { MovieItem } from '../../../types/movie';

interface EditorialHeroProps {
  movies: MovieItem[];
  loading?: boolean;
  onReady?: () => void;
  variant?: 'editorial' | 'midnight';
}

const HERO_DISPLAY_LIMIT = 5;

function plainText(value?: string) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#39;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveHeroImage(path: string | undefined, movie: MovieItem | undefined): string {
  const raw = String(path || '').trim();
  if (!raw || /^(?:https?:|data:|blob:)/i.test(raw)) return raw;
  const clean = raw.replace(/^\/+/, '');
  const source = String(movie?.source_site || movie?.source_name || '').toLowerCase();
  if (/phimapi|kkphim/.test(source)) return `https://phimimg.com/${clean}`;
  if (/ophim/.test(source)) return `https://img.ophim.live/${clean.startsWith('uploads/') ? clean : `uploads/movies/${clean}`}`;
  if (/vsmov/.test(source)) return `https://vsmov.com/${clean}`;
  return raw.startsWith('/') ? raw : `/${clean}`;
}

function getResponsiveHeroImage(url: string, compact: boolean): string {
  if (!url || !/^https?:/i.test(url)) return url;
  if (/^https?:\/\/image\.tmdb\.org\/t\/p\//i.test(url)) {
    return url.replace(/\/t\/p\/[^/]+\//i, `/t/p/${compact ? 'w780' : 'w1280'}/`);
  }
  const phimimg = url.match(/^https?:\/\/(phimimg\.com)(\/[^?#]+)(?:[?#].*)?$/i);
  if (phimimg) {
    return `https://i0.wp.com/${phimimg[1]}${phimimg[2]}?w=${compact ? 900 : 1440}&quality=${compact ? 82 : 84}&strip=all`;
  }
  if (/^https?:\/\/icdn\.darkbytes\.xyz\//i.test(url)) return url;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${compact ? 900 : 1440}&q=${compact ? 82 : 84}&output=webp&fit=cover&we&default=1`;
}

function buildHeroImageSources(
  paths: Array<string | undefined>,
  movie: MovieItem | undefined,
  compact: boolean,
): string[] {
  const originals = [...new Set(
    paths
      .map((path) => resolveHeroImage(path, movie))
      .filter(Boolean),
  )];
  const optimized = originals.map((url) => getResponsiveHeroImage(url, compact));
  return [...new Set([...optimized, ...originals])];
}

function getHeroThumbnail(movie: MovieItem): string {
  const original = resolveHeroImage(
    movie.hero_backdrop_url || movie.thumb_url || movie.hero_poster_url || movie.poster_url,
    movie,
  );
  return getOptimizedImageUrl(original, 96, 78, 96);
}

interface HeroArtworkProps {
  movie: MovieItem;
  compact: boolean;
  active: boolean;
  shouldLoad: boolean;
  priority: boolean;
  preferLandscape?: boolean;
  onSettled: () => void;
}

function HeroArtwork({ movie, compact, active, shouldLoad, priority, preferLandscape = false, onSettled }: HeroArtworkProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const reportedRef = useRef(false);
  const portraitMode = compact && !preferLandscape;
  const primaryImage = portraitMode
    ? (movie.hero_poster_url || movie.poster_url || movie.hero_backdrop_url || movie.thumb_url)
    : (movie.hero_backdrop_url || movie.thumb_url || movie.hero_poster_url || movie.poster_url);
  const fallbackImage = portraitMode
    ? (movie.poster_url || movie.hero_poster_url || movie.thumb_url || movie.hero_backdrop_url)
    : (movie.thumb_url || movie.hero_backdrop_url || movie.poster_url || movie.hero_poster_url);
  const imageSources = useMemo(
    () => buildHeroImageSources([primaryImage, fallbackImage], movie, compact),
    [compact, fallbackImage, movie, primaryImage],
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const currentSrc = imageSources[Math.min(imageIndex, Math.max(0, imageSources.length - 1))] || '';

  useLayoutEffect(() => {
    reportedRef.current = false;
    setImageIndex(0);
    setLoaded(false);
    setHasError(false);
  }, [imageSources]);

  const tryNextImage = useCallback(() => {
    if (imageIndex < imageSources.length - 1) {
      setLoaded(false);
      setImageIndex((current) => current + 1);
      return;
    }
    setLoaded(true);
    setHasError(true);
  }, [imageIndex, imageSources.length]);

  const handleLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      tryNextImage();
      return;
    }
    const ratio = image.naturalWidth / image.naturalHeight;
    if ((portraitMode ? ratio > 1.05 : ratio < 1.2) && imageIndex < imageSources.length - 1) {
      tryNextImage();
      return;
    }
    setLoaded(true);
    setHasError(false);
  }, [imageIndex, imageSources.length, portraitMode, tryNextImage]);

  useEffect(() => {
    if (!shouldLoad || reportedRef.current || (!loaded && !hasError)) return;
    reportedRef.current = true;
    onSettled();
  }, [hasError, loaded, onSettled, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;
    const image = imageRef.current;
    if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    const ratio = image.naturalWidth / image.naturalHeight;
    if (portraitMode ? ratio <= 1.05 : ratio >= 1.2) {
      setLoaded(true);
      setHasError(false);
    } else {
      tryNextImage();
    }
  }, [currentSrc, portraitMode, shouldLoad, tryNextImage]);

  return (
    <Link
      to={movieDetailUrl(movie.slug)}
      className={`editorial-hero-slide${active ? ' is-active' : ''}`}
      aria-label={active ? `Mở phim ${movie.name}` : undefined}
      aria-hidden={!active}
      tabIndex={active ? 0 : -1}
    >
      <div className="editorial-hero-slide-media">
        {shouldLoad && !loaded && !hasError && <div className="editorial-hero-slide-skeleton skeleton" />}
        {shouldLoad && !hasError && currentSrc && (
          <img
            ref={imageRef}
            src={currentSrc}
            alt={active ? movie.name : ''}
            width={portraitMode ? 1080 : 1600}
            height={portraitMode ? 1620 : 900}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'low'}
            decoding="async"
            draggable={false}
            onLoad={handleLoad}
            onError={tryNextImage}
            className={loaded ? 'is-loaded' : ''}
          />
        )}
        {shouldLoad && hasError && (
          <div className="editorial-image-fallback"><i className="ri-film-line" aria-hidden="true" /></div>
        )}
      </div>
    </Link>
  );
}

export default function EditorialHero({ movies, loading = false, onReady, variant = 'editorial' }: EditorialHeroProps) {
  const compactHero = useMediaQuery('(max-width: 639px)');
  const featured = movies.slice(0, HERO_DISPLAY_LIMIT);
  const featuredKey = featured.map((movie) => movie._id || movie.slug).join('|');
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [firstArtworkReady, setFirstArtworkReady] = useState(false);
  const [requestedIndexes, setRequestedIndexes] = useState<Set<number>>(() => new Set([0]));
  const [settledIndexes, setSettledIndexes] = useState<Set<number>>(() => new Set());
  const pendingIndexRef = useRef<number | null>(null);
  const parentReadyNotifiedRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);
  const safeIndex = featured.length > 0 ? activeIndex % featured.length : 0;
  const movie = featured[safeIndex];

  useLayoutEffect(() => {
    setActiveIndex(0);
    setFirstArtworkReady(false);
    setRequestedIndexes(new Set([0]));
    setSettledIndexes(new Set());
    pendingIndexRef.current = null;
  }, [featured.length, featuredKey]);

  const requestSlide = useCallback((requestedIndex: number) => {
    if (featured.length < 2) return;
    const index = (requestedIndex + featured.length) % featured.length;
    setRequestedIndexes((current) => {
      const next = new Set(current);
      next.add(index);
      return next;
    });
    if (settledIndexes.has(index)) {
      pendingIndexRef.current = null;
      setActiveIndex(index);
    } else {
      pendingIndexRef.current = index;
    }
  }, [featured.length, settledIndexes]);

  const handleArtworkSettled = useCallback((index: number) => {
    setSettledIndexes((current) => {
      if (current.has(index)) return current;
      const next = new Set(current);
      next.add(index);
      return next;
    });
    if (index === 0) {
      setFirstArtworkReady(true);
      if (!parentReadyNotifiedRef.current) {
        parentReadyNotifiedRef.current = true;
        onReady?.();
      }
    }
    if (pendingIndexRef.current === index) {
      pendingIndexRef.current = null;
      setActiveIndex(index);
    }
  }, [onReady]);

  useEffect(() => {
    if (!firstArtworkReady || compactHero || featured.length < 2) return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || /(?:^|-)2g$|3g$/i.test(connection?.effectiveType || '')) return;
    const timer = window.setTimeout(() => {
      const nextIndex = (safeIndex + 1) % featured.length;
      setRequestedIndexes((current) => new Set(current).add(nextIndex));
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [compactHero, featured.length, featuredKey, firstArtworkReady, safeIndex]);

  useEffect(() => {
    if (featured.length < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') requestSlide(safeIndex + 1);
    }, 7200);
    return () => window.clearInterval(timer);
  }, [featured.length, paused, requestSlide, safeIndex]);

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(delta) < 45) return;
    requestSlide(safeIndex + (delta < 0 ? 1 : -1));
  };

  if (loading && !movie) {
    return (
      <section className="editorial-hero editorial-hero-loading" aria-label="Phim nổi bật đang tải">
        <div className="editorial-hero-copy">
          <div className="h-3 w-28 rounded skeleton" />
          <div className="mt-5 h-14 w-3/4 rounded skeleton" />
          <div className="mt-4 h-4 w-full rounded skeleton" />
          <div className="mt-2 h-4 w-4/5 rounded skeleton" />
        </div>
        <div className="editorial-hero-visual skeleton" />
      </section>
    );
  }

  if (!movie) return null;

  const synopsis = plainText(movie.content);
  const genres = movie.category?.slice(0, 2) ?? [];
  const rating = Number(movie.tmdb_vote_average || 0);

  return (
    <section
      className={`editorial-hero${paused ? ' is-paused' : ''}`}
      aria-labelledby="editorial-hero-title"
      aria-label="5 phim được đánh giá cao nhất"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setPaused(true); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setPaused(false); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="editorial-hero-visual" aria-live="off">
        {featured.map((featuredMovie, index) => (
          <HeroArtwork
            key={featuredMovie._id || featuredMovie.slug}
            movie={featuredMovie}
            compact={compactHero}
            active={index === safeIndex}
            shouldLoad={requestedIndexes.has(index)}
            priority={index === 0}
            preferLandscape={variant === 'midnight'}
            onSettled={() => handleArtworkSettled(index)}
          />
        ))}
      </div>

      <div className="editorial-hero-wash" aria-hidden="true" />

      <div className="editorial-hero-number" aria-hidden="true">
        <span>Top rating</span>
        <strong>{String(safeIndex + 1).padStart(2, '0')}</strong>
      </div>

      <div key={`copy-${movie._id || movie.slug}`} className="editorial-hero-copy">
        <p className="editorial-hero-kicker">
          <span aria-hidden="true" />
          {HERO_DISPLAY_LIMIT} phim được đánh giá cao nhất
        </p>

        <div className="editorial-hero-meta">
          {rating > 0 && <span className="editorial-rating-pill">★ {rating.toFixed(1)} TMDb</span>}
          {movie.year && <span>{movie.year}</span>}
          {genres.map((genre) => (
            <Link key={genre.slug} to={`/the-loai/${genre.slug}`}>{genre.name}</Link>
          ))}
          {movie.quality && <span>{movie.quality}</span>}
        </div>

        <h2 id="editorial-hero-title">{movie.name}</h2>
        {movie.origin_name && <p className="editorial-origin-name">{movie.origin_name}</p>}
        {synopsis && <p className="editorial-synopsis">{synopsis}</p>}

        <div className="editorial-hero-actions">
          <Link to={movieDetailUrl(movie.slug)} className="editorial-watch-button">
            <i className="ri-play-fill" aria-hidden="true" />
            Xem phim
          </Link>
          <Link to={movieDetailUrl(movie.slug)} className="editorial-detail-link">
            Chi tiết <i className="ri-arrow-right-up-line" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {featured.length > 1 && (
        <div className="editorial-hero-thumbnails" aria-label={`Chọn một trong ${featured.length} phim điểm cao`}>
          {featured.map((thumbnailMovie, index) => (
            <button
              key={thumbnailMovie._id || thumbnailMovie.slug}
              type="button"
              className={index === safeIndex ? 'is-active' : ''}
              aria-label={`Chuyển đến ${thumbnailMovie.name}`}
              aria-current={index === safeIndex ? 'true' : undefined}
              onPointerEnter={() => setRequestedIndexes((current) => new Set(current).add(index))}
              onFocus={() => setRequestedIndexes((current) => new Set(current).add(index))}
              onClick={() => requestSlide(index)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <img src={getHeroThumbnail(thumbnailMovie)} alt="" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
            </button>
          ))}
        </div>
      )}

      <div className="editorial-hero-footer">
        <span>{movie.lang || 'Vietsub'}{movie.episode_current ? ` · ${movie.episode_current}` : ''}</span>
        <div className="editorial-hero-controls" aria-label="Điều khiển phim nổi bật">
          <button type="button" onClick={() => requestSlide(safeIndex - 1)} aria-label="Phim điểm cao trước">
            <i className="ri-arrow-left-line" aria-hidden="true" />
          </button>
          <span>{String(safeIndex + 1).padStart(2, '0')} / {String(featured.length).padStart(2, '0')}</span>
          <button type="button" onClick={() => requestSlide(safeIndex + 1)} aria-label="Phim điểm cao tiếp theo">
            <i className="ri-arrow-right-line" aria-hidden="true" />
          </button>
        </div>
      </div>

      {featured.length > 1 && (
        <div className="editorial-hero-progress" aria-hidden="true">
          <span key={safeIndex} />
        </div>
      )}
    </section>
  );
}
