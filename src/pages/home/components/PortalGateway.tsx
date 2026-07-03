import { useCallback } from 'react';

interface PortalGatewayProps {
  onSelect: (portal: 'movies' | 'queer') => void;
  compact?: boolean;
}

export default function PortalGateway({ onSelect, compact }: PortalGatewayProps) {
  const handleSelect = useCallback((portal: 'movies' | 'queer') => {
    onSelect(portal);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onSelect]);

  if (compact) {
    return (
      <section className="mx-auto mb-7 max-w-[980px] md:mb-9">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
          <button
            type="button"
            onClick={() => handleSelect('movies')}
            className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] p-3.5 text-left transition-all hover:border-amber-400/30 hover:bg-white/[0.06] active:scale-[0.98] md:p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300 md:h-10 md:w-10">
                <i className="ri-movie-2-line text-lg" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">Kho Phim</p>
                <p className="text-xs text-white/50 mt-0.5">tổng hợp phim thể loại chiếu rạp , netflix</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelect('queer')}
            className="group relative overflow-hidden rounded-xl border border-cyan-400/15 bg-[#081112] p-3.5 text-left transition-all hover:border-cyan-300/40 hover:bg-[#0a1416] active:scale-[0.98] md:p-4"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.10),transparent_40%)]" />
            <div className="relative z-[1] flex items-center gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300 md:h-10 md:w-10">
                <i className="ri-heart-3-line text-lg" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">Vũ trụ đam my / GL</p>
                <p className="text-xs text-white/50 mt-0.5">BL, GL, Bach Hop</p>
              </div>
            </div>
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-10 md:mb-14">
        <p className="text-xs md:text-sm font-bold uppercase tracking-[0.28em] text-white/40 mb-3">
          Chon khong gian cua ban
        </p>
        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
          KhoPhim
        </h2>
        <p className="mt-3 text-sm md:text-base text-white/50 max-w-lg mx-auto leading-relaxed">
          Chon kho phim tong hop hoac khong gian phim Dam My, BL, GL va Bach Hop
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8 w-full max-w-4xl">
        {/* Movies Portal */}
        <button
          type="button"
          onClick={() => handleSelect('movies')}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 md:p-10 text-left transition-all hover:border-amber-400/30 hover:bg-white/[0.07] active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(251,191,36,0.08),transparent_40%)]" />
          <div className="relative z-[1]">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300 mb-5">
              <i className="ri-movie-2-line text-2xl" />
            </span>
            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
              Kho Phim Tong Hop
            </h3>
            <p className="text-sm text-white/50 leading-relaxed mb-5">
              Phim le, phim bo, phim chieu rap, hoat hinh, anime, phim Han, Trung, Au My. Cap nhat hang ngay.
            </p>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-300 transition-colors group-hover:text-amber-200">
              Vao kho phim
              <i className="ri-arrow-right-line transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </button>

        {/* Queer Universe Portal */}
        <button
          type="button"
          onClick={() => handleSelect('queer')}
          className="group relative overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#081112] p-6 md:p-10 text-left transition-all hover:border-cyan-300/40 hover:bg-[#0a1416] active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.14),transparent_40%),radial-gradient(circle_at_20%_100%,rgba(244,114,182,0.10),transparent_40%)]" />
          <div className="relative z-[1]">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300 mb-5">
              <i className="ri-heart-3-line text-2xl" />
            </span>
            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
              Vu Tru Dam My / GL
            </h3>
            <p className="text-sm text-white/50 leading-relaxed mb-5">
              Khong gian rieng cho phim Dam My, BL, GL va Bach Hop. Cap nhat phim moi va tap moi lien tuc.
            </p>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-cyan-300 transition-colors group-hover:text-cyan-200">
              Kham pha ngay
              <i className="ri-arrow-right-line transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </button>
      </div>

      <p className="mt-10 text-xs text-white/30 text-center">
        Ban co the doi khong gian bat ky luc nao tu menu tren trang chu
      </p>
    </div>
  );
}
