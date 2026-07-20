import { memo, useState } from 'react';

interface Props {
  selectedType: string;
  selectedYear: string;
  selectedGenre: string;
  selectedCountry: string;
  selectedAudio: string;
  onTypeChange: (v: string) => void;
  onYearChange: (v: string) => void;
  onGenreChange: (v: string) => void;
  onCountryChange: (v: string) => void;
  onAudioChange: (v: string) => void;
  onReset: () => void;
  activeCount: number;
}

const TYPES = [
  { label: 'Tất Cả', slug: '', icon: 'ri-film-line' },
  { label: 'Phim Lẻ', slug: 'single', icon: 'ri-movie-line' },
  { label: 'Phim Bộ', slug: 'series', icon: 'ri-tv-2-line' },
  { label: 'Chiếu Rạp', slug: 'cinema', icon: 'ri-building-line' },
  { label: 'Hoạt Hình', slug: 'hoathinh', icon: 'ri-gamepad-line' },
];

const CURRENT_YEAR = Math.max(new Date().getFullYear(), 2026);
const YEARS = Array.from({ length: CURRENT_YEAR - 1989 + 1 }, (_, i) => String(CURRENT_YEAR - i));

const GENRES = [
  { label: 'Hành Động', slug: 'hanh-dong', icon: 'ri-flashlight-line' },
  { label: 'Tình Cảm', slug: 'tinh-cam', icon: 'ri-heart-3-line' },
  { label: 'Hài Hước', slug: 'hai-huoc', icon: 'ri-emotion-laugh-line' },
  { label: 'Kinh Dị', slug: 'kinh-di', icon: 'ri-ghost-line' },
  { label: 'Cổ Trang', slug: 'co-trang', icon: 'ri-building-3-line' },
  { label: 'Viễn Tưởng', slug: 'vien-tuong', icon: 'ri-planet-line' },
  { label: 'Tâm Lý', slug: 'tam-ly', icon: 'ri-mind-map' },
  { label: 'Hình Sự', slug: 'hinh-su', icon: 'ri-police-car-line' },
  { label: 'Phiêu Lưu', slug: 'phieu-luu', icon: 'ri-compass-3-line' },
  { label: 'Gia Đình', slug: 'gia-dinh', icon: 'ri-home-heart-line' },
  { label: 'Học Đường', slug: 'hoc-duong', icon: 'ri-graduation-cap-line' },
  { label: 'Thể Thao', slug: 'the-thao', icon: 'ri-basketball-line' },
];

const COUNTRIES = [
  { label: 'Hàn Quốc', slug: 'han-quoc', icon: '🇰🇷' },
  { label: 'Trung Quốc', slug: 'trung-quoc', icon: '🇨🇳' },
  { label: 'Âu Mỹ', slug: 'au-my', icon: '🇺🇸' },
  { label: 'Nhật Bản', slug: 'nhat-ban', icon: '🇯🇵' },
  { label: 'Việt Nam', slug: 'viet-nam', icon: '🇻🇳' },
  { label: 'Thái Lan', slug: 'thai-lan', icon: '🇹🇭' },
  { label: 'Ấn Độ', slug: 'an-do', icon: '🇮🇳' },
  { label: 'Đài Loan', slug: 'dai-loan', icon: '🇹🇼' },
];

const AUDIO_TYPES = [
  { label: 'Vietsub', slug: 'vietsub', icon: 'ri-file-text-line' },
  { label: 'Thuyết minh', slug: 'thuyetminh', icon: 'ri-mic-2-line' },
  { label: 'Lồng tiếng', slug: 'longtieng', icon: 'ri-volume-up-line' },
];

