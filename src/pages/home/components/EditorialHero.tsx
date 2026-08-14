import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useImageFallback } from '../../../hooks/useImageFallback';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { getOptimizedImageUrl } from '../../../services/movieApi';
import { movieDetailUrl } from '../../../utils/slugEncoder';
import type { MovieItem } from '../../../types/movie';

interface EditorialHeroProps {
  movies: MovieItem[];
  loading?: boolean;
}

function plainText(value?: string) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#39;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function EditorialHero({ movies, loading = false }: EditorialHeroProps) {
  const compactHero = useMediaQuery('(max-width: 639px)');
  const mediumHero = useMediaQuery('(min-width: 640px) and (max-width: 1023px)');
  const imageWidth = compactHero ? 560 : mediumHero ? 960 : 1280;
  const imageQuality = compactHero ? 78 : mediumHero ? 80 : 82;
  const imageRef = useRef<HTMLImageElement>(null);
  const featured = movies.slice(0, 5);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const safeIndex = featured.length > 0 ? activeIndex % featured.length : 0;
  const movie = featured[safeIndex];
  const nextMovie = featured.length > 1
    ? featured[(safeIndex + 1) % featured.length]
    : undefined;
  const nextImagePath = featured.length > 1
    ? (compactHero
        ? (nextMovie?.poster_url || nextMovie?.thumb_url)
        : (nextMovie?.thumb_url || nextMovie?.poster_url))
    : '';
  const nextMovies = featured.length > 1
    ? Array.from({ length: Math.min(3, featured.length - 1) }, (_, offset) => {
        const index = (safeIndex + offset + 1) % featured.length;
        return { movie: featured[index], index };
      })
    : [];
  const primaryImage = compactHero
    ? (movie?.poster_url || movie?.thumb_url)
    : (movie?.thumb_url || movie?.poster_url);
  const fallbackImage = compactHero
    ? (movie?.thumb_url || movie?.poster_url)
    : (movie?.poster_url || movie?.thumb_url);
  const { currentSrc, loaded, hasError, onLoad, onError } = useImageFallback(
    primaryImage,
    fallbackImage,
    false,
    imageWidth,
    imageQuality,
    { preferredAspect: compactHero ? 'portrait' : 'landscape' },
  );

  // A memory-cached image can complete before the fallback hook's reset
  // effect runs. Reconcile that state so a sharp, already-downloaded hero is
  // never left at opacity: 0 after a warm navigation.
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    const ratio = image.naturalWidth / image.naturalHeight;
    if (compactHero ? ratio <= 1.05 : ratio >= 1.2) onLoad();
    else onError();
  }, [compactHero, currentSrc, onError, onLoad]);

  useEffect(() => {
    if (featured.length === 0 || activeIndex < featured.length) return;
    setActiveIndex(0);
  }, [activeIndex, featured.length]);

  useEffect(() => {
    if (featured.length < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setActiveIndex((current) => (current + 1) % featured.length);
      }
    }, 7200);
    return () => window.clearInterval(timer);
  }, [featured.length, paused]);

  useEffect(() => {
    if (featured.length < 2) return;
    if (!nextImagePath) return;

    const timer = window.setTimeout(() => {
      const image = new Image();
      image.decoding = 'async';
      image.src = getOptimizedImageUrl(nextImagePath, imageWidth, imageQuality);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [featured.length, imageQuality, imageWidth, nextImagePath]);

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

  return (
    <section
      className={`editorial-hero${paused ? ' is-paused' : ''}`}
      aria-labelledby="editorial-hero-title"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setPaused(true); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setPaused(false); }}
    >
      <Link key={`visual-${movie._id || movie.slug}`} to={movieDetailUrl(movie.slug)} className="editorial-hero-visual" aria-label={`Mở phim ${movie.name}`}>
        {!loaded && !hasError && <div className="absolute inset-0 skeleton" />}
        {!hasError && (
          <img
            ref={imageRef}
            src={currentSrc}
            alt={movie.name}
            width={compactHero ? 720 : 1280}
            height={compactHero ? 1080 : 720}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onLoad={onLoad}
            onError={onError}
            className={loaded ? 'is-loaded' : ''}
          />
        )}
        {hasError && <div className="editorial-image-fallback"><i className="ri-film-line" aria-hidden="true" /></div>}
      </Link>

      <div className="editorial-hero-wash" aria-hidden="true" />

      <div className="editorial-hero-number" aria-hidden="true">
        <span>Now showing</span>
        <strong>{String(safeIndex + 1).padStart(2, '0')}</strong>
      </div>

      <div key={`copy-${movie._id || movie.slug}`} className="editorial-hero-copy">
        <p className="editorial-hero-kicker">
          <span aria-hidden="true" />
          KhoPhim tuyển chọn hôm nay
        </p>

        <div className="editorial-hero-meta">
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

      {nextMovies.length > 0 && (
        <aside className="editorial-hero-queue" aria-label="Phim tiếp theo">
          <p>Tiếp theo</p>
          {nextMovies.map(({ movie: nextMovie, index }) => (
            <button key={nextMovie.slug} type="button" onClick={() => setActiveIndex(index)}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{nextMovie.name}</strong>
              <i className="ri-arrow-right-up-line" aria-hidden="true" />
            </button>
          ))}
        </aside>
      )}

      <div className="editorial-hero-footer">
        <span>{movie.lang || 'Vietsub'}{movie.episode_current ? ` · ${movie.episode_current}` : ''}</span>
        <div className="editorial-hero-controls" aria-label="Điều khiển phim nổi bật">
          <button type="button" onClick={() => setActiveIndex((safeIndex - 1 + featured.length) % featured.length)} aria-label="Phim nổi bật trước">
            <i className="ri-arrow-left-line" aria-hidden="true" />
          </button>
          <span>{String(safeIndex + 1).padStart(2, '0')} / {String(featured.length).padStart(2, '0')}</span>
          <button type="button" onClick={() => setActiveIndex((safeIndex + 1) % featured.length)} aria-label="Phim nổi bật tiếp theo">
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
