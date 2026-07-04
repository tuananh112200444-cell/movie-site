import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getFeaturedUrl, getSmallThumbUrl } from '@/services/movieApi';
import { movieDetailUrl } from '@/utils/slugEncoder';
import { isImagePreloaded, markImagePreloaded } from '@/utils/imagePreloader';
import type { Movie } from '@/types/movie';

interface FeaturedSectionProps {
  movies: Movie[];
  type?: 'phim-le' | 'phim-bo' | string;
}

/* ── Color palettes per type ── */
const PALETTE: Record<string, {
  accent: string;
  badgeBg: string;
  badgeText: string;
  gradientOverlay: string;
  sideHoverText: string;
  btnBg: string;
  btnHoverBg: string;
  ringHover: string;
  shadow: string;
  label: string;
}> = {
  'phim-le': {
    accent: 'text-red-400',
    badgeBg: 'bg-red-600',
    badgeText: 'text-red-400',
    gradientOverlay: 'from-red-500/10 via-transparent to-transparent',
    sideHoverText: 'group-hover:text-red-400',
    btnBg: 'bg-red-600',
    btnHoverBg: 'hover:bg-red-500',
    ringHover: 'hover:ring-red-500/30',
    shadow: 'shadow-red-900/20',
    label: 'Nổi Bật',
  },
  'phim-bo': {
    accent: 'text-amber-400',
    badgeBg: 'bg-amber-600',
    badgeText: 'text-amber-400',
    gradientOverlay: 'from-amber-500/10 via-transparent to-transparent',
    sideHoverText: 'group-hover:text-amber-400',
    btnBg: 'bg-amber-600',
    btnHoverBg: 'hover:bg-amber-500',
    ringHover: 'hover:ring-amber-500/30',
    shadow: 'shadow-amber-900/20',
    label: 'Series Hot',
  },
};

const DEFAULT_TYPE = 'phim-le';

