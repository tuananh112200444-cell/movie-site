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

function selectFreshCountryMovies(items: MovieItem[], country: CountryKey, limit: number): MovieItem[] {
  const currentYear = new Date().getFullYear();
  const seen = new Set<string>();
  return [...items]
    .filter((movie) => {
      const slug = String(movie.slug || '').trim();
      const year = Number(movie.year || 0);
      if (!slug || seen.has(slug)) return false;
      if (year < currentYear - 1 || year > currentYear + 1) return false;
      if (!(movie.country ?? []).some((entry) => entry?.slug === country)) return false;
      if (/trailer|teaser/i.test(String(movie.episode_current || ''))) return false;
      seen.add(slug);
      return true;
    })
    .sort((left, right) => {
      const yearDelta = Number(right.year || 0) - Number(left.year || 0);
      if (yearDelta !== 0) return yearDelta;
      const leftTime = Date.parse(left.created_at || left.published_at || left.modified?.time || '') || 0;
      const rightTime = Date.parse(right.created_at || right.published_at || right.modified?.time || '') || 0;
      return rightTime - leftTime || String(right._id || '').localeCompare(String(left._id || ''));
    })
    .slice(0, limit);
}

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
  const selectedMovies = useMemo(
    () => selectFreshCountryMovies(sections[selected.key] ?? [], selected.key, compactMobile ? 9 : 18),
    [compactMobile, sections, selected.key],
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
          movies={selectedMovies}
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
