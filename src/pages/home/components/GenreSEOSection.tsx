import { Link } from 'react-router-dom';

const primaryLinks = [
  { label: 'Chiếu Rạp', to: '/phim-chieu-rap', icon: 'ri-building-4-line', tone: 'text-amber-300 border-amber-400/20 bg-amber-500/[0.07]' },
  { label: 'Phim Lẻ', to: '/phim-le', icon: 'ri-movie-2-line', tone: 'text-red-300 border-red-400/20 bg-red-500/[0.07]' },
  { label: 'Phim Bộ', to: '/phim-bo', icon: 'ri-tv-2-line', tone: 'text-sky-300 border-sky-400/20 bg-sky-500/[0.07]' },
  { label: 'Trung Quốc', to: '/phim-trung-quoc', icon: 'ri-ancient-pavilion-line', tone: 'text-orange-300 border-orange-400/20 bg-orange-500/[0.07]' },
  { label: 'Hàn Quốc', to: '/phim-han-quoc', icon: 'ri-heart-3-line', tone: 'text-pink-300 border-pink-400/20 bg-pink-500/[0.07]' },
  { label: 'Thái Lan', to: '/phim-thai-lan', icon: 'ri-flower-line', tone: 'text-violet-300 border-violet-400/20 bg-violet-500/[0.07]' },
  { label: 'Hoạt Hình', to: '/hoat-hinh', icon: 'ri-gamepad-line', tone: 'text-emerald-300 border-emerald-400/20 bg-emerald-500/[0.07]' },
  { label: 'Phim 4K', to: '/phim-4k', icon: 'ri-4k-line', tone: 'text-cyan-300 border-cyan-400/20 bg-cyan-500/[0.07]' },
] as const;

const secondaryLinks = [
  { label: 'Hành Động', to: '/the-loai/hanh-dong' },
  { label: 'Tình Cảm', to: '/the-loai/tinh-cam' },
  { label: 'Hài Hước', to: '/the-loai/hai-huoc' },
  { label: 'Kinh Dị', to: '/the-loai/kinh-di' },
  { label: 'Viễn Tưởng', to: '/the-loai/vien-tuong' },
  { label: 'Cổ Trang', to: '/the-loai/co-trang' },
  { label: 'Tâm Lý', to: '/the-loai/tam-ly' },
  { label: 'Việt Nam', to: '/phim-viet-nam' },
  { label: 'Âu Mỹ', to: '/phim-au-my' },
] as const;

export default function GenreSEOSection() {
  return (
    <section className="mt-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0f16]" aria-labelledby="genre-seo-heading">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-red-300/70">Duyệt nhanh</p>
          <h2 id="genre-seo-heading" className="mt-0.5 text-lg font-black text-white sm:text-xl">Bạn muốn xem gì?</h2>
        </div>
        <Link
          to="/filter"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-black text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
        >
          Tất cả <i className="ri-arrow-right-line" aria-hidden="true" />
        </Link>
      </div>

      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {primaryLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`group flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl border px-2 text-center transition-[border-color,background-color,transform] hover:border-white/25 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 md:hover:-translate-y-0.5 ${item.tone}`}
              aria-label={`Xem ${item.label}`}
            >
              <i className={`${item.icon} text-xl`} aria-hidden="true" />
              <span className="text-xs font-black text-white sm:text-sm">{item.label}</span>
            </Link>
          ))}
        </div>

        <details className="group mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-bold text-white/45 transition-colors hover:text-white/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 sm:px-4">
            <span>Thể loại và quốc gia khác</span>
            <i className="ri-arrow-down-s-line text-base transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] p-3 sm:grid-cols-3 lg:grid-cols-5">
            {secondaryLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex min-h-11 items-center justify-between rounded-lg border border-white/[0.07] bg-black/10 px-3 text-xs font-bold text-white/50 transition-colors hover:border-white/15 hover:bg-white/[0.05] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
              >
                {item.label}<i className="ri-arrow-right-s-line text-white/20" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
