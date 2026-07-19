import { Link } from 'react-router-dom';
import { memo } from 'react';

const STATS = [
  { value: '50,000+', label: 'Bộ Phim' },
  { value: 'HD/4K', label: 'Chất Lượng' },
  { value: '100%', label: 'Miễn Phí' },
  { value: '0', label: 'Quảng Cáo' },
];

const CAT_LINKS = [
  { label: 'Phim Mới Cập Nhật', to: '/phim-moi-cap-nhat', icon: 'ri-refresh-line' },
  { label: 'Phim Mới Nhất 2026', to: '/phim-moi-nhat', icon: 'ri-fire-line' },
  { label: 'Phim Lẻ', to: '/phim-le', icon: 'ri-movie-2-line' },
  { label: 'Phim Bộ', to: '/phim-bo', icon: 'ri-tv-2-line' },
  { label: 'Phim Chiếu Rạp', to: '/phim-chieu-rap', icon: 'ri-building-4-line' },
  { label: 'Hoạt Hình', to: '/hoat-hinh', icon: 'ri-gamepad-line' },
  { label: 'TV Shows', to: '/tv-shows', icon: 'ri-broadcast-line' },
  { label: 'Phim Sắp Chiếu', to: '/phim-sap-chieu', icon: 'ri-calendar-event-line' },
  { label: 'Diễn Viên Nổi Tiếng', to: '/dien-vien', icon: 'ri-user-star-line' },
  { label: 'Tìm Kiếm Phim', to: '/search', icon: 'ri-search-line' },
  { label: 'Lọc Phim Nâng Cao', to: '/filter', icon: 'ri-equalizer-2-line' },
];

const COUNTRY_LINKS = [
  { label: 'Phim Hàn Quốc', to: '/phim-han-quoc', flag: '🇰🇷' },
  { label: 'Phim Trung Quốc', to: '/phim-trung-quoc', flag: '🇨🇳' },
  { label: 'Phim Âu Mỹ', to: '/phim-au-my', flag: '🇺🇸' },
  { label: 'Phim Nhật Bản', to: '/phim-nhat-ban', flag: '🇯🇵' },
  { label: 'Phim Thái Lan', to: '/phim-thai-lan', flag: '🇹🇭' },
  { label: 'Phim Việt Nam', to: '/phim-viet-nam', flag: '🇻🇳' },
];



const GENRE_LINKS = [
  { label: 'Hành Động', to: '/the-loai/hanh-dong', icon: 'ri-sword-line' },
  { label: 'Tình Cảm', to: '/the-loai/tinh-cam', icon: 'ri-heart-3-line' },
  { label: 'Hài Hước', to: '/the-loai/hai-huoc', icon: 'ri-emotion-laugh-line' },
  { label: 'Kinh Dị', to: '/the-loai/kinh-di', icon: 'ri-ghost-2-line' },
  { label: 'Cổ Trang', to: '/the-loai/co-trang', icon: 'ri-ancient-pavilion-line' },
  { label: 'Viễn Tưởng', to: '/the-loai/vien-tuong', icon: 'ri-rocket-2-line' },
  { label: 'Hình Sự', to: '/the-loai/hinh-su', icon: 'ri-search-eye-line' },
  { label: 'Tâm Lý', to: '/the-loai/tam-ly', icon: 'ri-brain-line' },
  { label: 'Phiêu Lưu', to: '/the-loai/phieu-luu', icon: 'ri-compass-line' },
  { label: 'Gia Đình', to: '/the-loai/gia-dinh', icon: 'ri-home-heart-line' },
  { label: 'Âm Nhạc', to: '/the-loai/am-nhac', icon: 'ri-music-2-line' },
  { label: 'Thể Thao', to: '/the-loai/the-thao', icon: 'ri-trophy-line' },
];

