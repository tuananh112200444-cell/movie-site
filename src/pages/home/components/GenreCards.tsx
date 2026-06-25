import { Link } from 'react-router-dom';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import { memo } from 'react';

export const GENRE_LIST = [
  { name: 'Hành Động',   slug: 'hanh-dong',   icon: 'ri-sword-fill',            color: '#ef4444', glow: 'rgba(239,68,68,0.3)',    bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.25)',  count: '8.2K+' },
  { name: 'Tình Cảm',   slug: 'tinh-cam',    icon: 'ri-heart-3-fill',           color: '#f472b6', glow: 'rgba(244,114,182,0.3)',  bg: 'rgba(244,114,182,0.10)', border: 'rgba(244,114,182,0.25)', count: '6.5K+' },
  { name: 'Hài Hước',   slug: 'hai-huoc',    icon: 'ri-emotion-laugh-fill',     color: '#fb923c', glow: 'rgba(251,146,60,0.3)',   bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.25)', count: '4.1K+' },
  { name: 'Kinh Dị',    slug: 'kinh-di',     icon: 'ri-ghost-2-fill',           color: '#a78bfa', glow: 'rgba(167,139,250,0.3)',  bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', count: '3.8K+' },
  { name: 'Viễn Tưởng', slug: 'vien-tuong',  icon: 'ri-rocket-2-fill',          color: '#22d3ee', glow: 'rgba(34,211,238,0.3)',   bg: 'rgba(34,211,238,0.10)',  border: 'rgba(34,211,238,0.25)', count: '5.3K+' },
  { name: 'Phiêu Lưu',  slug: 'phieu-luu',   icon: 'ri-compass-3-fill',         color: '#34d399', glow: 'rgba(52,211,153,0.3)',   bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.25)', count: '3.2K+' },
  { name: 'Chiến Tranh', slug: 'chien-tranh', icon: 'ri-shield-star-fill',       color: '#f59e0b', glow: 'rgba(245,158,11,0.3)',   bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)', count: '2.7K+' },
  { name: 'Tâm Lý',     slug: 'tam-ly',      icon: 'ri-mind-map',               color: '#60a5fa', glow: 'rgba(96,165,250,0.3)',   bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)', count: '4.9K+' },
  { name: 'Cổ Trang',   slug: 'co-trang',    icon: 'ri-ancient-pavilion-fill',  color: '#fbbf24', glow: 'rgba(251,191,36,0.3)',   bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.25)', count: '5.1K+' },
  { name: 'Hình Sự',    slug: 'hinh-su',     icon: 'ri-search-eye-fill',        color: '#f87171', glow: 'rgba(248,113,113,0.3)',  bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)', count: '3.6K+' },
  { name: 'Hoạt Hình',  slug: 'hoat-hinh',   icon: 'ri-gamepad-fill',           color: '#4ade80', glow: 'rgba(74,222,128,0.3)',   bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.25)', count: '7.8K+' },
  { name: 'Gia Đình',   slug: 'gia-dinh',    icon: 'ri-home-heart-fill',        color: '#fb7185', glow: 'rgba(251,113,133,0.3)',  bg: 'rgba(251,113,133,0.10)', border: 'rgba(251,113,133,0.25)', count: '2.4K+' },
  { name: 'Việt Nam',   slug: 'phim-viet-nam', icon: 'ri-flag-fill',           color: '#facc15', glow: 'rgba(250,204,21,0.3)',   bg: 'rgba(250,204,21,0.10)',  border: 'rgba(250,204,21,0.25)', count: '2.0K+', to: '/phim-viet-nam' },
];

function GenreCards() {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={ref} className="mb-10">
      <div className="reveal flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-red-500 rounded-full" />
          <h3 className="text-white font-bold text-base md:text-lg">Thể Loại Phổ Biến</h3>
          <span className="text-[11px] text-white/30 font-medium hidden sm:block">— Khám phá theo sở thích</span>
        </div>
        <Link
          to="/filter"
          className="text-[12px] text-white/40 hover:text-red-400 transition-colors flex items-center gap-1 whitespace-nowrap"
        >
          Tất cả thể loại <i className="ri-arrow-right-s-line" />
        </Link>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-6 lg:grid-cols-12 gap-2.5 md:gap-3">
        {GENRE_LIST.map((g, i) => (
          <Link
            key={g.slug}
            to={g.to ?? `/the-loai/${g.slug}`}
            className="stagger-item genre-card group relative overflow-hidden rounded-xl flex flex-col items-center justify-center gap-2 py-3 px-1.5 cursor-pointer transition-transform duration-300 hover:-translate-y-1"
            style={{
              '--g-color': g.color,
              '--g-glow': g.glow,
              '--g-bg': g.bg,
              '--g-border': g.border,
              background: g.bg,
              border: `1px solid ${g.border}`,
              animationDelay: `${i * 50}ms`,
            } as React.CSSProperties}
          >
            {/* Glow blob */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full blur-xl opacity-30 group-hover:opacity-60 transition-opacity duration-300 pointer-events-none"
              style={{ background: g.color }}
            />

            {/* Icon circle */}
            <div
              className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
              style={{ background: `${g.color}20`, border: `1px solid ${g.color}35` }}
            >
              <i className={`${g.icon} text-lg`} style={{ color: g.color }} />
            </div>

            {/* Label */}
            <span
              className="relative text-[10px] md:text-[11px] font-bold text-center leading-tight transition-colors duration-200 whitespace-nowrap"
              style={{ color: g.color }}
            >
              {g.name}
            </span>

            {/* Count badge */}
            <span className="text-[9px] text-white/25 font-medium leading-none">{g.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default memo(GenreCards);