export default function FeaturedSection({ movies, type }: FeaturedSectionProps) {
  if (!movies.length) return null;
  const main = movies[0];
  const side = movies.slice(1, 5);
  const p = PALETTE[type ?? DEFAULT_TYPE] ?? PALETTE[DEFAULT_TYPE];

  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-sm sm:text-lg font-bold text-white tracking-tight">{p.label}</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        <span className={`text-[10px] font-bold ${p.badgeText} ${p.badgeBg}/10 border ${p.badgeBg}/20 px-2.5 py-1 rounded-full uppercase tracking-wider`}>
          {type === 'phim-bo' ? 'DRAMA' : 'HOT'}
        </span>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-[58%] flex-shrink-0">
          <FeaturedMainCard movie={main} palette={p} />
        </div>
        <div className="lg:flex-1 flex flex-col gap-3">
          {side.map((m) => (
            <FeaturedSideCard key={m._id} movie={m} palette={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Main Card (16:9 large) ─── */
function FeaturedMainCard({ movie, palette }: { movie: Movie; palette: typeof PALETTE['phim-le'] }) {
  const imagePath = movie.thumb_url || movie.poster_url;
  const imgUrl = getFeaturedUrl(imagePath);
  const [imgLoaded, setImgLoaded] = useState(isImagePreloaded(imgUrl));
  const [imgError, setImgError] = useState(false);
  const ep = (movie.episode_current ?? '').toLowerCase().trim();
  const isFull = ep === 'full' || ep === 'hoàn tất' || ep === 'full hd';
  const isTrailer = ep === 'trailer';

  return (
    <Link
      to={movieDetailUrl(movie.slug)}
      className={`group relative block rounded-2xl overflow-hidden bg-[#13151f] cursor-pointer ring-1 ring-white/5 ${palette.ringHover} transition-all`}
    >
      <div className="relative" style={{ aspectRatio: '16/9' }}>
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton z-[1]" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <i className="ri-image-line text-white/20 text-3xl" />
          </div>
        )}
        <img
          src={imgUrl}
          alt={movie.name}
          loading="eager"
          decoding="sync"
          className={`w-full h-full object-cover object-top transition-all duration-700 group-hover:scale-105 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.05) saturate(1.1) brightness(0.92)' }}
          onLoad={() => { setImgLoaded(true); markImagePreloaded(imgUrl); }}
          onError={() => { setImgError(true); setImgLoaded(true); }}
        />
        <div className={`absolute inset-0 bg-gradient-to-r ${palette.gradientOverlay}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

        <div className="absolute top-2 sm:top-4 left-2 sm:left-4 flex items-center gap-2 z-[2]">
          <span className={`flex items-center gap-1.5 ${palette.badgeBg} text-white text-[9px] sm:text-[10px] font-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md uppercase tracking-wider shadow-lg ${palette.shadow}`}>
            <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-white rounded-full animate-pulse" />
            Nổi Bật
          </span>
          {movie.quality && (
            <span className="text-[9px] sm:text-[10px] font-black bg-white/10 text-white px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md border border-white/10">
              {movie.quality}
            </span>
          )}
        </div>

        <div className="absolute top-2 sm:top-4 right-2 sm:right-4 z-[2] flex flex-col items-end gap-1 sm:gap-1.5">
          {movie.lang && (
            <span className="text-[10px] font-bold bg-white/10 text-white px-2 py-1 rounded-md border border-white/10">
              {movie.lang}
            </span>
          )}
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-md border ${
              isFull
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : isTrailer
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
            }`}
          >
            {movie.episode_current}
          </span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5 md:p-6 z-[2]">
          <h3 className={`text-base sm:text-xl md:text-2xl font-black text-white line-clamp-1 ${palette.sideHoverText} transition-colors mb-1`}>
            {movie.name}
          </h3>
          <p className="text-xs sm:text-sm text-white/50 line-clamp-1 mb-2 sm:mb-4">{movie.origin_name}</p>
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
            {movie.year && (
              <span className="text-[10px] sm:text-xs font-medium text-white/70 bg-white/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-white/5">
                {movie.year}
              </span>
            )}
            {movie.time && (
              <span className="text-[10px] sm:text-xs font-medium text-white/70 bg-white/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-white/5">
                {movie.time}
              </span>
            )}
            <span className={`ml-auto flex items-center gap-1.5 ${palette.btnBg} ${palette.btnHoverBg} text-white text-[10px] sm:text-xs font-bold px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-full transition-colors shadow-lg ${palette.shadow}`}>
              <i className="ri-play-fill text-xs sm:text-sm" />
              Xem Ngay
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─── Side Card (horizontal list item) ─── */
function FeaturedSideCard({ movie, palette }: { movie: Movie; palette: typeof PALETTE['phim-le'] }) {
  const imagePath = movie.thumb_url || movie.poster_url;
  const imgUrl = getSmallThumbUrl(imagePath);
  const [imgLoaded, setImgLoaded] = useState(isImagePreloaded(imgUrl));
  const [imgError, setImgError] = useState(false);
  const ep = (movie.episode_current ?? '').toLowerCase().trim();
  const isFull = ep === 'full' || ep === 'hoàn tất' || ep === 'full hd';

  return (
    <Link
      to={movieDetailUrl(movie.slug)}
      className="group flex gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/10 transition-all cursor-pointer"
    >
      <div className="relative w-20 sm:w-28 md:w-32 flex-shrink-0 aspect-[16/10] rounded-lg overflow-hidden bg-[#13151f]">
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton z-[1]" />}
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <i className="ri-image-line text-white/20 text-2xl" />
          </div>
        )}
        <img
          src={imgUrl}
          alt={movie.name}
          loading="lazy"
          className={`w-full h-full object-cover object-top transition-all duration-500 group-hover:scale-110 ${imgLoaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: 'contrast(1.05) saturate(1.08)' }}
          onLoad={() => { setImgLoaded(true); markImagePreloaded(imgUrl); }}
          onError={() => { setImgError(true); setImgLoaded(true); }}
        />
        {movie.quality && (
          <span className={`absolute top-1.5 left-1.5 text-[9px] font-black ${palette.badgeBg} text-white px-1.5 py-0.5 rounded shadow-sm`}>
            {movie.quality}
          </span>
        )}
      </div>

      <div className="flex flex-col justify-center min-w-0 py-0.5">
        <h4 className={`text-sm font-bold text-white/90 line-clamp-1 ${palette.sideHoverText} transition-colors`}>
          {movie.name}
        </h4>
        <p className="text-xs text-white/40 line-clamp-1 mt-0.5">{movie.origin_name}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {movie.year && <span className="text-[11px] text-white/50 font-medium">{movie.year}</span>}
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
              isFull
                ? 'bg-green-500/15 text-green-400 border-green-500/25'
                : 'bg-sky-500/15 text-sky-400 border-sky-500/25'
            }`}
          >
            {movie.episode_current}
          </span>
          {movie.lang && (
            <span className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
              {movie.lang}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
