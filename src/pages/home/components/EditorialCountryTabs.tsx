import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MovieCard from '../../../components/base/MovieCard';
import type { MovieItem } from '../../../types/movie';

type CountryKey = 'korea' | 'china' | 'western' | 'thailand';

interface EditorialCountryTabsProps {
  korea: MovieItem[];
  china: MovieItem[];
  western: MovieItem[];
  thailand: MovieItem[];
  loading?: boolean;
}

const TABS: Array<{ key: CountryKey; label: string; href: string }> = [
  { key: 'korea', label: 'Hàn Quốc', href: '/phim-han-quoc' },
  { key: 'china', label: 'Trung Quốc', href: '/phim-trung-quoc' },
  { key: 'western', label: 'Âu Mỹ', href: '/phim-au-my' },
  { key: 'thailand', label: 'Thái Lan', href: '/phim-thai-lan' },
];

export default function EditorialCountryTabs({ korea, china, western, thailand, loading = false }: EditorialCountryTabsProps) {
  const [active, setActive] = useState<CountryKey>('korea');
  const groups = useMemo(() => ({ korea, china, western, thailand }), [korea, china, western, thailand]);
  const movies = groups[active].slice(0, 10);
  const meta = TABS.find((tab) => tab.key === active) ?? TABS[0];

  if (!loading && movies.length === 0) return null;

  return (
    <section className="editorial-country-section" aria-labelledby="editorial-country-title">
      <header className="editorial-country-header">
        <div>
          <p className="editorial-eyebrow">Đi một vòng thế giới</p>
          <h2 id="editorial-country-title">Điện ảnh theo quốc gia</h2>
        </div>
        <div className="editorial-country-actions">
          <div role="tablist" aria-label="Chọn quốc gia" className="editorial-country-tabs">
            {TABS.map((tab) => (
              <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} onClick={() => setActive(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
          <Link to={meta.href}>Xem tất cả <i className="ri-arrow-right-line" aria-hidden="true" /></Link>
        </div>
      </header>

      <div className="editorial-country-grid" role="tabpanel">
        {loading && movies.length === 0
          ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="editorial-poster-skeleton skeleton" />)
          : movies.map((movie, index) => <MovieCard key={`${active}-${movie._id || movie.slug}-${index}`} movie={movie} />)}
      </div>
    </section>
  );
}
