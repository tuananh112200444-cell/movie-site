import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { prefetchRoute } from '../../utils/prefetchRoute';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import StickyBanner from './StickyBanner';
import SearchSuggestions from './SearchSuggestions';

const GENRES = [
  { name: 'Hành Động', slug: 'hanh-dong', icon: 'ri-sword-line' },
  { name: 'Tình Cảm', slug: 'tinh-cam', icon: 'ri-heart-3-line' },
  { name: 'Hài Hước', slug: 'hai-huoc', icon: 'ri-emotion-laugh-line' },
  { name: 'Cổ Trang', slug: 'co-trang', icon: 'ri-ancient-pavilion-line' },
  { name: 'Tâm Lý', slug: 'tam-ly', icon: 'ri-brain-line' },
  { name: 'Kinh Dị', slug: 'kinh-di', icon: 'ri-ghost-2-line' },
  { name: 'Viễn Tưởng', slug: 'vien-tuong', icon: 'ri-rocket-2-line' },
  { name: 'Phiêu Lưu', slug: 'phieu-luu', icon: 'ri-compass-3-line' },
  { name: 'Chiến Tranh', slug: 'chien-tranh', icon: 'ri-shield-star-line' },
  { name: 'Hình Sự', slug: 'hinh-su', icon: 'ri-search-eye-line' },
  { name: 'Hoạt Hình', slug: 'hoat-hinh', icon: 'ri-gamepad-line' },
  { name: 'Gia Đình', slug: 'gia-dinh', icon: 'ri-home-heart-line' },
  { name: 'Anime', slug: 'anime', icon: 'ri-sparkling-line' },
  { name: 'Mỹ Nam', slug: 'my-nam', icon: 'ri-heart-2-line' },
  { name: 'Việt Nam', slug: 'phim-viet-nam', icon: 'ri-flag-line' },
];

// Genre URL helper: dùng /the-loai/ thay vì /filter?genre= để SEO tốt hơn
// Anime có trang riêng đặc biệt /anime
const genreUrl = (slug: string) => {
  if (slug === 'anime') return '/anime';
  if (slug === 'my-nam') return '/my-nam';
  if (slug === 'kinh-di') return '/phim-ma';
  if (slug === 'phim-viet-nam') return '/phim-viet-nam';
  return `/the-loai/${slug}`;
};

const COUNTRIES = [
  { name: 'Việt Nam', slug: 'viet-nam', to: '/phim-viet-nam', flag: '🇻🇳' },
  { name: 'Hàn Quốc', slug: 'han-quoc', to: '/phim-han-quoc', flag: '🇰🇷' },
  { name: 'Trung Quốc', slug: 'trung-quoc', to: '/phim-trung-quoc', flag: '🇨🇳' },
  { name: 'Nhật Bản', slug: 'nhat-ban', to: '/phim-nhat-ban', flag: '🇯🇵' },
  { name: 'Âu Mỹ', slug: 'au-my', to: '/phim-au-my', flag: '🇺🇸' },
  { name: 'Thái Lan', slug: 'thai-lan', to: '/phim-thai-lan', flag: '🇹🇭' },
  { name: 'Hồng Kông', slug: 'hong-kong', to: '/filter?country=hong-kong', flag: '🇭🇰' },
  { name: 'Đài Loan', slug: 'dai-loan', to: '/filter?country=dai-loan', flag: '🇹🇼' },
  { name: 'Ấn Độ', slug: 'an-do', to: '/filter?country=an-do', flag: '🇮🇳' },
  { name: 'Anh', slug: 'anh', to: '/filter?country=anh', flag: '🇬🇧' },
];

