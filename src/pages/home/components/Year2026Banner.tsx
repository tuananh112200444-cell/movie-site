import { Link } from 'react-router-dom';

/* ── Pre-calculate stable particles (no Math.random at render time) ── */
/* Giảm từ 12 → 6 particles — mỗi particle = 1 composite layer khi animating */
const PARTICLES = [
  { left: 12.3, top: 23.7, opacity: 0.4, size: 4, duration: 5.3, delay: 1.2 },
  { left: 45.1, top: 67.2, opacity: 0.5, size: 5, duration: 6.1, delay: 0.7 },
  { left: 78.4, top: 15.6, opacity: 0.3, size: 3, duration: 4.8, delay: 2.1 },
  { left: 31.2, top: 89.3, opacity: 0.6, size: 4, duration: 5.7, delay: 0.3 },
  { left: 88.9, top: 55.1, opacity: 0.4, size: 3, duration: 4.5, delay: 1.8 },
  { left: 5.6, top: 42.4, opacity: 0.5, size: 5, duration: 6.4, delay: 3.0 },
];

export default function Year2026Banner() {
  return (
    <section className="mb-7 md:mb-12 relative overflow-hidden rounded-xl md:rounded-2xl group/section">
      {/* ===== Background ===== */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a0a] via-[#0d0f18] to-[#1a0a0a]" />

      {/* Animated flowing light sweep — THAY BẰNG opacity pulse để tránh background-size paint */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none animate-pulse"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(239,68,68,0.12) 50%, transparent 60%)',
        }}
      />

      {/* Floating particles — STABLE pre-calculated values, chỉ 6 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-red-400/30"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animation: `floatUp ${p.duration}s linear infinite`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

      {/* Radial glow center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-radial from-red-500/8 via-transparent to-transparent pointer-events-none" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* ===== Content ===== */}
      <div className="relative px-4 py-4 md:px-6 md:py-14 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
        {/* Left content */}
        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center gap-2 mb-2 md:mb-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span className="text-red-400 text-[10px] md:text-xs font-bold uppercase tracking-[0.16em] md:tracking-[0.2em]">Mới Nhất 2026</span>
          </div>

          {/* Shimmer heading — DÙNG transform animation thay vì background-size */}
          <h3 className="text-lg md:text-3xl lg:text-4xl font-black mb-2 md:mb-3 leading-tight">
            <span className="text-white">Phim Hay Nhất</span>{' '}
            <br />
            <span className="text-white">Năm 2026</span>
          </h3>

          <p className="hidden md:block text-white/40 text-sm md:text-base max-w-md mb-5 leading-relaxed">
            Khám phá kho phim mới nhất 2026 với chất lượng HD, Full HD.
            Phim Hàn, Trung, Âu Mỹ cập nhật liên tục mỗi ngày.
          </p>

          <div className="flex items-center gap-2 md:gap-3 justify-center md:justify-start flex-wrap">
            <Link
              to="/phim-hot-2026"
              className="group/btn flex min-h-11 items-center gap-1.5 md:gap-2 bg-red-500 hover:bg-red-600 text-white text-xs md:text-sm font-bold px-3 py-2 md:px-5 md:py-2.5 rounded-lg md:rounded-xl transition-all hover:scale-[1.03] active:scale-[0.97] whitespace-nowrap shadow-lg shadow-red-500/25 hover:shadow-red-500/40 relative overflow-hidden touch-manipulation"
            >
              {/* Button shine on hover — CSS transform thay vì background-position */}
              <span
                className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                }}
              />
              <i className="ri-fire-fill text-sm" />
              Xem Phim Hot 2026
            </Link>
            <Link
              to="/phim-moi-nhat"
              className="flex min-h-11 items-center gap-1.5 md:gap-2 bg-white/[0.06] hover:bg-white/[0.10] text-white/70 hover:text-white text-xs md:text-sm font-medium px-3 py-2 md:px-5 md:py-2.5 rounded-lg md:rounded-xl transition-all border border-white/[0.08] hover:border-white/20 whitespace-nowrap touch-manipulation"
            >
              <i className="ri-refresh-line text-sm" />
              Phim Mới Cập Nhật
            </Link>
          </div>
        </div>

        {/* Right - 3 poster cards with dramatic hover */}
        <div className="hidden md:flex items-center gap-3 flex-shrink-0 perspective-[800px]">
          {[
            '/images/movie-poster-fallback.svg',
            '/images/movie-poster-fallback.svg',
            '/images/movie-poster-fallback.svg',
          ].map((src, i) => (
            <div
              key={i}
              className="relative w-20 h-28 rounded-lg overflow-hidden bg-[#16192a] border border-white/[0.06] shadow-cinematic poster-card group/card"
              style={{
                transform: `rotate(${i === 0 ? -6 : i === 2 ? 6 : 0}deg) translateY(${i === 1 ? -8 : 0}px)`,
                transition: 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.4s ease',
              }}
            >
              <img
                src={src}
                alt={`Poster phim hay 2026 ${i + 1}`}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                loading="lazy"
              />
              {/* Hover glow ring — Giảm opacity */}
              <div className="absolute inset-0 rounded-lg opacity-0 group-hover/card:opacity-100 transition-opacity duration-400 pointer-events-none"
                style={{ boxShadow: 'inset 0 0 16px rgba(239,68,68,0.2), 0 0 20px rgba(239,68,68,0.1)' }}
              />
              {/* Film perforations */}
              <div className="absolute top-0 left-0 right-0 flex justify-between px-1 py-0.5 z-10 pointer-events-none">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="w-1.5 h-1 bg-white/20 rounded-sm" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Animated border glow bottom — THAY BẰNG opacity pulse (không background-size) ===== */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.6), rgba(245,158,11,0.4), rgba(239,68,68,0.6), transparent)',
            opacity: 0.5,
          }}
        />
      </div>

      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />

      {/* Inline keyframes */}
      <style>{`
        @keyframes lightSweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes floatUp {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-120px) scale(0.4); opacity: 0; }
        }
        /* Poster card hover lift */
        .poster-card:hover {
          transform: rotate(0deg) translateY(-10px) scale(1.08) !important;
          z-index: 10;
        }
      `}</style>
    </section>
  );
}
