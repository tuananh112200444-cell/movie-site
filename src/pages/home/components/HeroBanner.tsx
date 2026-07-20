import { useState, useEffect, useCallback, useMemo, useTransition, memo } from 'react';
import type { MovieItem } from '../../../types/movie';
import { getOptimizedImageUrl } from '../../../services/movieApi';
import { useFavorites } from '../../../hooks/useFavorites';
import { movieDetailUrl } from '../../../utils/slugEncoder';
import { isImagePreloaded, markImagePreloaded } from '../../../utils/imagePreloader';
import { Link } from 'react-router-dom';

interface HeroBannerProps {
  movies: MovieItem[];
  loading?: boolean;
}

function getStableRating(name: string): string {
  const code = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (7.5 + (code % 25) / 10).toFixed(1);
}

function getViewCount(name: string): string {
  const code = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = 50000 + (code % 950000);
  if (base >= 1000000) return `${(base / 1000000).toFixed(1)}M`;
  return `${Math.round(base / 1000)}K`;
}

function getDisplayTime(value?: string): string | null {
  const time = String(value ?? '').trim();
  if (!time) return null;
  const normalized = time.toLocaleLowerCase('vi-VN');
  if (
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized.includes('undefined') ||
    normalized.includes('? phút') ||
    normalized === '0 phút' ||
    normalized === '0 phút/tập' ||
    normalized === 'đang cập nhật'
  ) return null;
  return time;
}
function getMovieDetailHref(movie: MovieItem): string {
  const href = movieDetailUrl(movie.slug);
  const isOphimSource =
    movie.source_site === 'ophim' ||
    movie.source_name === 'OPhim';
  return isOphimSource ? `${href}?source=ophim` : href;
}

