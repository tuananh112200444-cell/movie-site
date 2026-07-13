import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMoviesByType } from '../../../hooks/useMovies';
import { getFeaturedUrl, getPosterUrl } from '../../../services/movieApi';
import { preloadMoviePosters } from '../../../utils/imagePreloader';
import type { Movie } from '../../../types/movie';
import { HOME_POSTER_ITEM_CLASS } from './homePosterSizing';

export default function TrailerMoviesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || triggered) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setTriggered(true); observer.disconnect(); } },
      { rootMargin: '200px' } // Giảm từ 800px xuống 200px
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered]);

  return (
    <div ref={ref} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 280px' }}>
      {triggered ? <TrailerContent /> : <SectionSkeleton />}
    </div>
  );
}

function TrailerContent() {
  const { movies, loading } = useMoviesByType('phim-sap-chieu', 1, 1, 'modified.time');

  useEffect(() => {
    if (movies.length > 0) {
      preloadMoviePosters(movies.slice(0, 14), getFeaturedUrl, {
        batchSize: 4,
        delayBetweenBatches: 300,
        delayBetweenImages: 30,
      });
    }
  }, [movies]);

  /* Ưu tiên phim "Trailer" / đang cập nhật lên trước */
  const trailerMovies = [...movies]
    .sort((a, b) => {
      const aIsTrailer = isTrailer(a.episode_current);
      const bIsTrailer = isTrailer(b.episode_current);
      if (aIsTrailer && !bIsTrailer) return -1;
      if (!aIsTrailer && bIsTrailer) return 1;
      return 0;
    })
    .slice(0, 14);

  if (loading) return <SectionSkeleton />;
  if (trailerMovies.length === 0) return null;

  return (
    <section className="mb-7 md:mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 md:mb-5 gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-1 h-5 bg-orange-500 rounded-full" />
          <h3 className="text-base md:text-lg font-bold gradient-heading-warm flex items-center gap-2 truncate">
            <i className="ri-film-line text-orange-400" />
            Phim Đang Cập Nhật – Chỉ Có Trailer
          </h3>
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full uppercase">
            <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse inline-block" />
            Sắp Ra Mắt
          </span>
        </div>
        <Link
          to="/phim-sap-chieu"
          className="text-red-400 hover:text-red-300 text-xs md:text-sm flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap active:scale-95 active:text-red-200"
        >
          Xem Tất Cả <i className="ri-arrow-right-line" />
        </Link>
      </div>

      {/* Horizontal scroll – landscape wide cards */}
      <div
        className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-3 md:gap-3"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {trailerMovies.map((movie, idx) => (
          <TrailerCard key={movie._id} movie={movie} rank={idx + 1} />
        ))}
      </div>

      {/* Gradient hint for horizontal scroll */}
      <div className="relative -mt-14 h-14 pointer-events-none"
        style={{ background: 'linear-gradient(to right, transparent 85%, #0f1117 100%)' }}
      />
    </section>
  );
}

function isTrailer(ep?: string): boolean {
  if (!ep) return true;
  const s = ep.toLowerCase().trim();
  return s === 'trailer' || s === '' || s === 'đang cập nhật';
}

function getHotScore(rank: number): string {
  const scores = [9.8, 9.6, 9.5, 9.3, 9.1, 8.9, 8.7, 8.5, 8.3, 8.1, 7.9, 7.7, 7.5, 7.3];
  return (scores[rank] ?? 7.0).toFixed(1);
}

interface TrailerCardProps { movie: Movie; rank: number }

