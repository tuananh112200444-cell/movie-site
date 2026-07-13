import { memo, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MovieItem } from '../../../types/movie';
import { getOptimizedImageUrl } from '../../../services/movieApi';
import { movieDetailUrl } from '../../../utils/slugEncoder';

interface QueerUniverseHeroProps {
  movies: MovieItem[];
  loading?: boolean;
}

function getDetailHref(movie: MovieItem): string {
  const href = movieDetailUrl(movie.slug);
  const isOphimSource = movie.source_site === 'ophim' || movie.source_name === 'OPhim';
  return isOphimSource ? `${href}?source=ophim` : href;
}

function QueerUniverseHero({ movies, loading }: QueerUniverseHeroProps) {
  const featured = useMemo(() => movies.slice(0, 5), [movies]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (featured.length === 0) return;
    const timer = setInterval(() => {
      setActiveIndex((index) => (index + 1) % featured.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [featured.length]);

  if (loading) {
    return (
      <div className="relative w-full bg-[#071014]" style={{ aspectRatio: '16/6', minHeight: 320 }}>
        <div className="absolute inset-0 skeleton" />
        <div className="absolute inset-0 flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-2xl text-cyan-300/50" />
        </div>
      </div>
    );
  }

  if (featured.length === 0) {
    return (
      <div className="relative w-full overflow-hidden bg-[#071014]" style={{ aspectRatio: '16/6', minHeight: 320 }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(34,211,238,0.24),transparent_34%),radial-gradient(circle_at_78%_22%,rgba(244,114,182,0.24),transparent_34%),linear-gradient(135deg,#071014,#120a18)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080a10] via-transparent to-[#080a10]/50" />
        <div className="absolute inset-0 flex items-center px-4 sm:px-10 md:px-16 pt-16">
          <div className="max-w-2xl">
            <p className="text-cyan-200 text-xs md:text-sm font-black uppercase tracking-[0.28em]">BL / GL universe</p>
            <h2 className="mt-3 text-3xl md:text-5xl font-black text-white tracking-tight">Vu tru Dam My / GL</h2>
            <p className="mt-4 text-sm md:text-base text-white/65 leading-relaxed">
              Khong gian rieng cho Dam My, BL, GL va Bach Hop tren KhoPhim.
            </p>
          </div>
        </div>
      </div>
    );
  }
  const active = featured[activeIndex];
  const activeHref = getDetailHref(active);
  const background = getOptimizedImageUrl(active.thumb_url || active.poster_url, 1500, 86);
  const poster = getOptimizedImageUrl(active.thumb_url || active.poster_url, 520, 86);

  return (
    <section className="relative w-full overflow-hidden bg-[#071014]" style={{ aspectRatio: '16/6', minHeight: 320 }}>
      <MemoHeroImage src={background} alt={active.name} />

      <div className="absolute inset-0 bg-gradient-to-r from-[#05080d]/98 via-[#071014]/72 to-[#071014]/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#080a10] via-transparent to-[#080a10]/55" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_42%_78%,rgba(244,114,182,0.14),transparent_36%)]" />
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#080a10] to-transparent" />

      <div className="absolute inset-0 flex items-center px-3 sm:px-8 md:px-12 lg:px-16 pt-16 sm:pt-20 md:pt-24 pb-10">
        <div className="w-full flex items-center justify-between gap-6">
          <div className="flex-1 max-w-2xl">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[9px] md:text-xs font-black uppercase tracking-[0.24em] text-cyan-100 bg-cyan-400/12 border border-cyan-300/25 px-2.5 py-1 rounded-full">
                BL / GL
              </span>
              {active.year > 0 && <span className="text-[10px] md:text-xs text-white/45 font-semibold">{active.year}</span>}
              {active.episode_current && (
                <span className="text-[10px] md:text-xs text-pink-100 bg-pink-400/12 border border-pink-300/20 px-2 py-0.5 rounded-full">
                  {active.episode_current}
                </span>
              )}
            </div>

            <h2 className="text-white font-black text-2xl sm:text-3xl md:text-5xl lg:text-6xl leading-tight tracking-tight line-clamp-2">
              {active.name}
            </h2>

            {active.origin_name && (
              <p className="mt-2 text-white/42 text-xs md:text-sm uppercase tracking-wide line-clamp-1">
                {active.origin_name}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {active.quality && (
                <span className="text-[10px] md:text-xs font-black bg-cyan-400 text-[#061016] px-2 py-0.5 rounded-md tracking-wider uppercase">
                  {active.quality}
                </span>
              )}
              {active.lang && (
                <span className="text-[10px] md:text-xs bg-white/10 text-white/75 px-2 py-0.5 rounded-md border border-white/10 font-medium">
                  {active.lang}
                </span>
              )}
              {active.category?.slice(0, 2).map((category) => (
                <span key={category.slug} className="text-[10px] md:text-xs text-white/52">
                  {category.name}
                </span>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-2 md:gap-3">
              <Link
                to={activeHref}
                className="group inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 sm:px-6 py-2.5 sm:py-3 text-xs md:text-sm font-black text-[#061016] transition-all hover:bg-cyan-300 hover:scale-[1.03] active:scale-[0.98] shadow-lg shadow-cyan-400/20"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#061016]/14">
                  <i className="ri-play-fill text-xs ml-0.5" />
                </span>
                Xem ngay
              </Link>
              <Link
                to={activeHref}
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.08] px-4 sm:px-5 py-2.5 text-xs md:text-sm font-bold text-white/78 transition-all hover:border-pink-200/30 hover:bg-white/[0.14] hover:text-white active:scale-[0.98]"
              >
                <i className="ri-information-line text-white/55" />
                Chi tiet
              </Link>
            </div>
          </div>

          <Link to={activeHref} className="hidden lg:block relative w-[150px] xl:w-[180px] flex-shrink-0 group" style={{ aspectRatio: '2/3' }}>
            <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/14 bg-white/[0.06] shadow-[0_26px_70px_-32px_rgba(34,211,238,0.75)]">
              <img src={poster} alt={active.name} className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="line-clamp-2 text-xs font-black text-white">{active.name}</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <div className="absolute bottom-5 right-5 hidden md:flex gap-2">
        {featured.map((movie, index) => (
          <button
            key={movie.slug}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`relative overflow-hidden rounded-lg bg-white/[0.06] transition-all duration-300 ${
              index === activeIndex
                ? 'h-12 w-[74px] ring-2 ring-cyan-300 opacity-100'
                : 'h-10 w-16 opacity-45 hover:opacity-75'
            }`}
          >
            <img
              src={getOptimizedImageUrl(movie.thumb_url || movie.poster_url, 220, 76)}
              alt={movie.name}
              className="absolute inset-0 h-full w-full object-cover object-top"
              loading={index === 0 ? 'eager' : 'lazy'}
            />
          </button>
        ))}
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden">
        {featured.map((movie, index) => (
          <button
            key={movie.slug}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`rounded-full transition-all ${index === activeIndex ? 'h-1.5 w-5 bg-cyan-300' : 'h-1.5 w-1.5 bg-white/30'}`}
            aria-label={`Chuyen den ${movie.name}`}
          />
        ))}
      </div>
    </section>
  );
}

const MemoHeroImage = memo(function HeroImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        onLoad={() => setLoaded(true)}
      />
      {!loaded && <div className="absolute inset-0 bg-[#111827] animate-pulse" />}
    </>
  );
});

export default memo(QueerUniverseHero);    