function HeroBanner({ movies, loading }: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [contentKey, setContentKey] = useState(0);
  const [, startTransition] = useTransition();
  const { isFav, toggle } = useFavorites();

  const featured = useMemo(() => movies.slice(0, 5), [movies]);

  const next = useCallback(() => {
    setActiveIndex((i) => (i + 1) % featured.length);
    startTransition(() => setContentKey(k => k + 1));
  }, [featured.length, startTransition]);

  // Auto-next timer
  useEffect(() => {
    if (featured.length === 0) return;
    // Rotating a full-viewport hero keeps replacing the LCP candidate on
    // phones. Mobile users already have explicit slide tabs, so keep the first
    // hero stable and avoid late image downloads/layout work.
    if (window.matchMedia('(max-width: 639px)').matches) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next, featured.length]);

  const handleSelectSlide = (i: number) => {
    setActiveIndex(i);
    setContentKey(k => k + 1);
  };

  if (loading) {
    return (
      <div className="relative w-full bg-[#0a0c14]" style={{ aspectRatio: '16/5.7', minHeight: 'clamp(188px, 48vw, 460px)' }}>
        <div className="absolute inset-0 skeleton" />
        <div className="absolute inset-0 flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-2xl text-red-500/40" />
        </div>
      </div>
    );
  }

  if (featured.length === 0) return null;

  const active = featured[activeIndex];
  // A 480px request becomes a ~648–768px WebP after DPR scaling, which is
  // already sharp for the full-width mobile hero without downloading a near
  // desktop-sized backdrop on constrained connections.
  const isMobileHero = typeof window !== 'undefined' && window.innerWidth < 640;
  const backgroundWidth = isMobileHero ? 420 : 1360;
  const backgroundQuality = isMobileHero ? 78 : 82;
  const activePosterUrl = getOptimizedImageUrl(active?.thumb_url || active?.poster_url, 620, 86);
  const rating = getStableRating(active.name ?? '');
  const viewCount = getViewCount(active.name ?? '');
  const displayTime = getDisplayTime(active.time);
  const activeDetailHref = getMovieDetailHref(active);
  const favored = isFav(active._id);

  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/5.7', minHeight: 'clamp(188px, 48vw, 460px)' }}>

      {/* Only render active + next slides to reduce initial DOM & image count */}
      <MemoSlideBackground
        key={active._id}
        src={getOptimizedImageUrl(active.poster_url || active.thumb_url, backgroundWidth, backgroundQuality)}
        alt={active.name}
        active={true}
        priority={true}
      />

      {/* Overlays — stronger gradients for more drama */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#060810]/98 via-[#060810]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#060810] via-transparent to-[#060810]/40" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#060810]/80" />
      <div className="absolute inset-0 hero-vignette" />
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -right-1/4 w-3/4 h-full bg-gradient-radial from-red-500/12 via-transparent to-transparent" />
        <div className="absolute top-0 left-0 w-1/3 h-1/2 bg-gradient-radial from-amber-500/8 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-1/4 w-1/2 h-1/3 bg-gradient-radial from-red-600/6 via-transparent to-transparent" />
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 55% 85% at 75% 40%, rgba(239,68,68,0.12) 0%, transparent 60%)' }} />

      {/* Cinematic light leak — enhanced */}
      

      {/* Dramatic radial glow — stronger */}
      

      {/* Bottom fade into page content */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#080a10] to-transparent pointer-events-none" />

      {/* Content */}
      <div className="absolute inset-0 flex items-center px-3 pt-7 pb-7 sm:px-8 sm:pt-20 sm:pb-6 md:px-12 md:pt-24 md:pb-4 lg:px-10 xl:px-12">
        <div key={contentKey} className="hero-content-enter mx-auto flex w-full max-w-[1880px] items-center justify-between gap-3 md:gap-8 2xl:px-2">

          {/* Left: Text info */}
          <div className="max-w-lg flex-1 xl:max-w-3xl 2xl:max-w-[840px]">
            <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3 flex-wrap">
              {active.category?.slice(0, 2).map((c) => (
                <Link key={c.slug} to={`/the-loai/${c.slug}`}
                  className="text-[9px] md:text-xs font-semibold text-red-300 bg-red-500/15 border border-red-500/25 px-2 md:px-2.5 py-0.5 rounded-full tracking-wide hover:bg-red-500/25 transition-colors">
                  {c.name}
                </Link>
              ))}
              {active.year && <span className="text-[9px] md:text-xs text-white/40 font-medium">{active.year}</span>}
              <span className="flex items-center gap-1 text-[9px] md:text-xs text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                <i className="ri-star-fill text-[9px]" />{rating}
              </span>
            </div>

            <h2 className="hero-title-enter mb-1 text-[1.35rem] font-black leading-tight tracking-tight text-white line-clamp-2 sm:mb-1.5 sm:text-2xl sm:leading-tight md:text-4xl lg:text-5xl 2xl:text-[3.6rem]">
              {active.name}
            </h2>

            {active.origin_name && (
              <p className="hero-sub-enter text-white/40 text-[11px] md:text-sm mb-2 md:mb-3 line-clamp-1 font-medium tracking-wide uppercase">
                {active.origin_name}
              </p>
            )}

            <div className="hero-badges-enter hidden items-center gap-1.5 md:mb-3 md:flex md:gap-2">
              <span className="flex items-center gap-1 text-[9px] md:text-xs text-white/50">
                <i className="ri-eye-line text-white/30 text-[10px]" />{viewCount} lượt xem
              </span>
              {displayTime && (
                <span className="flex items-center gap-1 text-[9px] md:text-xs text-white/50">
                  <span className="text-white/20">·</span>
                  <i className="ri-time-line text-white/30 text-[10px]" />{displayTime}
                </span>
              )}
              {active.episode_current && active.episode_current.toLowerCase() !== 'trailer' && (
                <span className="flex items-center gap-1 text-[9px] md:text-xs text-white/50">
                  <span className="text-white/20">·</span>{active.episode_current}
                </span>
              )}
            </div>

            <div className="hero-badges-enter mb-3 flex items-center gap-1.5 md:mb-4 md:gap-2">
              {active.quality && (
                <span className="text-[9px] md:text-xs font-black bg-red-500 text-white px-2 py-0.5 rounded-md tracking-wider uppercase">{active.quality}</span>
              )}
              {active.lang && (
                <span className="text-[9px] md:text-xs bg-white/10 text-white/75 px-2 py-0.5 rounded-md border border-white/10 font-medium">{active.lang}</span>
              )}
              {active.episode_current && (
                <span className={`text-[9px] md:text-xs px-2 py-0.5 rounded-md border font-medium ${
                  active.episode_current.toLowerCase() === 'full' || active.episode_current.toLowerCase() === 'hoàn tất'
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : active.episode_current.toLowerCase() === 'trailer'
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                }`}>{active.episode_current}</span>
              )}
            </div>

            <div className="hero-cta-enter flex items-center gap-2 md:gap-3">
              <Link to={movieDetailUrl(active.slug)}
                className="group flex min-h-11 items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-xs md:text-sm font-bold px-3.5 py-2 sm:px-6 sm:py-3 rounded-lg sm:rounded-xl transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] whitespace-nowrap shadow-lg shadow-red-500/30 touch-manipulation">
                <div className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center bg-white/20 rounded-full group-hover:bg-white/30 transition-colors">
                  <i className="ri-play-fill text-[10px] md:text-xs ml-0.5" />
                </div>
                Xem Ngay
              </Link>
              <Link to={activeDetailHref}
                className="flex min-h-11 items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs md:text-sm font-semibold px-3 py-2 md:gap-2 md:px-5 sm:py-2.5 rounded-lg sm:rounded-xl transition-all duration-200 border border-white/[0.12] hover:border-white/25 hover:scale-[1.02] active:scale-[0.97] whitespace-nowrap touch-manipulation">
                <i className="ri-information-line text-white/60 text-xs" />Chi Tiết
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); toggle(active); }}
                className={`flex h-11 w-11 items-center justify-center rounded-lg sm:rounded-xl transition-all duration-200 border cursor-pointer whitespace-nowrap active:scale-[0.93] touch-manipulation ${
                  favored
                    ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30'
                    : 'bg-white/[0.08] border-white/[0.12] text-white/60 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10'
                }`}
                title={favored ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
              >
                <i className={`${favored ? 'ri-heart-fill' : 'ri-heart-line'} text-xs sm:text-sm`} />
              </button>
            </div>
          </div>

          {/* Right: Poster card */}
          <div className="hidden flex-shrink-0 lg:block">
            <MemoHeroPosterCard
              src={activePosterUrl}
              alt={active.name ?? ''}
              href={activeDetailHref}
              quality={active.quality}
            />
          </div>
        </div>
      </div>

      {/* Slide counter */}
      <div className="absolute top-20 right-[240px] hidden flex-col items-end gap-2 lg:flex 2xl:right-[320px]">
        <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-full border border-white/[0.08]">
          <span className="text-white text-sm font-bold">{activeIndex + 1}</span>
          <span className="text-white/30 text-xs">/</span>
          <span className="text-white/40 text-xs">{featured.length}</span>
        </div>
        <div className="w-8 h-8 flex items-center justify-center">
          <svg key={activeIndex} width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
            <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
            <circle
              cx="16" cy="16" r="12" fill="none"
              stroke="rgba(239,68,68,0.7)" strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 12}`}
              strokeLinecap="round"
              className="hero-circle-progress"
            />
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
        <div key={activeIndex} className="h-full bg-gradient-to-r from-red-600 to-red-400 hero-progress-animate" />
      </div>

      {/* Desktop thumbnails */}
      <div className="absolute bottom-5 right-6 hidden md:flex gap-2" role="tablist" aria-label="Chọn slide phim">
        {featured.map((m, i) => (
          <button key={m._id} onClick={() => handleSelectSlide(i)}
            role="tab" aria-selected={i === activeIndex} aria-label={`Xem slide phim: ${m.name}`}
            className={`relative overflow-hidden rounded-lg transition-all duration-300 cursor-pointer bg-[#16192a] ${
              i === activeIndex
                ? 'w-[72px] h-12 ring-2 ring-red-500 ring-offset-1 ring-offset-black/50 opacity-100'
                : 'w-16 h-10 opacity-40 hover:opacity-70 hover:w-[72px] hover:h-12'
            }`}>
            <MemoThumbImage src={getOptimizedImageUrl(m.thumb_url, 220, 76)} alt={m.name} priority={i === 0} />
            {i === activeIndex && <div className="absolute inset-0 bg-red-500/10" />}
          </button>
        ))}
      </div>

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex rounded-full bg-black/24 md:hidden" role="tablist" aria-label="Điều hướng slide">
        {featured.map((m, i) => (
          <button key={i} onClick={() => handleSelectSlide(i)}
            role="tab" aria-selected={i === activeIndex} aria-label={`Chuyển đến slide ${i + 1}: ${m.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-300 cursor-pointer active:scale-90 touch-manipulation">
            <span className={`block rounded-full transition-all duration-300 ${i === activeIndex ? 'h-1.5 w-4 bg-red-500' : 'h-1.5 w-1.5 bg-white/35'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(HeroBanner);

/* ── Slide background — chỉ render active + next ── */
const MemoSlideBackground = memo(function SlideBackground({ src, alt, active, priority }: { src: string; alt: string; active: boolean; priority: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    if (!active) return;
    const img = new Image();
    img.src = src;
    img.onload = () => setLoaded(true);
    img.onerror = () => { setLoaded(true); setImgError(true); };
  }, [active, src]);

  return (
    <div className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${active ? 'opacity-100' : 'opacity-0'}`}>
      <div className="absolute inset-0 w-full h-full bg-[#13151f]" />
      {active && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...(priority ? { fetchPriority: 'high' } : {})}
          className="absolute inset-0 w-full h-full object-cover object-top"
          style={{ filter: imgError ? undefined : 'contrast(1.05) saturate(1.1)' }}
          onLoad={() => setLoaded(true)}
          onError={() => { setImgError(true); setLoaded(true); }}
        />
      )}
      {active && !loaded && (
        <div className="absolute inset-0 bg-[#13151f] animate-pulse" />
      )}
    </div>
  );
});

