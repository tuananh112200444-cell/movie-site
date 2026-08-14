import { BadgeCheck, Film, LibraryBig, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const VERIFIED_AT = '11/08/2026';

const catalogStats = [
  {
    label: 'Đầu phim duy nhất',
    value: '41.950',
    note: 'Không tính trùng slug',
    icon: LibraryBig,
    tone: 'from-amber-300/20 to-orange-500/5 text-amber-200 ring-amber-300/20',
  },
  {
    label: 'Phim đang công khai',
    value: '38.431',
    note: 'Khán giả có thể khám phá',
    icon: Film,
    tone: 'from-sky-300/20 to-cyan-500/5 text-sky-200 ring-sky-300/20',
  },
  {
    label: 'Phim có nguồn phát',
    value: '37.821',
    note: 'Đã ghi nhận nguồn xem',
    icon: PlayCircle,
    tone: 'from-emerald-300/20 to-green-500/5 text-emerald-200 ring-emerald-300/20',
  },
  {
    label: 'Slug bị trùng',
    value: '0',
    note: '41.950 slug đều duy nhất',
    icon: BadgeCheck,
    tone: 'from-fuchsia-300/20 to-violet-500/5 text-fuchsia-200 ring-fuchsia-300/20',
  },
] as const;

export default function CatalogStatsSection() {
  return (
    <section
      className="relative mb-5 overflow-hidden rounded-2xl border border-white/[0.09] bg-[radial-gradient(circle_at_8%_0%,rgba(251,191,36,0.13),transparent_28%),radial-gradient(circle_at_94%_100%,rgba(239,68,68,0.12),transparent_30%),linear-gradient(145deg,rgba(22,25,39,0.98),rgba(9,11,19,0.98))] px-3 py-4 shadow-[0_24px_70px_-52px_rgba(251,191,36,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] sm:mb-7 sm:px-5 sm:py-5 lg:px-7 lg:py-6"
      aria-labelledby="catalog-stats-heading"
    >
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent" />

      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/90 sm:text-[11px]">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Số liệu hệ thống đã xác minh
          </div>
          <h2 id="catalog-stats-heading" className="text-xl font-black tracking-tight text-white sm:text-2xl lg:text-3xl">
            Kho phim khổng lồ — chọn mãi không hết
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-white/52 sm:text-sm">
            Một bức tranh minh bạch về quy mô nội dung đang được KhoPhim quản lý và phục vụ khán giả.
          </p>
        </div>

        <Link
          to="/phim-moi-nhat"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-4 text-xs font-black text-amber-100 transition hover:border-amber-200/35 hover:bg-amber-300/[0.13] sm:self-auto"
        >
          Khám phá kho phim
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5" aria-label="Bảng thống kê kho phim">
        {catalogStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article
              key={stat.label}
              className={`rounded-xl bg-gradient-to-br p-3 ring-1 ring-inset ${stat.tone} sm:p-4`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <Icon className="h-5 w-5 opacity-90 sm:h-6 sm:w-6" aria-hidden="true" />
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70 shadow-[0_0_14px_currentColor]" aria-hidden="true" />
              </div>
              <p className="tabular-nums text-[1.65rem] font-black leading-none tracking-[-0.04em] text-white sm:text-3xl lg:text-[2rem]">
                {stat.value}
              </p>
              <h3 className="mt-2 text-[11px] font-extrabold leading-tight text-white/88 sm:text-sm">{stat.label}</h3>
              <p className="mt-1 text-[10px] leading-snug text-white/42 sm:text-xs">{stat.note}</p>
            </article>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-white/35 sm:text-[11px]">
        Snapshot ngày {VERIFIED_AT}. “Có nguồn phát” phản ánh nguồn đã được hệ thống ghi nhận tại thời điểm kiểm tra.
      </p>
    </section>
  );
}
