import { useState, useEffect } from 'react';
import { useHeroLazyLoad } from '@/hooks/useHeroLazyLoad';
import { Link } from 'react-router-dom';
import type { CountryConfig } from '../page';

interface Props {
  config: CountryConfig;
  page?: number;
}

const OTHER_COUNTRIES = [
  { slug: 'han-quoc',   name: 'Hàn Quốc',   flag: '🇰🇷', path: '/phim-han-quoc' },
  { slug: 'trung-quoc', name: 'Trung Quốc',  flag: '🇨🇳', path: '/phim-trung-quoc' },
  { slug: 'au-my',      name: 'Âu Mỹ',       flag: '🇺🇸', path: '/phim-au-my' },
  { slug: 'nhat-ban',   name: 'Nhật Bản',    flag: '🇯🇵', path: '/phim-nhat-ban' },
  { slug: 'thai-lan',   name: 'Thái Lan',    flag: '🇹🇭', path: '/phim-thai-lan' },
  { slug: 'viet-nam',   name: 'Việt Nam',    flag: '🇻🇳', path: '/phim-viet-nam' },
];

export default function CountryHeroBanner({ config, page }: Props) {
  const { heroRef, showHeroBg, heroImgLoaded, setHeroImgLoaded } = useHeroLazyLoad();
  const [scrolled, setScrolled] = useState(false);

  /* ─── Preload image only when hero enters viewport ─── */
  useEffect(() => {
    if (!showHeroBg) return;
    const img = new Image();
    img.src = config.bgImage;
    img.onload = () => setHeroImgLoaded(true);
  }, [config.bgImage, showHeroBg, setHeroImgLoaded]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const others = OTHER_COUNTRIES.filter((c) => c.slug !== config.slug);

  return (
    <div ref={heroRef} className="relative pt-16 overflow-hidden">
      {/* Background image — lazy loaded via IntersectionObserver */}
      <div
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ${heroImgLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundImage: showHeroBg ? `url(${config.bgImage})` : 'none' }}
      />
      {/* Skeleton placeholder while off-screen / loading */}
      <div
        className={`absolute inset-0 ${config.gradientFrom} ${config.gradientVia} to-transparent transition-opacity duration-500 ${showHeroBg && heroImgLoaded ? 'opacity-0' : 'opacity-60'}`}
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#080a10]/95 via-[#080a10]/70 to-[#080a10]/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#080a10] via-transparent to-[#080a10]/30" />

      {/* Accent color glow */}
      <div className={`absolute top-0 left-0 w-[600px] h-full bg-gradient-to-r ${config.gradientFrom} ${config.gradientVia} to-transparent opacity-60 pointer-events-none`} />

      {/* Animated particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-10 animate-pulse"
            style={{
              width: `${40 + i * 20}px`,
              height: `${40 + i * 20}px`,
              top: `${10 + i * 12}%`,
              right: `${5 + i * 8}%`,
              background: `radial-gradient(circle, white, transparent)`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + i}s`,
            }}
          />
        ))}
      </div>

      <div className="relative max-w-[1760px] mx-auto px-4 pt-6 sm:pt-10 pb-6 sm:pb-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 mb-4 sm:mb-6 text-xs">
          <Link to="/" className="text-white/30 hover:text-white/60 transition-colors">Trang chủ</Link>
          <i className="ri-arrow-right-s-line text-white/20" />
          <span className="text-white/55">{config.name}</span>
        </nav>

        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 sm:gap-8">
          {/* Left: Main info */}
          <div className="flex-1 min-w-0">
            {/* Flag + Name */}
            <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="text-3xl sm:text-4xl md:text-5xl leading-none select-none">{config.flag}</div>
              <div>
                <div className="text-[11px] sm:text-xs font-medium text-white/40 uppercase tracking-widest mb-0.5 sm:mb-1">{config.nameEn}</div>
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-white leading-tight">{config.name} Vietsub HD Miễn Phí{(page ?? 1) > 1 ? ` – Trang ${page}` : ''}</h1>
              </div>
            </div>

            {/* Tagline */}
            <p className={`text-xs sm:text-sm md:text-base font-medium mb-2 ${config.accentColor}`}>
              {config.tagline}
            </p>

            {/* Description */}
            <p className="text-white/50 text-xs sm:text-sm leading-relaxed mb-4 sm:mb-6 max-w-xl">
              {config.description}
            </p>

            {/* Stats row */}
            <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
              {config.stats.map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-2 sm:gap-2.5">
                  {i > 0 && <div className="w-px h-6 sm:h-8 bg-white/10 hidden sm:block" />}
                  <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08] flex-shrink-0">
                    <i className={`${stat.icon} text-xs sm:text-sm ${config.accentColor}`} />
                  </div>
                  <div>
                    <div className={`text-sm sm:text-base font-bold ${config.accentColor} leading-tight`}>{stat.value}</div>
                    <div className="text-white/30 text-[10px] sm:text-[11px]">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-5 flex-wrap">
              <span className="flex items-center gap-1 text-[10px] sm:text-xs text-white/50 bg-white/[0.05] border border-white/[0.08] px-2 py-1 sm:px-3 sm:py-1.5 rounded-full">
                <i className="ri-check-double-line text-green-400" />
                Vietsub HD
              </span>
              <span className="flex items-center gap-1 text-[10px] sm:text-xs text-white/50 bg-white/[0.05] border border-white/[0.08] px-2 py-1 sm:px-3 sm:py-1.5 rounded-full">
                <i className="ri-shield-check-line text-green-400" />
                Miễn phí
              </span>
              <span className="flex items-center gap-1 text-[10px] sm:text-xs text-white/50 bg-white/[0.05] border border-white/[0.08] px-2 py-1 sm:px-3 sm:py-1.5 rounded-full">
                <i className="ri-time-line text-amber-400" />
                Cập nhật hàng ngày
              </span>
              <span className="hidden sm:flex items-center gap-1 text-[10px] sm:text-xs text-white/50 bg-white/[0.05] border border-white/[0.08] px-2 py-1 sm:px-3 sm:py-1.5 rounded-full">
                <i className="ri-advertisement-line text-red-400" />
                Không quảng cáo
              </span>
            </div>
          </div>

          {/* Right: Other countries quick nav */}
          <div className="lg:w-64 flex-shrink-0 w-full mt-2 sm:mt-0">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <i className="ri-global-line text-white/30 text-sm" />
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Phim Theo Quốc Gia</span>
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                {others.map((c) => (
                  <Link
                    key={c.slug}
                    to={c.path}
                    className="flex items-center gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl hover:bg-white/[0.06] transition-all group cursor-pointer"
                  >
                    <span className="text-lg sm:text-xl leading-none">{c.flag}</span>
                    <span className="text-xs sm:text-sm text-white/50 group-hover:text-white/80 transition-colors">{c.name}</span>
                    <i className="ri-arrow-right-s-line text-white/20 group-hover:text-white/40 ml-auto text-sm transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom divider */}
        <div className="mt-6 sm:mt-8 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
      </div>
    </div>
  );
}