/* ── Poster card bên phải ── */
const MemoHeroPosterCard = memo(function HeroPosterCard({ src, alt, href, quality }: { src: string; alt: string; href: string; quality?: string }) {
  const [loaded, setLoaded] = useState(isImagePreloaded(src));
  const [imgError, setImgError] = useState(false);
  return (
    <Link to={href} className="group relative block w-[188px] xl:w-[224px] 2xl:w-[252px]" style={{ aspectRatio: '2/3' }}>
      <div className="relative h-full w-full overflow-hidden rounded-[1.35rem] bg-[#16192a] ring-1 ring-white/12 transition-[transform,box-shadow,ring-color] duration-500 group-hover:-translate-y-1 group-hover:ring-white/25" style={{ boxShadow: '0 26px 72px rgba(0,0,0,0.62), 0 10px 28px rgba(0,0,0,0.45)' }}>
        {/* BLUR PLACEHOLDER — hiển thị NGAY LẬP TỨC */}
        <div className={`absolute inset-0 blur-placeholder z-[1] transition-opacity duration-700 ${loaded ? 'opacity-0' : 'opacity-100'}`} />
        {imgError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
            <i className="ri-image-line text-white/20 text-3xl" />
          </div>
        )}
        <img
          src={src}
          alt={alt}
          width={160}
          height={240}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover object-center transition-all duration-700 group-hover:scale-[1.035] ${loaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
          style={{ filter: imgError ? undefined : 'contrast(1.04) saturate(1.08)' }}
          onLoad={() => { setLoaded(true); markImagePreloaded(src); }}
          onError={() => { setImgError(true); setLoaded(true); }}
        />
        <div className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/92 via-black/45 to-transparent px-3.5 pb-3.5 pt-12">
          <p className="text-sm font-extrabold leading-snug text-white line-clamp-2 drop-shadow">{alt}</p>
        </div>
        {quality && (
          <div className="absolute top-2.5 right-2.5 z-[3]">
            <span className="text-[9px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded tracking-wider uppercase">{quality}</span>
          </div>
        )}
        <div className="absolute inset-0 z-[3] flex items-center justify-center bg-black/24 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_16px_40px_-18px_rgba(255,255,255,0.95)]">
            <i className="ri-play-fill ml-1 text-2xl" />
          </div>
        </div>
      </div>
      <div className="absolute -bottom-3 left-5 right-5 h-6 rounded-full bg-black/30 blur-2xl" />
    </Link>
  );
});

/* ── Thumbnail nhỏ ── */
const MemoThumbImage = memo(function ThumbImage({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  const [loaded, setLoaded] = useState(isImagePreloaded(src));
  const [imgError, setImgError] = useState(false);
  return (
    <>
      {/* BLUR PLACEHOLDER — hiển thị NGAY LẬP TỨC */}
      <div className={`absolute inset-0 blur-placeholder z-[1] transition-opacity duration-700 ${loaded ? 'opacity-0' : 'opacity-100'}`} />
      {imgError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d27] z-[1]">
          <i className="ri-image-line text-white/20 text-xl" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        width={72}
        height={48}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500 ${loaded && !imgError ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => { setLoaded(true); markImagePreloaded(src); }}
        onError={() => { setImgError(true); setLoaded(true); }}
      />
    </>
  );
});