function SearchFilterBar({
  selectedType,
  selectedYear,
  selectedGenre,
  selectedCountry,
  selectedAudio,
  onTypeChange,
  onYearChange,
  onGenreChange,
  onCountryChange,
  onAudioChange,
  onReset,
  activeCount,
}: Props) {
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const togglePanel = (panel: string) => {
    setOpenPanel(openPanel === panel ? null : panel);
  };

  return (
    <div className="space-y-3">
      {/* Active filters + Reset */}
      {activeCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/25 uppercase tracking-wider flex-shrink-0">Đang lọc:</span>
          {selectedType && (
            <FilterChip
              label={TYPES.find(t => t.slug === selectedType)?.label ?? selectedType}
              onRemove={() => onTypeChange('')}
            />
          )}
          {selectedYear && (
            <FilterChip
              label={`Năm ${selectedYear}`}
              onRemove={() => onYearChange('')}
            />
          )}
          {selectedGenre && (
            <FilterChip
              label={GENRES.find(g => g.slug === selectedGenre)?.label ?? selectedGenre}
              onRemove={() => onGenreChange('')}
            />
          )}
          {selectedCountry && (
            <FilterChip
              label={COUNTRIES.find(c => c.slug === selectedCountry)?.label ?? selectedCountry}
              onRemove={() => onCountryChange('')}
            />
          )}
          {selectedAudio && (
            <FilterChip
              label={AUDIO_TYPES.find((item) => item.slug === selectedAudio)?.label ?? selectedAudio}
              onRemove={() => onAudioChange('')}
            />
          )}
          <button
            onClick={onReset}
            className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ml-1"
          >
            <i className="ri-refresh-line" />
            Xóa tất cả
          </button>
        </div>
      )}

      {/* Quick filter pills — horizontal scroll on mobile */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1" aria-label="Lọc theo phiên bản âm thanh">
          {AUDIO_TYPES.map((item) => (
            <button
              key={item.slug}
              type="button"
              aria-pressed={selectedAudio === item.slug}
              onClick={() => onAudioChange(selectedAudio === item.slug ? '' : item.slug)}
              className={`flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors ${selectedAudio === item.slug ? 'bg-emerald-500 text-white' : 'text-white/50 hover:bg-white/[0.08] hover:text-white'}`}
            >
              <i className={item.icon} />{item.label}
            </button>
          ))}
        </div>
        {/* Type dropdown trigger */}
        <div className="relative">
          <button
            onClick={() => togglePanel('type')}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap border ${
              selectedType
                ? 'bg-red-500 text-white font-semibold border-red-500'
                : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08] border-white/[0.06]'
            }`}
          >
            <i className={`${selectedType ? TYPES.find(t => t.slug === selectedType)?.icon ?? 'ri-film-line' : 'ri-film-line'} text-xs`} />
            {selectedType ? TYPES.find(t => t.slug === selectedType)?.label : 'Loại phim'}
            <i className={`ri-arrow-down-s-line text-xs transition-transform ${openPanel === 'type' ? 'rotate-180' : ''}`} />
          </button>
          {openPanel === 'type' && (
            <div className="absolute top-full left-0 mt-2 bg-[#1a1d27] border border-white/10 rounded-xl overflow-hidden z-40 min-w-[180px] shadow-2xl">
              {TYPES.map(t => (
                <button
                  key={t.slug}
                  onClick={() => { onTypeChange(selectedType === t.slug ? '' : t.slug); setOpenPanel(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-left ${
                    selectedType === t.slug
                      ? 'bg-red-500/15 text-red-400 font-semibold'
                      : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                  }`}
                >
                  <i className={`${t.icon} text-xs flex-shrink-0 w-4`} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Year dropdown trigger */}
        <div className="relative">
          <button
            onClick={() => togglePanel('year')}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap border ${
              selectedYear
                ? 'bg-amber-500 text-white font-semibold border-amber-500'
                : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08] border-white/[0.06]'
            }`}
          >
            <i className="ri-calendar-line text-xs" />
            {selectedYear ? `Năm ${selectedYear}` : 'Năm'}
            <i className={`ri-arrow-down-s-line text-xs transition-transform ${openPanel === 'year' ? 'rotate-180' : ''}`} />
          </button>
          {openPanel === 'year' && (
            <div className="absolute top-full left-0 mt-2 bg-[#1a1d27] border border-white/10 rounded-xl overflow-hidden z-40 min-w-[160px] shadow-2xl max-h-[320px] overflow-y-auto">
              {YEARS.map(y => (
                <button
                  key={y}
                  onClick={() => { onYearChange(selectedYear === y ? '' : y); setOpenPanel(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-left ${
                    selectedYear === y
                      ? 'bg-amber-500/15 text-amber-400 font-semibold'
                      : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                  }`}
                >
                  <i className="ri-calendar-event-line text-xs flex-shrink-0 w-4" />
                  Năm {y}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Genre dropdown trigger */}
        <div className="relative">
          <button
            onClick={() => togglePanel('genre')}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap border ${
              selectedGenre
                ? 'bg-teal-500 text-white font-semibold border-teal-500'
                : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08] border-white/[0.06]'
            }`}
          >
            <i className="ri-apps-line text-xs" />
            {selectedGenre ? GENRES.find(g => g.slug === selectedGenre)?.label : 'Thể loại'}
            <i className={`ri-arrow-down-s-line text-xs transition-transform ${openPanel === 'genre' ? 'rotate-180' : ''}`} />
          </button>
          {openPanel === 'genre' && (
            <div className="absolute top-full left-0 mt-2 bg-[#1a1d27] border border-white/10 rounded-xl overflow-hidden z-40 min-w-[200px] shadow-2xl max-h-[320px] overflow-y-auto">
              <div className="grid grid-cols-1 gap-0.5 p-1">
                {GENRES.map(g => {
                  const featured = g.slug === 'bl' || g.slug === 'gl';
                  return (
                    <button
                      key={g.slug}
                      onClick={() => { onGenreChange(selectedGenre === g.slug ? '' : g.slug); setOpenPanel(null); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-left rounded-lg ${
                        selectedGenre === g.slug
                          ? featured
                            ? 'bg-gradient-to-r from-fuchsia-500/30 to-rose-500/25 text-white font-black border border-fuchsia-300/30'
                            : 'bg-teal-500/15 text-teal-400 font-semibold'
                          : featured
                            ? 'text-fuchsia-200 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-400/20'
                            : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                      }`}
                    >
                      <i className={`${g.icon} text-xs flex-shrink-0 w-4`} />
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Country dropdown trigger */}
        <div className="relative">
          <button
            onClick={() => togglePanel('country')}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap border ${
              selectedCountry
                ? 'bg-indigo-500 text-white font-semibold border-indigo-500'
                : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08] border-white/[0.06]'
            }`}
          >
            <i className="ri-global-line text-xs" />
            {selectedCountry ? COUNTRIES.find(c => c.slug === selectedCountry)?.label : 'Quốc gia'}
            <i className={`ri-arrow-down-s-line text-xs transition-transform ${openPanel === 'country' ? 'rotate-180' : ''}`} />
          </button>
          {openPanel === 'country' && (
            <div className="absolute top-full left-0 mt-2 bg-[#1a1d27] border border-white/10 rounded-xl overflow-hidden z-40 min-w-[180px] shadow-2xl">
              {COUNTRIES.map(c => (
                <button
                  key={c.slug}
                  onClick={() => { onCountryChange(selectedCountry === c.slug ? '' : c.slug); setOpenPanel(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-left ${
                    selectedCountry === c.slug
                      ? 'bg-indigo-500/15 text-indigo-400 font-semibold'
                      : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                  }`}
                >
                  <span className="text-sm flex-shrink-0 w-4">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Click outside to close */}
        {openPanel && (
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpenPanel(null)}
          />
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 bg-red-500/15 text-red-400 border border-red-500/25 text-sm px-2.5 py-1 rounded-full font-medium">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-white transition-colors cursor-pointer"
      >
        <i className="ri-close-line text-xs" />
      </button>
    </span>
  );
}

export default memo(SearchFilterBar);
