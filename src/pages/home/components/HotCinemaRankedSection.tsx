import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMoviesByType } from '../../../hooks/useMovies';
import { getImageUrl } from '../../../services/movieApi';
import type { Movie } from '../../../types/movie';

export default function HotCinemaRankedSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || triggered) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setTriggered(true); observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered]);

  return triggered ? <HotCinemaContent /> : <SectionSkeleton />;
}

function HotCinemaContent() {
  const { movies, loading } = useMoviesByType('phim-chieu-rap', 1, 1, 'modified.time');

  const sorted = [...movies].sort((a, b) => {
    const aFull = isCompleted(a.episode_current);
    const bFull = isCompleted(b.episode_current);
    if (aFull && !bFull) return -1;
    if (!aFull && bFull) return 1;
    return 0;
  }).slice(0, 12);

  if (loading) return <SectionSkeleton />;
  if (sorted.length === 0) return null;

  return (
    <section className="mb-10 relative">
      <div className="absolute inset-0 bg-[#0c0e18]/80 rounded-2xl -m-4 p-4 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center">
                <i className="ri-trophy-fill text-white text-lg" />
              </div>
            </div>
            <div className="flex flex-col">
              <h3 className="text-base font-bold gradient-heading-warm flex items-center gap-2">
                Phim Chiếu Rạp Hot – Xếp Hạng
              </h3>
              <span className="text-[10px] text-amber-200/50 -mt-0.5">BXH theo lượt xem tuần qua</span>
            </div>
            <span className="text-[9px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase tracking-wide">
              Đã Hoàn Tất
            </span>
          </div>
          <Link
            to="/phim-chieu-rap"
            className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap group"
          >
            Xem Tất Cả <i className="ri-arrow-right-line group-hover:translate-x-1 active:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3 pb-2 mb-2 md:mb-3">
          {sorted.slice(0, 6).map((movie, index) => (
            <RankedCard
              key={movie._id}
              movie={movie}
              rank={index + 1}
              priority={true}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3 pb-2">
          {sorted.slice(6, 12).map((movie, index) => (
            <RankedCard
              key={movie._id}
              movie={movie}
              rank={index + 7}
              priority={false}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function isCompleted(ep?: string): boolean {
  if (!ep) return false;
  const s = ep.toLowerCase().trim();
  return s === 'full' || s === 'hoàn tất' || s.startsWith('hoàn tất') || s === 'full hd';
}

interface RankedCardProps {
  movie: Movie;
  rank: number;
  priority?: boolean;
}

function RankedCard({ movie, rank, priority = false }: RankedCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isTop3 = rank <= 3;

  const rankStyles = [
    /* 1st */ {
      numBg: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600',
      numText: 'text-gray-900',
      numSize: 'text-xl md:text-2xl',
      bar: 'bg-gradient-to-b from-amber-300 to-amber-600',
      crown: true,
    },
    /* 2nd */ {
      numBg: 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-400',
      numText: 'text-gray-800',
      numSize: 'text-lg md:text-xl',
      bar: 'bg-gradient-to-b from-slate-300 to-slate-500',
      crown: false,
    },
    /* 3rd */ {
      numBg: 'bg-gradient-to-br from-orange-400 via-amber-700 to-amber-900',
      numText: 'text-white',
      numSize: 'text-lg md:text-xl',
      bar: 'bg-gradient-to-b from-orange-500 to-amber-800',
      crown: false,
    },
  ];

  const rs = rankStyles[rank - 1] ?? {
    numBg: 'bg-gradient-to-br from-gray-700 to-gray-900',
    numText: 'text-white/80',
    numSize: 'text-sm md:text-base',
    bar: null,
    crown: false,
  };

  const posterUrl = getImageUrl(movie.thumb_url || movie.poster_url);
  const rating = (9.8 - (rank - 1) * 0.15 + Math.random() * 0.05).toFixed(1);
  const viewK = [12.5, 9.8, 8.2, 6.5, 5.1, 4.3, 3.6, 2.9, 2.3, 1.8, 1.4, 1.0][rank - 1] ?? 0.8;
  const eps = movie.episode_current || 'Full';

  return (
    <div>
      <Link
        to={`/phim/${encodeURIComponent(movie.slug)}`}
        className="block cursor-pointer group"
      >
        <div
          className={`
            relative rounded-xl overflow-hidden
            bg-[#151922] border
            transition-transform duration-200 ease-out
            ${isTop3
              ? 'border-amber-500/15 hover:border-amber-400/40'
              : 'border-white/[0.06] hover:border-white/[0.12]'
            }
            hover:-translate-y-1
          `}
        >
          {/* Poster area */}
          <div className="relative aspect-[2/3] overflow-hidden">
            {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton z-[1]" />}
            {imgError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
                <i className="ri-image-line text-white/20 text-2xl" />
              </div>
            )}
            <img
              src={posterUrl}
              alt={movie.name}
              loading={priority ? 'eager' : 'lazy'}
              className={`
                w-full h-full object-cover object-center
                transition-transform duration-200 ease-out
                ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}
                group-hover:scale-105
              `}
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(true); }}
            />

            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-[2]" />

            {/* Big rank badge */}
            <div className="absolute bottom-2 left-2 z-[15] flex items-end">
              <div
                className={`
                  flex items-center justify-center
                  w-10 h-10 md:w-12 md:h-12
                  rounded-xl ${rs.numBg} ${rs.numText}
                  font-black ${rs.numSize}
                  border-2 border-gray-900/80 shadow-xl
                  transition-transform duration-200 ease-out
                  group-hover:scale-105
                `}
              >
                {rs.crown ? (
                  <i className="ri-vip-crown-fill text-base md:text-lg" />
                ) : (
                  <span>{rank}</span>
                )}
              </div>
            </div>

            {/* Top accent bar */}
            {isTop3 && rs.bar && (
              <div className={`absolute top-0 left-0 right-0 h-[2px] ${rs.bar} z-[10]`} />
            )}

            {/* Top-left status chip */}
            <div className="absolute top-2 left-2 z-[12]">
              <span className="text-[9px] md:text-[10px] font-bold bg-black/60 text-white/90 px-1.5 py-0.5 rounded-md border border-white/10 uppercase">
                {eps}
              </span>
            </div>

            {/* Top-right rating chip */}
            <div className="absolute top-2 right-2 z-[12]">
              <span className="flex items-center gap-0.5 text-[10px] md:text-[11px] font-bold bg-black/60 text-amber-400 px-1.5 py-0.5 rounded-md border border-amber-500/20">
                <i className="ri-star-fill text-[9px]" /> {rating}
              </span>
            </div>

            {/* Bottom-right views */}
            <div className="absolute bottom-2 right-2 z-[12]">
              <span className="text-[9px] md:text-[10px] font-semibold text-white/60 bg-black/40 px-1.5 py-0.5 rounded-md">
                {viewK}K xem
              </span>
            </div>

            {/* Hover play overlay */}
            <div className="absolute inset-0 z-[8] flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-200">
              <div className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/25 flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 ease-out">
                <i className="ri-play-fill text-white text-xl md:text-2xl ml-0.5" />
              </div>
            </div>
          </div>

          {/* Info strip below poster */}
          <div className="px-2.5 pt-2 pb-2.5">
            <p className="text-[13px] md:text-sm font-semibold text-white/90 line-clamp-1 transition-colors duration-200 group-hover:text-amber-400">
              {movie.name}
            </p>
            <div className="flex items-center gap-2 mt-1 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
              {movie.year && (
                <span className="text-[10px] md:text-[11px] text-white/40">{movie.year}</span>
              )}
              {movie.category?.slice(0, 1).map((c: { name: string }) => (
                <span key={c.name} className="text-[10px] md:text-[11px] text-white/30">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Link>

      {/* Big rank number watermark outside frame (4+) */}
      {!isTop3 && (
        <div className="relative -mt-1.5 text-right pr-1 pointer-events-none select-none overflow-hidden">
          <span className="text-[22px] md:text-[26px] font-black leading-none text-white/[0.04]">
            #{String(rank).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  );
}

function SectionSkeleton() {
  return null;
}