function TrailerCard({ movie, rank }: TrailerCardProps) {
  const thumb = getFeaturedUrl(movie.thumb_url || movie.poster_url);
  const poster = getPosterUrl(movie.poster_url || movie.thumb_url);
  const genreNames = movie.category?.map((c: { name: string }) => c.name).slice(0, 2) ?? [];
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      to={`/phim/${encodeURIComponent(movie.slug)}`}
      className={`block cursor-pointer group ${HOME_POSTER_ITEM_CLASS}`}
    >
      {/* Thumbnail landscape — inside a frame, all hover via CSS group-hover */}
      <div
        className={`
          relative rounded-xl overflow-hidden bg-[#1a1d27]
          border transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          border-white/[0.06]
          group-hover:border-orange-400/40 group-hover:shadow-xl group-hover:shadow-orange-500/10 group-hover:-translate-y-1
        `}
        style={{ aspectRatio: '16/9' }}
      >
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <i className="ri-image-line text-white/20 text-3xl" />
          </div>
        )}
        <img
          src={thumb}
          alt={movie.name}
          loading="lazy"
          decoding="async"
          className={`
            w-full h-full object-cover object-top
            transition-transform duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]
            ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}
            group-hover:scale-110
          `}
          style={{ filter: 'contrast(1.04) saturate(1.1)' }}
          onLoad={() => setImgLoaded(true)}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== poster) {
              target.src = poster;
            } else {
              setImgError(true);
            }
            setImgLoaded(true);
          }}
        />

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors duration-500" />

        {/* TRAILER badge top-left */}
        <div className="absolute top-2 left-2 z-[12]">
          <span className="
            flex items-center gap-1 text-[10px] font-black text-white px-2 py-0.5 rounded-md uppercase tracking-wide shadow-lg
            bg-orange-500/90 group-hover:bg-orange-500 transition-colors duration-300
          ">
            <i className="ri-film-line text-[9px]" /> TRAILER
          </span>
        </div>

        {/* Rank badge top-right */}
        <div className="absolute top-2 right-2 z-[12]">
          <span className={`
            w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-black shadow-lg
            transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
            group-hover:scale-110
            ${
              rank === 1 ? 'bg-amber-400 text-gray-900' :
              rank === 2 ? 'bg-slate-300 text-gray-900' :
              rank === 3 ? 'bg-amber-600 text-white' :
              'bg-black/60 text-white/70'
            }
          `}>
            {rank}
          </span>
        </div>

        {/* Play icon center */}
        <div className="absolute inset-0 z-[10] flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors duration-500">
          <div className="
            w-11 h-11 flex items-center justify-center bg-orange-500/90 rounded-full shadow-xl
            opacity-0 scale-50
            group-hover:opacity-100 group-hover:scale-100
            transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ">
            <i className="ri-play-fill text-white text-xl ml-0.5" />
          </div>
        </div>

        {/* Hot score bottom-right */}
        <div className="absolute bottom-2 right-2 z-[12]">
          <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400 bg-black/70 px-1.5 py-0.5 rounded-md">
            <i className="ri-fire-fill text-[9px]" /> {getHotScore(rank - 1)}
          </span>
        </div>

        {/* Shimmer sweep on top bar for top 3 */}
        {rank <= 3 && (
          <div className="absolute top-0 left-0 right-0 h-[2px] z-[11] overflow-hidden rounded-full">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer-sweep" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-1.5 flex min-h-[48px] flex-col px-0.5 md:mt-2.5 md:min-h-[54px]">
        <p className="
          min-h-[34px] text-[11px] leading-[17px] md:min-h-[18px] md:text-xs md:leading-[18px] font-semibold line-clamp-2 md:line-clamp-1
          transition-all duration-300 ease-out
          text-white group-hover:text-orange-400
        ">
          {movie.name}
        </p>
        <p className="mt-0.5 h-[13px] text-white/35 text-[9px] md:h-[16px] md:text-[11px] truncate">{movie.origin_name || '\u00a0'}</p>
        <div className="hidden sm:flex items-center gap-1.5 mt-1.5 flex-wrap">
          {movie.year && (
            <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-md">{movie.year}</span>
          )}
          {genreNames.map((g) => (
            <span key={g} className="text-[10px] text-orange-400/70 bg-orange-500/5 border border-orange-500/15 px-1.5 py-0.5 rounded-md">
              {g}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

function SectionSkeleton() {
  return (
    <div className="mb-7 md:mb-12">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-orange-500/20 rounded-full" />
          <div className="h-5 w-60 skeleton rounded" />
        </div>
      </div>
      <div className="flex gap-2.5 overflow-hidden md:gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={HOME_POSTER_ITEM_CLASS}>
            <div className="skeleton rounded-xl" style={{ aspectRatio: '16/9' }} />
            <div className="mt-2 h-3 skeleton rounded w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