const SEO_LANDING_LINKS = [
  { label: 'Xem Phim', to: '/xem-phim', icon: 'ri-movie-line' },
  { label: 'Xem Phim Online', to: '/xem-phim-online', icon: 'ri-play-circle-line' },
  { label: 'Xem Phim Mới', to: '/xem-phim-moi', icon: 'ri-flashlight-line' },
  { label: 'Xem Phim Chiếu Rạp', to: '/xem-phim-chieu-rap', icon: 'ri-movie-2-line' },
  { label: 'Xem Phim Việt Nam', to: '/xem-phim-viet-nam', icon: 'ri-flag-line' },
  { label: 'Xem Anime Vietsub', to: '/xem-anime-vietsub', icon: 'ri-gamepad-line' },
  { label: 'Phim Hay', to: '/phim-hay', icon: 'ri-star-line' },
  { label: 'Phim 2026', to: '/phim-2026', icon: 'ri-calendar-line' },
  { label: 'Phim 2025', to: '/phim-2025', icon: 'ri-calendar-line' },
  { label: 'Phim 2024', to: '/phim-2024', icon: 'ri-calendar-line' },
  { label: 'Phim 4K', to: '/phim-4k', icon: 'ri-4k-line' },
  { label: 'Phim Full HD', to: '/phim-full-hd', icon: 'ri-hd-line' },
  { label: 'Phim Vietsub', to: '/phim-vietsub', icon: 'ri-file-text-line' },
  { label: 'Phim Thuyet Minh', to: '/phim-thuyet-minh', icon: 'ri-chat-voice-line' },
  { label: 'Phim Long Tieng', to: '/phim-long-tieng', icon: 'ri-volume-up-line' },
  { label: 'Phim Hoan Tat', to: '/phim-hoan-tat', icon: 'ri-checkbox-circle-line' },
  { label: 'Phim Dang Chieu', to: '/phim-dang-chieu', icon: 'ri-live-line' },
  { label: 'Phim Trailer', to: '/phim-trailer', icon: 'ri-time-line' },
];

const SOCIAL_LINKS = [
  { href: 'https://m.me/j/AbY6361ilp6YeUsu/?send_source=gc:copy_invite_link_c', icon: 'ri-messenger-fill', label: 'Messenger', color: 'hover:bg-[#00B2FF]/15 hover:text-[#00B2FF] hover:border-[#00B2FF]/30' },
  { href: 'https://www.tiktok.com/@khophim.org?_r=1&_t=ZS-979Na9uVNWE', icon: 'ri-tiktok-fill', label: 'TikTok', color: 'hover:bg-white/10 hover:text-white hover:border-white/25' },
  { href: 'https://t.me/davisjohn_1', icon: 'ri-telegram-fill', label: 'Telegram', color: 'hover:bg-[#29A8E8]/15 hover:text-[#29A8E8] hover:border-[#29A8E8]/30' },
];


