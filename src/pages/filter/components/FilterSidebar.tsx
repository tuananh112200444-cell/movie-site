import { useState, useEffect } from 'react';

export const GENRES = [
  { name: 'Hành Động', slug: 'hanh-dong', icon: 'ri-sword-line' },
  { name: 'Tình Cảm', slug: 'tinh-cam', icon: 'ri-heart-line' },
  { name: 'Hài Hước', slug: 'hai-huoc', icon: 'ri-emotion-laugh-line' },
  { name: 'Cổ Trang', slug: 'co-trang', icon: 'ri-ancient-gate-line' },
  { name: 'Tâm Lý', slug: 'tam-ly', icon: 'ri-mental-health-line' },
  { name: 'Kinh Dị', slug: 'kinh-di', icon: 'ri-ghost-line' },
  { name: 'Viễn Tưởng', slug: 'vien-tuong', icon: 'ri-planet-line' },
  { name: 'Phiêu Lưu', slug: 'phieu-luu', icon: 'ri-compass-3-line' },
  { name: 'Chiến Tranh', slug: 'chien-tranh', icon: 'ri-shield-cross-line' },
  { name: 'Hình Sự', slug: 'hinh-su', icon: 'ri-spy-line' },
  { name: 'Hoạt Hình', slug: 'hoat-hinh', icon: 'ri-gamepad-line' },
  { name: 'Gia Đình', slug: 'gia-dinh', icon: 'ri-home-heart-line' },
  { name: 'Lịch Sử', slug: 'lich-su', icon: 'ri-book-open-line' },
  { name: 'Bí Ẩn', slug: 'bi-an', icon: 'ri-question-mark' },
  { name: 'Võ Thuật', slug: 'vo-thuat', icon: 'ri-boxing-line' },
  { name: 'Thần Thoại', slug: 'than-thoai', icon: 'ri-magic-line' },
  { name: 'Học Đường', slug: 'hoc-duong', icon: 'ri-graduation-cap-line' },
  { name: 'Âm Nhạc', slug: 'am-nhac', icon: 'ri-music-line' },
  { name: 'Kinh Điển', slug: 'kinh-dien', icon: 'ri-award-line' },
  { name: 'Tài Liệu', slug: 'tai-lieu', icon: 'ri-file-text-line' },
  { name: 'Thể Thao', slug: 'the-thao', icon: 'ri-football-line' },
  { name: 'Khoa Học', slug: 'khoa-hoc', icon: 'ri-flask-line' },
  { name: 'Việt Nam', slug: 'phim-viet-nam', icon: 'ri-flag-line' },
];

export const COUNTRIES = [
  { name: 'Việt Nam', slug: 'viet-nam', flag: '🇻🇳' },
  { name: 'Hàn Quốc', slug: 'han-quoc', flag: '🇰🇷' },
  { name: 'Trung Quốc', slug: 'trung-quoc', flag: '🇨🇳' },
  { name: 'Nhật Bản', slug: 'nhat-ban', flag: '🇯🇵' },
  { name: 'Âu Mỹ', slug: 'au-my', flag: '🇺🇸' },
  { name: 'Thái Lan', slug: 'thai-lan', flag: '🇹🇭' },
  { name: 'Hồng Kông', slug: 'hong-kong', flag: '🇭🇰' },
  { name: 'Ấn Độ', slug: 'an-do', flag: '🇮🇳' },
  { name: 'Anh', slug: 'anh', flag: '🇬🇧' },
  { name: 'Đài Loan', slug: 'dai-loan', flag: '🇹🇼' },
  { name: 'Pháp', slug: 'phap', flag: '🇫🇷' },
  { name: 'Đức', slug: 'duc', flag: '🇩🇪' },
  { name: 'Tây Ban Nha', slug: 'tay-ban-nha', flag: '🇪🇸' },
  { name: 'Indonesia', slug: 'indonesia', flag: '🇮🇩' },
];

export const TYPES = [
  { name: 'Tất Cả', slug: 'phim-moi-cap-nhat', icon: 'ri-film-line' },
  { name: 'Phim Lẻ', slug: 'phim-le', icon: 'ri-movie-line' },
  { name: 'Phim Bộ', slug: 'phim-bo', icon: 'ri-tv-2-line' },
  { name: 'Hoạt Hình', slug: 'hoat-hinh', icon: 'ri-gamepad-line' },
  { name: 'Chiếu Rạp', slug: 'phim-chieu-rap', icon: 'ri-building-line' },
  { name: 'TV Shows', slug: 'tv-shows', icon: 'ri-live-line' },
];