const NAV_LINKS = [
  { label: 'Trang Chủ', to: '/' },
  { label: 'Phim Mới', to: '/phim-moi-nhat' },
  { label: 'Phim Lẻ', to: '/phim-le' },
  { label: 'Phim Bộ', to: '/phim-bo' },
  { label: 'Chiếu Rạp', to: '/phim-chieu-rap' },
];
const SOCIAL_LINKS = [
  { href: 'https://www.facebook.com/', icon: 'ri-facebook-circle-fill', desktopColor: 'text-[#4799ff] border-[#1877F2]/35 bg-[#1877F2]/15 shadow-[0_0_16px_rgba(24,119,242,0.22)] hover:bg-[#1877F2]/28 hover:border-[#4799ff]/65 hover:shadow-[0_0_22px_rgba(24,119,242,0.42)]', mobileColor: 'text-[#1877F2]', title: 'Facebook KhoPhim' },
  { href: 'https://m.me/j/AbY6361ilp6YeUsu/?send_source=gc:copy_invite_link_c', icon: 'ri-messenger-fill', desktopColor: 'text-[#35c8ff] border-[#00B2FF]/35 bg-[#00B2FF]/15 shadow-[0_0_16px_rgba(0,178,255,0.22)] hover:bg-[#00B2FF]/28 hover:border-[#56d3ff]/65 hover:shadow-[0_0_22px_rgba(0,178,255,0.42)]', mobileColor: 'text-[#00B2FF]', title: 'Messenger KhoPhim' },
  { href: 'https://www.tiktok.com/@khophim.org?_r=1&_t=ZS-979Na9uVNWE', icon: 'ri-tiktok-fill', desktopColor: 'text-white border-[#25F4EE]/30 bg-gradient-to-br from-[#25F4EE]/15 via-white/[0.08] to-[#FE2C55]/15 shadow-[4px_0_16px_rgba(254,44,85,0.18),-4px_0_16px_rgba(37,244,238,0.18)] hover:border-[#FE2C55]/55 hover:from-[#25F4EE]/25 hover:to-[#FE2C55]/25 hover:shadow-[5px_0_22px_rgba(254,44,85,0.32),-5px_0_22px_rgba(37,244,238,0.32)]', mobileColor: 'text-white', title: 'TikTok KhoPhim' },
  { href: 'https://t.me/davisjohn_1', icon: 'ri-telegram-fill', desktopColor: 'text-[#54c8ff] border-[#29A8E8]/35 bg-[#29A8E8]/15 shadow-[0_0_16px_rgba(41,168,232,0.22)] hover:bg-[#29A8E8]/28 hover:border-[#69d0ff]/65 hover:shadow-[0_0_22px_rgba(41,168,232,0.42)]', mobileColor: 'text-[#29A8E8]', title: 'Telegram KhoPhim' },
];
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [mobileGenreOpen, setMobileGenreOpen] = useState(false);
  const [mobileCountryOpen, setMobileCountryOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const desktopSearchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const rafRef = useRef<number | null>(null);
  const lastScrolledRef = useRef(false);
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;

    const updateHeaderHeight = () => {
      const height = Math.ceil(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--kp-header-height', `${height}px`);
    };

    updateHeaderHeight();

    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
      document.documentElement.style.removeProperty('--kp-header-height');
    };
  }, []);

  const openDropdown = (name: string) => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    setActiveDropdown(name);
  };

  const closeDropdown = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    dropdownTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
      dropdownTimeoutRef.current = null;
    }, 150);
  };

  const cancelCloseDropdown = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
  };

  // Mobile menu animation
  useEffect(() => {
    if (mobileMenuOpen) {
      setMobileMenuVisible(true);
    } else {
      const t = setTimeout(() => setMobileMenuVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [mobileMenuOpen]);

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        const current = window.scrollY > 20;
        if (current !== lastScrolledRef.current) {
          lastScrolledRef.current = current;
          setScrolled(current);
        }
        rafRef.current = null;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => {
        desktopSearchRef.current?.focus();
        mobileSearchRef.current?.focus();
      }, 100);
    }
  }, [searchOpen]);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  const { bind: menuSwipeBind } = useSwipeGesture({
    threshold: 50,
    verticalThreshold: 60,
    maxDuration: 400,
    onSwipeLeft: () => {
      if (mobileMenuOpen) setMobileMenuOpen(false);
    },
  });

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to);

  // theme is always dark now
  const theme = 'dark';

  return (
    <>
      {/* Mobile Menu Overlay */}
      {(mobileMenuOpen || mobileMenuVisible) && (
        <div
          className={`fixed inset-0 z-[55] lg:hidden transition-opacity duration-300 ${mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setMobileMenuOpen(false)}
          onTouchStart={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}

      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-[#07080d]/95 border-b border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl'
            : 'bg-gradient-to-b from-black/80 via-black/45 to-transparent'
        }`}
      >
        {scrolled && (
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
        )}

        <div className="mx-auto flex h-14 max-w-[1760px] items-center justify-between gap-3 px-4 lg:h-16 lg:px-8 2xl:px-10">

          {/* ── Logo ── */}
          <Link to="/" className="flex min-h-11 items-center gap-3 flex-shrink-0 group touch-manipulation">
            <div className="relative w-8 h-8 lg:w-9 lg:h-9 flex items-center justify-center flex-shrink-0">
              {/* Glow halo */}
              <div className="absolute inset-0 bg-red-500/40 rounded-xl blur-md group-hover:bg-red-500/60 transition-all duration-300 scale-110" />
              {/* Icon container */}
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/30 to-red-700/20 rounded-xl ring-1 ring-red-500/50 group-hover:ring-red-400/80 group-hover:from-red-500/45 group-hover:to-red-700/35 transition-all duration-300" />
              <img
                src="/brand/khophim-favicon-v2-96.png"
                alt="KhoPhim"
                className="relative w-5 h-5 lg:w-6 lg:h-6 object-contain drop-shadow-lg"
              />
            </div>
            <div className="hidden min-[390px]:flex flex-col leading-none gap-0.5">
              <span className="font-black text-lg lg:text-xl tracking-tight leading-none">
                <span className="text-white drop-shadow-sm">Kho</span>
                <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">Phim</span>
              </span>
              <span className="hidden min-[480px]:block text-[9px] text-white/45 font-semibold tracking-[0.18em] uppercase">Xem phim miễn phí</span>
            </div>
          </Link>

          {/* ── Desktop Nav ── */}
          <nav className="hidden lg:flex items-center gap-1 rounded-2xl border border-white/[0.07] bg-black/25 px-1.5 py-1 backdrop-blur-md">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onMouseEnter={() => prefetchRoute(link.to)}
                onFocus={() => prefetchRoute(link.to)}
                className={`relative rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all duration-200 whitespace-nowrap group ${
                  isActive(link.to) ? 'text-white bg-white/[0.08]' : 'text-white/62 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {link.label}
                <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-[2px] rounded-full bg-red-500 transition-all duration-300 ${isActive(link.to) ? 'w-4' : 'w-0 group-hover:w-4'}`} />
              </Link>
            ))}

            {/* Thể Loại dropdown */}
            <div
              className="relative z-[70]"
              onMouseEnter={() => openDropdown('genre')}
              onMouseLeave={closeDropdown}
            >
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'genre' ? null : 'genre')}
                className={`relative rounded-xl px-3.5 py-2 text-[13px] font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-all duration-200 group ${
                activeDropdown === 'genre' ? 'text-white bg-white/[0.08]' : 'text-white/62 hover:text-white hover:bg-white/[0.06]'
              }`}>
                Thể Loại
                <i className={`ri-arrow-down-s-line text-xs transition-transform duration-200 ${activeDropdown === 'genre' ? 'rotate-180' : ''}`} />
                <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] bg-red-500 rounded-full transition-all duration-300 ${activeDropdown === 'genre' ? 'w-4' : 'w-0 group-hover:w-4'}`} />
              </button>
              {activeDropdown === 'genre' && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-72 z-[80]"
                  onMouseEnter={cancelCloseDropdown}
                  onMouseLeave={closeDropdown}
                >
                  {/* bridge vô hình lấp khoảng trống giữa button và panel */}
                  <div className="absolute top-0 left-0 right-0 h-2" />
                  <div className="grid grid-cols-2 gap-0.5 rounded-2xl border border-white/[0.12] p-3"
                    style={{ backgroundColor: '#0d0f1a', boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)' }}>
                    <div className="col-span-2 px-2 pb-2 mb-1 border-b border-white/[0.06]">
                      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Thể Loại Phim</p>
                    </div>
                    {GENRES.map((g) => {
                      const featured = g.slug === 'bl' || g.slug === 'gl';
                      return (
                        <Link
                          key={g.slug}
                          to={genreUrl(g.slug)}
                          className={`flex items-center gap-2 px-3 py-2 text-[12px] rounded-xl transition-all whitespace-nowrap group/item ${
                            featured
                              ? 'text-fuchsia-200 bg-fuchsia-500/10 border border-fuchsia-400/25 hover:bg-fuchsia-500/20 hover:text-white shadow-[0_0_14px_rgba(217,70,239,0.16)]'
                              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                            <i className={`${g.icon} ${featured ? 'text-fuchsia-300' : 'text-red-400/70 group-hover/item:text-red-400'} text-sm`} />
                          </span>
                          {g.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quốc Gia dropdown */}
            <div
              className="relative z-[70]"
              onMouseEnter={() => openDropdown('country')}
              onMouseLeave={closeDropdown}
            >
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'country' ? null : 'country')}
                className={`relative rounded-xl px-3.5 py-2 text-[13px] font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-all duration-200 group ${
                activeDropdown === 'country' ? 'text-white bg-white/[0.08]' : 'text-white/62 hover:text-white hover:bg-white/[0.06]'
              }`}>
                Quốc Gia
                <i className={`ri-arrow-down-s-line text-xs transition-transform duration-200 ${activeDropdown === 'country' ? 'rotate-180' : ''}`} />
                <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] bg-red-500 rounded-full transition-all duration-300 ${activeDropdown === 'country' ? 'w-4' : 'w-0 group-hover:w-4'}`} />
              </button>
              {activeDropdown === 'country' && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-56 z-[80]"
                  onMouseEnter={cancelCloseDropdown}
                  onMouseLeave={closeDropdown}
                >
                  <div className="absolute top-0 left-0 right-0 h-2" />
                  <div className="grid grid-cols-2 gap-0.5 rounded-2xl border border-white/[0.12] p-3"
                    style={{ backgroundColor: '#0d0f1a', boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)' }}>
                    <div className="col-span-2 px-2 pb-2 mb-1 border-b border-white/[0.06]">
                      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Phim Theo Quốc Gia</p>
                    </div>
                    {COUNTRIES.map((c) => (
                      <Link
                        key={c.slug}
                        to={c.to}
                        onMouseEnter={() => prefetchRoute(c.to)}
                        className="flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] rounded-xl transition-all whitespace-nowrap"
                      >
                        <span className="text-base leading-none">{c.flag}</span>
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </nav>

          {/* ── Right Actions ── */}
          <div className="flex items-center gap-1">
            {/* Social links */}
            <div className="hidden lg:flex items-center gap-0.5 mr-1">
              {SOCIAL_LINKS.map(({ href, icon, desktopColor, title }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer nofollow" title={title} aria-label={title}
                  className={`w-8 h-8 flex items-center justify-center border ${desktopColor} transition-all duration-200 cursor-pointer rounded-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}>
                  <i className={`${icon} text-base drop-shadow-[0_0_5px_currentColor]`} aria-hidden="true" />
                  <span className="sr-only">{title}</span>
                </a>
              ))}
              <div className="w-px h-4 bg-white/[0.08] mx-1" />
            </div>

            <div className="hidden min-[640px]:flex lg:hidden items-center gap-0.5">
              {SOCIAL_LINKS.map(({ href, icon, title, mobileColor }) => {
                return (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={title}
                  aria-label={title}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04] ${mobileColor} active:scale-95`}
                >
                  <i className={`${icon} text-base`} aria-hidden="true" />
                  <span className="sr-only">{title}</span>
                </a>
              );})}
            </div>

            

            {/* Theme toggle */}
            {/* Light theme disabled - keeping dark mode only */}
            
            {/* Yêu Thích */}
            <Link
              to="/yeu-thich"
              className={`hidden lg:flex w-9 h-9 items-center justify-center rounded-xl transition-all cursor-pointer border ${
                isActive('/yeu-thich')
                  ? 'text-red-400 border-red-500/30 bg-red-500/10'
                  : 'text-white/45 border-white/[0.08] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5'
              }`}
              title="Yêu Thích"
            >
              {isActive('/yeu-thich') ? <i className="ri-heart-fill text-sm" /> : <i className="ri-heart-line text-sm" />}
            </Link>

            {/* Desktop Search — always-visible pill bar */}
            <div className="hidden lg:flex items-center">
              <form onSubmit={handleSearch} className="flex items-center">
                <div ref={desktopSearchContainerRef} className="relative">
                  {searchOpen ? (
                    <>
                      <i className="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-red-400 text-sm pointer-events-none" aria-hidden="true" />
                      <input
                        ref={desktopSearchRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm kiếm phim, diễn viên..."
                        aria-label="Tìm kiếm phim"
                        className="bg-white/[0.08] border border-red-500/40 text-white placeholder-white/35 text-sm rounded-full pl-9 pr-9 py-2 w-64 focus:outline-none focus:border-red-500/70 focus:bg-white/[0.10] transition-all"
                      />
                      <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                        aria-label="Đóng tìm kiếm"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-white/35 hover:text-white transition-colors cursor-pointer">
                        <i className="ri-close-line text-sm" aria-hidden="true" />
                      </button>
                      <SearchSuggestions query={searchQuery} onSelect={() => { setSearchOpen(false); setSearchQuery(''); }} className="w-80" />
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      className="flex items-center gap-2.5 bg-white/[0.10] hover:bg-white/[0.15] border border-white/25 hover:border-red-500/60 text-white/75 hover:text-white text-sm rounded-full pl-3.5 pr-4 py-2 w-56 transition-all cursor-pointer group"
                    >
                      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 bg-red-500/20 rounded-full group-hover:bg-red-500/35 transition-colors">
                        <i className="ri-search-line text-[11px] text-red-400 group-hover:text-red-300" aria-hidden="true" />
                      </span>
                      <span className="text-[13px] whitespace-nowrap font-medium">Tìm kiếm phim...</span>
                      <span className="ml-auto flex items-center gap-0.5">
                        <kbd className="text-[9px] bg-white/15 border border-white/20 rounded px-1 py-0.5 font-mono leading-none text-white/60">⌘K</kbd>
                      </span>
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Mobile search */}
            <button onClick={() => {
              if (mobileMenuOpen) setMobileMenuOpen(false);
              setSearchOpen(!searchOpen);
            }}
              aria-label={searchOpen ? 'Đóng tìm kiếm' : 'Mở tìm kiếm'}
              className={`lg:hidden relative z-[70] h-11 min-w-11 px-3 flex items-center justify-center gap-1.5 rounded-full border transition-all cursor-pointer active:scale-95 touch-manipulation ${
                searchOpen
                  ? 'bg-white/[0.08] border-white/15 text-white shadow-none'
                  : 'bg-red-700 text-white border-red-500/70 shadow-[0_0_18px_rgba(185,28,28,0.45)]'
              }`}>
              {!searchOpen && (
                <span className="absolute inset-0 rounded-full bg-red-800/20 animate-ping opacity-50" aria-hidden="true" />
              )}
              <span className="relative flex items-center justify-center gap-1.5">
                <i className={`${searchOpen ? 'ri-close-line' : 'ri-search-line'} text-lg`} aria-hidden="true" />
                {!searchOpen && <span className="hidden min-[390px]:inline text-xs font-black">Tìm</span>}
              </span>
            </button>

            {/* Mobile menu */}
            <button onClick={() => {
              if (searchOpen) { setSearchOpen(false); setSearchQuery(''); }
              setMobileMenuOpen(!mobileMenuOpen);
            }}
              aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu điều hướng'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-drawer"
              className="relative z-[70] flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.06] text-white/85 shadow-lg shadow-black/20 transition-colors cursor-pointer lg:hidden hover:bg-white/[0.10] hover:text-white active:scale-95 touch-manipulation">
              <i className={`${mobileMenuOpen ? 'ri-close-line' : 'ri-menu-3-line'} text-[22px]`} aria-hidden="true" />
            </button>
          </div>
        </div>

        <StickyBanner />
        
        {/* Mobile Search Overlay */}
        {searchOpen && (
          <>
            {/* Backdrop */}
            <div
              className="lg:hidden fixed inset-0 z-[55] bg-black/70 transition-opacity duration-300"
              onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
              aria-hidden="true"
            />
            {/* Search panel */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-[60] bg-[#0a0c14] border-b border-white/[0.08] shadow-2xl"
              style={{
                animation: 'slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              <div className="px-4 pt-3 pb-4">
                {/* Header with title + close */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-bold text-sm flex items-center gap-2">
                    <i className="ri-search-line text-red-400" />
                    Tìm kiếm
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                    aria-label="Đóng tìm kiếm"
                    className="flex h-11 w-11 items-center justify-center text-white/50 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer touch-manipulation"
                  >
                    <i className="ri-close-line text-lg" />
                  </button>
                </div>

                <form onSubmit={handleSearch} className="flex items-center gap-2" role="search">
                  <div ref={mobileSearchContainerRef} className="flex-1 relative">
                    <i className="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-red-400 text-sm pointer-events-none" aria-hidden="true" />
                    <input
                      ref={mobileSearchRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Nhập tên phim, diễn viên..."
                      aria-label="Tìm kiếm phim, diễn viên"
                      style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                      className="w-full bg-white/[0.08] border border-white/[0.15] placeholder-white/30 text-sm rounded-xl pl-10 pr-10 py-3 focus:outline-none focus:border-red-500/60 focus:bg-white/[0.12] transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Xóa tìm kiếm"
                        className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-white/50 hover:text-white rounded-full hover:bg-white/[0.08] transition-colors cursor-pointer touch-manipulation"
                      >
                        <i className="ri-close-line text-sm" />
                      </button>
                    )}
                    <SearchSuggestions query={searchQuery} onSelect={() => { setSearchOpen(false); setSearchQuery(''); }} />
                  </div>
                  <button type="submit"
                    aria-label="Thực hiện tìm kiếm"
                    className="flex-shrink-0 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-bold px-5 py-3 rounded-xl transition-colors cursor-pointer whitespace-nowrap shadow-lg shadow-red-500/20">
                    Tìm
                  </button>
                </form>

                {/* Quick tags */}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Phổ biến:</span>
                  {['Avengers', 'Squid Game', 'One Piece', 'Hài Hước', 'Kinh Dị'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setSearchQuery(tag);
                        navigate(`/search?q=${encodeURIComponent(tag)}`);
                        setSearchOpen(false);
                      }}
                      className="min-h-11 text-[11px] bg-white/[0.05] hover:bg-red-500/15 text-white/40 hover:text-red-400 border border-white/[0.08] hover:border-red-500/25 px-3 rounded-full transition-all cursor-pointer whitespace-nowrap touch-manipulation"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </header>

      {/* Mobile Menu — Slide-in Drawer */}
      <div
        {...menuSwipeBind()}
        id="mobile-navigation-drawer"
        role="dialog"
        aria-label="Menu điều hướng"
        aria-hidden={!mobileMenuOpen}
        inert={!mobileMenuOpen}
        className={`lg:hidden fixed top-0 right-0 bottom-0 z-[60] w-[min(320px,85vw)] md:w-[min(360px,75vw)] bg-[#0a0c14] border-l border-white/[0.06] transition-transform duration-300 ease-out ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'} ${!mobileMenuVisible ? 'pointer-events-none' : ''}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-white font-bold text-sm flex items-center gap-2">
            <i className="ri-menu-3-line text-red-400" />
            Menu
          </span>
          <button
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Đóng menu"
            className="flex h-11 w-11 items-center justify-center text-white/50 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer active:scale-95 touch-manipulation"
          >
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        <div className="px-3 py-3 overflow-y-auto h-[calc(100%-56px)]">
          <div className="grid grid-cols-2 gap-1 mb-3">
            {[
              { label: 'Trang Chủ', to: '/', icon: 'ri-home-4-line' },
              { label: 'Phim Mới', to: '/phim-moi-nhat', icon: 'ri-refresh-line' },
              { label: 'Phim Lẻ', to: '/phim-le', icon: 'ri-movie-2-line' },
              { label: 'Phim Bộ', to: '/phim-bo', icon: 'ri-tv-2-line' },
              { label: 'Chiếu Rạp', to: '/phim-chieu-rap', icon: 'ri-building-line' },
              { label: 'Lọc Phim', to: '/filter', icon: 'ri-equalizer-2-line' },
              { label: 'Yêu Thích', to: '/yeu-thich', icon: 'ri-heart-line' },
            ].map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)}
                className={`flex min-h-11 items-center gap-2.5 px-3 py-2.5 text-sm rounded-xl transition-all touch-manipulation ${
                  isActive(item.to)
                    ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.06] border border-transparent'
                }`}>
                <i className={`${item.icon} text-sm w-4 text-center`} />
                {item.label}
              </Link>
            ))}
          </div>

          {/* Mobile Thể Loại */}
          <div className="mb-2">
            <button
              onClick={() => setMobileGenreOpen(!mobileGenreOpen)}
              className="flex min-h-11 w-full items-center justify-between px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] border border-transparent rounded-xl transition-all cursor-pointer touch-manipulation"
            >
              <span className="flex items-center gap-2.5">
                <i className="ri-film-line text-sm w-4 text-center" />
                Thể Loại
              </span>
              <i className={`ri-arrow-down-s-line text-sm transition-transform duration-200 ${mobileGenreOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobileGenreOpen && (
              <div className="mt-1 grid grid-cols-2 gap-0.5 pl-2">
                {GENRES.map((g) => {
                  const featured = g.slug === 'bl' || g.slug === 'gl';
                  return (
                    <Link
                      key={g.slug}
                      to={genreUrl(g.slug)}
                      onClick={() => { setMobileMenuOpen(false); setMobileGenreOpen(false); }}
                      className={`flex min-h-11 items-center gap-2 px-3 py-2 text-[12px] rounded-xl transition-all touch-manipulation ${
                        featured
                          ? 'text-fuchsia-200 bg-fuchsia-500/10 border border-fuchsia-400/25'
                          : 'text-white/55 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <i className={`${g.icon} ${featured ? 'text-fuchsia-300' : 'text-red-400/70'} text-sm w-4 text-center`} />
                      {g.name}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobile Quốc Gia */}
          <div className="mb-2">
            <button
              onClick={() => setMobileCountryOpen(!mobileCountryOpen)}
              className="flex min-h-11 w-full items-center justify-between px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] border border-transparent rounded-xl transition-all cursor-pointer touch-manipulation"
            >
              <span className="flex items-center gap-2.5">
                <i className="ri-global-line text-sm w-4 text-center" />
                Quốc Gia
              </span>
              <i className={`ri-arrow-down-s-line text-sm transition-transform duration-200 ${mobileCountryOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobileCountryOpen && (
              <div className="mt-1 grid grid-cols-2 gap-0.5 pl-2">
                {COUNTRIES.map((c) => (
                  <Link
                    key={c.slug}
                    to={c.to}
                    onClick={() => { setMobileMenuOpen(false); setMobileCountryOpen(false); }}
                    className="flex min-h-11 items-center gap-2 px-3 py-2 text-[12px] text-white/55 hover:text-white hover:bg-white/[0.06] rounded-xl transition-all touch-manipulation"
                  >
                    <span className="text-base leading-none">{c.flag}</span>
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