function Footer() {
  return (
    <footer className="mt-20 relative overflow-hidden bg-[#08090e]">
      {/* Top gradient border — cinematic */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
      
      {/* Ambient glow behind stats */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-gradient-radial from-red-500/5 via-transparent to-transparent pointer-events-none" />

      {/* Stats strip */}
      <div className="border-b border-white/[0.04]">
        <div className="mx-auto max-w-[1760px] px-6 py-5 lg:px-8 2xl:px-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center gap-1 text-center group">
                <span className="text-xl md:text-2xl font-black text-white tracking-tight group-hover:text-red-300 transition-colors duration-300">
                  {value}
                </span>
                <span className="text-[11px] text-white/55 font-medium uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-[1760px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8 2xl:px-10">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8 xl:grid-cols-[1.25fr_0.8fr_0.8fr_1fr] 2xl:gap-12">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4 sm:mb-5">
              <div className="relative w-9 h-9 flex items-center justify-center">
                <div className="absolute inset-0 bg-red-500/15 rounded-xl blur-sm" />
                <img src="/brand/khophim-logo-v2.png"
                  alt="KhoPhim" width="36" height="36" className="relative w-full h-full object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-lg sm:text-xl tracking-tight">
                  <span className="text-white">Kho</span><span className="text-red-500">Phim</span>
                </span>
                <span className="text-[9px] text-white/55 font-medium tracking-[0.15em] uppercase">Cinematic Experience</span>
              </div>
            </div>
            <p className="text-white/60 text-sm leading-relaxed mb-2">
              <span className="text-white/60 font-medium">KhoPhim</span> — kho phim online miễn phí lớn nhất Việt Nam.
            </p>
            <p className="text-white/55 text-xs leading-relaxed mb-4 sm:mb-5">
              Truy cập <a href="https://khophim.org" className="text-red-300 underline decoration-red-300/60 underline-offset-2 hover:text-red-300 transition-colors">khophim.org</a> để xem hơn 50,000 bộ phim vietsub HD, Full HD không quảng cáo, cập nhật hàng ngày.
            </p>

            {/* Quick search box */}
            <Link to="/search"
              className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 mb-4 sm:mb-5 hover:border-red-500/30 hover:bg-white/[0.07] transition-all group cursor-pointer active:scale-[0.98]">
              <i className="ri-search-line text-sm text-white/55 group-hover:text-red-300 transition-colors" />
              <span className="text-[13px] text-white/55 group-hover:text-white/80 transition-colors">Tìm kiếm phim...</span>
            </Link>

            {/* Social */}
            <div className="flex items-center gap-2">
              {SOCIAL_LINKS.map(({ href, icon, label, color }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer nofollow"
                  title={label}
                  className={`w-9 h-9 flex items-center justify-center bg-white/[0.04] text-white/60 border border-white/[0.06] rounded-xl transition-all cursor-pointer active:scale-90 active:opacity-70 ${color}`}>
                  <i className={`${icon} text-sm`} />
                  <span className="sr-only">{label}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Danh Mục */}
          <div>
            <div className="text-white font-bold text-sm mb-3 sm:mb-5 flex items-center gap-2">
              <span className="w-1 h-4 bg-red-500 rounded-full inline-block" />
              Danh Mục
            </div>
            <ul className="space-y-1.5 sm:space-y-2.5">
              {CAT_LINKS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}
                    className="text-[12px] sm:text-[13px] text-white/60 hover:text-red-300 active:text-red-300 transition-colors flex items-center gap-2 group active:scale-[0.98]">
                    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      <i className={`${item.icon} text-[10px] sm:text-xs text-white/45 group-hover:text-red-300 transition-colors`} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quốc Gia */}
          <div>
            <div className="text-white font-bold text-sm mb-3 sm:mb-5 flex items-center gap-2">
              <span className="w-1 h-4 bg-red-500 rounded-full inline-block" />
              Quốc Gia
            </div>
            <ul className="space-y-1.5 sm:space-y-2.5">
              {COUNTRY_LINKS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}
                    className="text-[12px] sm:text-[13px] text-white/60 hover:text-red-300 active:text-red-300 transition-colors flex items-center gap-2.5 group active:scale-[0.98]">
                    <span className="text-sm sm:text-base leading-none">{item.flag}</span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Thể Loại */}
          <div>
            <div className="text-white font-bold text-sm mb-3 sm:mb-5 flex items-center gap-2">
              <span className="w-1 h-4 bg-red-500 rounded-full inline-block" />
              Thể Loại
            </div>
            <ul className="space-y-1.5 sm:space-y-2.5 mb-4 sm:mb-6">
              {GENRE_LINKS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}
                    className="text-[12px] sm:text-[13px] text-white/60 hover:text-red-300 active:text-red-300 transition-colors flex items-center gap-2 group active:scale-[0.98]">
                    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      <i className={`${item.icon} text-[10px] sm:text-xs text-white/45 group-hover:text-red-300 transition-colors`} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* SEO Landing Links */}
            <div className="text-white font-bold text-sm mb-3 sm:mb-4 flex items-center gap-2 mt-4 sm:mt-8">
              <span className="w-1 h-4 bg-amber-500 rounded-full inline-block" />
              Tìm Phim Theo
            </div>
            <ul className="space-y-1.5 sm:space-y-2.5 mb-4 sm:mb-6">
              {SEO_LANDING_LINKS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}
                    className="text-[12px] sm:text-[13px] text-white/60 hover:text-amber-300 active:text-amber-300 transition-colors flex items-center gap-2 group active:scale-[0.98]">
                    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      <i className={`${item.icon} text-[10px] sm:text-xs text-white/45 group-hover:text-amber-300 transition-colors`} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Disclaimer */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 sm:p-3">
              <p className="text-[10px] sm:text-[11px] text-white/55 leading-relaxed">
                Nội dung được tổng hợp từ các nguồn công khai. Chúng tôi không lưu trữ bất kỳ tệp bản quyền nào trên máy chủ.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto flex max-w-[1760px] flex-col items-center justify-between gap-3 px-6 py-4 sm:flex-row lg:px-8 2xl:px-10">
          <p className="text-[12px] text-white/55 font-medium">
            © 2026 <span className="text-white/60">KhoPhim</span> · Tất cả quyền được bảo lưu.
          </p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
              </span>
              <span className="text-[11px] text-white/55">Hệ thống hoạt động bình thường</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-white/45">
              <Link to="/about" className="hover:text-white/80 transition-colors">Giới Thiệu</Link>
              <a href="/press/" className="hover:text-white/80 transition-colors">Báo Chí & Thương Hiệu</a>
              <span>·</span>
              <Link to="/policy" className="hover:text-white/80 transition-colors">Chính Sách</Link>
              <span>·</span>
              <Link to="/policy" className="hover:text-white/80 transition-colors">Điều Khoản</Link>
              <span>·</span>
              <Link to="/policy#dmca" className="hover:text-white/80 transition-colors">DMCA</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default memo(Footer);