export const SORT_OPTIONS = [
  { label: 'Mới Cập Nhật', value: 'modified.time:desc', icon: 'ri-time-line' },
  { label: 'Năm Mới Nhất', value: 'year:desc', icon: 'ri-calendar-line' },
  { label: 'Năm Cũ Nhất', value: 'year:asc', icon: 'ri-history-line' },
  { label: 'Tên A → Z', value: 'name:asc', icon: 'ri-sort-asc' },
];

const YEARS = Array.from({ length: 27 }, (_, i) => String(2026 - i));

interface FilterSidebarProps {
  selectedType: string;
  selectedGenre: string;
  selectedCountry: string;
  selectedYear: string;
  selectedSort: string;
  activeCount: number;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onTypeChange: (v: string) => void;
  onGenreChange: (v: string) => void;
  onCountryChange: (v: string) => void;
  onYearChange: (v: string) => void;
  onSortChange: (v: string) => void;
  onReset: () => void;
}

interface CollapseSectionProps {
  title: string;
  icon: string;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapseSection({ title, icon, badge, defaultOpen = true, children }: CollapseSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.05] last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 text-sm font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <i className={`${icon} text-red-400 text-sm`} />
          {title}
          {badge !== undefined && badge > 0 && (
            <span className="bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
              {badge}
            </span>
          )}
        </span>
        <i className={`ri-arrow-down-s-line text-white/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

export default function FilterSidebar({
  selectedType,
  selectedGenre,
  selectedCountry,
  selectedYear,
  selectedSort,
  activeCount,
  mobileOpen = false,
  onMobileClose,
  onTypeChange,
  onGenreChange,
  onCountryChange,
  onYearChange,
  onSortChange,
  onReset,
}: FilterSidebarProps) {
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [showAllYears, setShowAllYears] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Animation state for mobile drawer
  useEffect(() => {
    if (mobileOpen) {
      setDrawerVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const t = setTimeout(() => setDrawerVisible(false), 300);
      document.body.style.overflow = '';
      return () => clearTimeout(t);
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const visibleGenres = showAllGenres ? GENRES : GENRES.slice(0, 12);
  const visibleYears = showAllYears ? YEARS : YEARS.slice(0, 10);

  const handleReset = () => {
    onReset();
    onMobileClose?.();
  };

  const SidebarContent = (
    <div className="bg-[#0f1219] rounded-2xl border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.05] bg-white/[0.02]">
        <span className="text-sm font-bold text-white flex items-center gap-2">
          <i className="ri-equalizer-2-fill text-red-500 text-base" />
          Bộ Lọc
          {activeCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={handleReset}
              className="text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg"
            >
              <i className="ri-refresh-line" />
              Xóa lọc
            </button>
          )}
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="lg:hidden w-7 h-7 flex items-center justify-center text-white/40 hover:text-white bg-white/[0.05] rounded-lg transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-sm" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-1 max-h-[calc(100vh-140px)] overflow-y-auto">

        {/* Sort */}
        <CollapseSection title="Sắp Xếp" icon="ri-sort-desc" defaultOpen>
          <div className="grid grid-cols-2 gap-1">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onSortChange(opt.value)}
                className={`text-left text-[11px] px-2.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedSort === opt.value
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20 font-semibold'
                    : 'text-white/45 hover:text-white hover:bg-white/[0.05] border border-transparent'
                }`}
              >
                <i className={`${opt.icon} text-xs flex-shrink-0`} />
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </CollapseSection>

        {/* Type */}
        <CollapseSection title="Loại Phim" icon="ri-movie-2-line" defaultOpen>
          <div className="flex flex-col gap-1">
            {TYPES.map(t => (
              <button
                key={t.slug}
                onClick={() => onTypeChange(t.slug)}
                className={`w-full text-left text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2.5 ${
                  selectedType === t.slug
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20 font-semibold'
                    : 'text-white/45 hover:text-white hover:bg-white/[0.05] border border-transparent'
                }`}
              >
                <div className={`w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 ${selectedType === t.slug ? 'bg-red-500/20' : 'bg-white/[0.05]'}`}>
                  <i className={`${t.icon} text-xs`} />
                </div>
                {t.name}
                {selectedType === t.slug && <i className="ri-check-line text-red-500 text-xs ml-auto" />}
              </button>
            ))}
          </div>
        </CollapseSection>

        {/* Genre */}
        <CollapseSection title="Thể Loại" icon="ri-price-tag-3-line" badge={selectedGenre ? 1 : 0} defaultOpen>
          <div className="flex flex-wrap gap-1.5">
            {visibleGenres.map(g => {
              const featured = g.slug === 'bl' || g.slug === 'gl';
              return (
                <button
                  key={g.slug}
                  onClick={() => onGenreChange(selectedGenre === g.slug ? '' : g.slug)}
                  className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    selectedGenre === g.slug
                      ? featured
                        ? 'bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white font-black border border-white/30 shadow-[0_0_18px_rgba(217,70,239,0.45)]'
                        : 'bg-red-500 text-white font-semibold'
                      : featured
                        ? 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-400/35 hover:bg-fuchsia-500/25 hover:text-white shadow-[0_0_14px_rgba(217,70,239,0.18)]'
                        : 'bg-white/[0.05] text-white/45 hover:text-white hover:bg-white/[0.09] border border-white/[0.06]'
                  }`}
                >
                  <i className={`${g.icon} text-[10px]`} />
                  {g.name}
                </button>
              );
            })}
          </div>
          {GENRES.length > 12 && (
            <button
              onClick={() => setShowAllGenres(v => !v)}
              className="mt-2.5 text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              {showAllGenres ? (
                <><i className="ri-arrow-up-s-line" /> Thu gọn</>
              ) : (
                <><i className="ri-arrow-down-s-line" /> Xem thêm {GENRES.length - 12} thể loại</>
              )}
            </button>
          )}
        </CollapseSection>

        {/* Country */}
        <CollapseSection title="Quốc Gia" icon="ri-earth-line" badge={selectedCountry ? 1 : 0} defaultOpen>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => onCountryChange('')}
              className={`w-full text-left text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                !selectedCountry
                  ? 'bg-red-500/15 text-red-400 border border-red-500/20 font-semibold'
                  : 'text-white/45 hover:text-white hover:bg-white/[0.05] border border-transparent'
              }`}
            >
              <span className="text-base leading-none">🌍</span>
              Tất Cả Quốc Gia
              {!selectedCountry && <i className="ri-check-line text-red-500 text-xs ml-auto" />}
            </button>
            {COUNTRIES.map(c => (
              <button
                key={c.slug}
                onClick={() => onCountryChange(selectedCountry === c.slug ? '' : c.slug)}
                className={`w-full text-left text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                  selectedCountry === c.slug
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20 font-semibold'
                    : 'text-white/45 hover:text-white hover:bg-white/[0.05] border border-transparent'
                }`}
              >
                <span className="text-base leading-none">{c.flag}</span>
                {c.name}
                {selectedCountry === c.slug && <i className="ri-check-line text-red-500 text-xs ml-auto" />}
              </button>
            ))}
          </div>
        </CollapseSection>

        {/* Year */}
        <CollapseSection title="Năm Sản Xuất" icon="ri-calendar-line" badge={selectedYear ? 1 : 0} defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onYearChange('')}
              className={`text-[11px] px-2.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                !selectedYear
                  ? 'bg-red-500 text-white font-semibold'
                  : 'bg-white/[0.05] text-white/45 hover:text-white hover:bg-white/[0.09] border border-white/[0.06]'
              }`}
            >
              Tất Cả
            </button>
            {visibleYears.map(y => (
              <button
                key={y}
                onClick={() => onYearChange(selectedYear === y ? '' : y)}
                className={`text-[11px] px-2.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                  selectedYear === y
                    ? 'bg-red-500 text-white font-semibold'
                    : 'bg-white/[0.05] text-white/45 hover:text-white hover:bg-white/[0.09] border border-white/[0.06]'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          {YEARS.length > 10 && (
            <button
              onClick={() => setShowAllYears(v => !v)}
              className="mt-2.5 text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              {showAllYears ? (
                <><i className="ri-arrow-up-s-line" /> Thu gọn</>
              ) : (
                <><i className="ri-arrow-down-s-line" /> Xem thêm {YEARS.length - 10} năm</>
              )}
            </button>
          )}
        </CollapseSection>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: sticky sidebar */}
      <aside className="hidden lg:block w-[240px] flex-shrink-0">
        <div className="sticky top-20">
          {SidebarContent}
        </div>
      </aside>

      {/* Mobile: animated slide-in drawer with overlay */}
      {(mobileOpen || drawerVisible) && (
        <div className="lg:hidden fixed inset-0 z-[55] bg-black/70 transition-opacity duration-300">
          {/* Backdrop overlay */}
          <div
            className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={onMobileClose}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <div
            className={`absolute top-0 left-0 bottom-0 w-[min(300px,85vw)] bg-[#080a10] border-r border-white/[0.06] overflow-y-auto transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${!drawerVisible ? 'pointer-events-none' : ''}`}
          >
            <div className="p-3">
              {SidebarContent}
            </div>
            <div className="sticky bottom-0 p-3 bg-[#080a10] border-t border-white/[0.05]">
              <button
                onClick={onMobileClose}
                className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-3 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                Áp Dụng Bộ Lọc
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
