import { Link } from 'react-router-dom';
import { useCallback, type CSSProperties } from 'react';
import { GENRE_LIST } from './GenreCards';
import { useScrollReveal } from '../../../hooks/useScrollReveal';

interface HomeDiscoverySectionProps {
  onSelect: (portal: 'movies' | 'queer') => void;
}

const PORTALS = [
  {
    key: 'movies' as const,
    title: 'Kho Phim',
    subtitle: 'Phim le, phim bo, chieu rap, anime',
    icon: 'ri-movie-2-line',
    tone: 'amber',
    bg: 'linear-gradient(135deg, rgba(120,72,25,0.34), rgba(40,24,14,0.86) 45%, rgba(16,18,27,0.92))',
    grain: 'radial-gradient(circle at 18% 16%, rgba(255,221,150,0.16), transparent 34%), linear-gradient(90deg, rgba(255,255,255,0.06), transparent 18%, rgba(0,0,0,0.18) 52%, transparent)',
  },
  {
    key: 'queer' as const,
    title: 'Vu Tru Dam My',
    subtitle: 'BL, GL, bach hop, phim moi cap nhat',
    icon: 'ri-heart-3-line',
    tone: 'cyan',
    bg: 'linear-gradient(135deg, rgba(80,49,37,0.34), rgba(22,35,38,0.88) 50%, rgba(11,16,25,0.94))',
    grain: 'radial-gradient(circle at 82% 10%, rgba(34,211,238,0.16), transparent 36%), linear-gradient(90deg, rgba(255,255,255,0.05), transparent 22%, rgba(0,0,0,0.2) 58%, transparent)',
  },
];

export default function HomeDiscoverySection({ onSelect }: HomeDiscoverySectionProps) {
  const ref = useScrollReveal<HTMLElement>();

  const handleSelect = useCallback((portal: 'movies' | 'queer') => {
    onSelect(portal);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onSelect]);

  return (
    <section
      ref={ref}
      className="reveal kp-cinema-surface mb-8 hidden overflow-hidden rounded-2xl border p-3 sm:block"
      aria-label="Chon kho phim va the loai"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(210px,0.72fr)_minmax(0,3.28fr)] xl:grid-cols-[minmax(220px,0.74fr)_minmax(0,3.26fr)]">
        <div className="grid gap-2.5">
          {PORTALS.map((portal) => (
            <button
              key={portal.key}
              type="button"
              onClick={() => handleSelect(portal.key)}
              className="group relative min-h-[92px] overflow-hidden rounded-xl border border-amber-100/12 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_40px_-30px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-200/24 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_20px_54px_-34px_rgba(245,158,11,0.55)] active:scale-[0.99] lg:min-h-[102px] xl:min-h-[106px]"
              style={{ background: portal.bg }}
            >
              <div className="absolute inset-0 opacity-80" style={{ background: portal.grain }} />
              <div className="absolute inset-x-4 top-3 h-px bg-gradient-to-r from-transparent via-amber-100/28 to-transparent" />
              <div className="absolute inset-x-4 bottom-3 h-px bg-gradient-to-r from-transparent via-black/45 to-transparent" />

              <div className="relative z-[1] flex h-full items-center gap-2.5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-black/24 text-lg ${
                  portal.tone === 'cyan'
                    ? 'border-cyan-300/20 text-cyan-200'
                    : 'border-amber-300/20 text-amber-200'
                }`}>
                  <i className={portal.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black tracking-tight text-white xl:text-base">{portal.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-white/50 xl:text-xs">{portal.subtitle}</p>
                  <span className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold ${
                    portal.tone === 'cyan' ? 'text-cyan-200' : 'text-amber-200'
                  }`}>
                    Mo khong gian
                    <i className="ri-arrow-right-line transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-white lg:text-lg">The Loai Pho Bien</h3>
              <p className="mt-0.5 hidden text-xs text-white/35 md:block">Chon nhanh dung gu phim muon xem</p>
            </div>
            <Link
              to="/filter"
              className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/55 transition-colors hover:border-red-400/30 hover:text-red-300"
            >
              Tat ca
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {GENRE_LIST.slice(0, 12).map((g, index) => (
              <Link
                key={g.slug}
                to={g.to ?? `/the-loai/${g.slug}`}
                className="group relative min-h-[76px] overflow-hidden rounded-lg border p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.06] xl:min-h-[82px]"
                style={{
                  '--g-color': g.color,
                  background: g.bg,
                  borderColor: g.border,
                  animationDelay: `${index * 35}ms`,
                } as CSSProperties}
              >
                <div
                  className="absolute right-1 top-1 h-8 w-8 rounded-full opacity-25 blur-xl transition-opacity group-hover:opacity-55"
                  style={{ background: g.color }}
                />
                <div className="relative z-[1] flex h-full flex-col justify-between">
                  <i className={`${g.icon} text-lg`} style={{ color: g.color }} />
                  <div>
                    <p className="truncate text-xs font-black text-white/88">{g.name}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/30">{g.count}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
