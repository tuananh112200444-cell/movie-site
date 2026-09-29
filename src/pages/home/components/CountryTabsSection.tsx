import { useMemo, useState } from 'react';
import MovieSection from './MovieSection';
import type { MovieItem } from '../../../types/movie';

type CountryKey = 'au-my' | 'trung-quoc' | 'han-quoc' | 'thai-lan';

const COUNTRIES: Array<{
  key: CountryKey;
  label: string;
  code: string;
  link: string;
  theme: 'hollywood' | 'oriental' | 'kdrama' | 'tropical';
}> = [
  { key: 'au-my', label: 'Âu Mỹ', code: 'WEST', link: '/phim-au-my', theme: 'hollywood' },
  { key: 'trung-quoc', label: 'Trung Quốc', code: 'CN', link: '/phim-trung-quoc', theme: 'oriental' },
  { key: 'han-quoc', label: 'Hàn Quốc', code: 'KR', link: '/phim-han-quoc', theme: 'kdrama' },
  { key: 'thai-lan', label: 'Thái Lan', code: 'TH', link: '/phim-thai-lan', theme: 'tropical' },
];

export default function CountryTabsSection({
  sections,
  loading,
  compactMobile,
}: {
  sections: Record<string, MovieItem[]>;
  loading: boolean;
  compactMobile: boolean;
}) {
  const [active, setActive] = useState<CountryKey>('au-my');
  const selected = useMemo(
    () => COUNTRIES.find((country) => country.key === active) ?? COUNTRIES[0],
    [active],
  );

  return (
    <section className="world-index" aria-labelledby="world-index-title">
      <header className="world-index__header">
        <div>
          <p className="world-index__eyebrow">WORLD / 04 REGIONS</p>
          <h3 id="world-index-title">Phim Theo Quốc Gia</h3>
        </div>
        <nav className="world-index__tabs" aria-label="Chọn quốc gia">
          {COUNTRIES.map((country) => (
            <button
              key={country.key}
              type="button"
              className={active === country.key ? 'is-active' : ''}
              onClick={() => setActive(country.key)}
              aria-pressed={active === country.key}
            >
              <span>{country.code}</span>
              {country.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="world-index__content" key={selected.key}>
        <MovieSection
          title={`Phim ${selected.label}`}
          movies={(sections[selected.key] ?? []).slice(0, compactMobile ? 9 : 18)}
          loading={loading}
          viewAllLink={selected.link}
          cols={6}
          theme={selected.theme}
          mobileLayout="rail"
        />
      </div>
    </section>
  );
}
