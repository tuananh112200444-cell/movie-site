import { Link } from 'react-router-dom';

const stats = [
  { icon: 'ri-film-line', value: '50,000+', label: 'Bộ phim & series' },
  { icon: 'ri-global-line', value: '20+', label: 'Quốc gia' },
  { icon: 'ri-user-line', value: '1,000,000+', label: 'Người dùng mỗi tháng' },
  { icon: 'ri-refresh-line', value: 'Hàng ngày', label: 'Cập nhật phim mới' },
];

const categories = [
  { label: 'Phim Hàn Quốc', to: '/phim-han-quoc', desc: 'Drama Hàn vietsub HD – romance, hành động, kinh dị, cổ trang mới nhất' },
  { label: 'Phim Trung Quốc', to: '/phim-trung-quoc', desc: 'Cổ trang, tiên hiệp, ngôn tình Trung Quốc cập nhật liên tục' },
  { label: 'Phim Âu Mỹ', to: '/phim-au-my', desc: 'Hollywood blockbuster, Marvel, DC, phim bộ Mỹ HD Full HD' },
  { label: 'Phim Việt Nam', to: '/phim-viet-nam', desc: 'Phim chiếu rạp, phim bộ truyền hình Việt Nam hay nhất' },
  { label: 'Phim Thái Lan', to: '/phim-thai-lan', desc: 'Lakorn Thái, BL drama, phim tình cảm hành động Thái mới nhất' },
  { label: 'Phim Nhật Bản', to: '/phim-nhat-ban', desc: 'Anime vietsub, j-drama, phim điện ảnh Nhật Bản chất lượng cao' },
];

const typeLinks = [
  { label: 'Phim Lẻ', to: '/phim-le', icon: 'ri-movie-2-line' },
  { label: 'Phim Bộ', to: '/phim-bo', icon: 'ri-tv-2-line' },
  { label: 'Hoạt Hình', to: '/hoat-hinh', icon: 'ri-gamepad-line' },
  { label: 'TV Shows', to: '/tv-shows', icon: 'ri-broadcast-line' },
  { label: 'Phim Chiếu Rạp', to: '/phim-chieu-rap', icon: 'ri-film-line' },
  { label: 'Phim Sắp Chiếu', to: '/phim-sap-chieu', icon: 'ri-time-line' },
];

export default function AboutSection() {
  return (
    <section className="mt-16 mb-8" aria-labelledby="about-heading">
      <div className="flex items-center gap-3 mb-10">
        <div className="w-1 h-6 bg-red-500 rounded-full" />
        <h2 id="about-heading" className="text-xl font-bold text-white">Về KhoPhim</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mb-10">
        {/* Left – text content */}
        <div>
          {/* Brand badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold px-3 py-1 rounded-full">
              <i className="ri-global-line text-xs" />
              khophim.org
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-white/50 text-xs px-3 py-1 rounded-full">
              kho phim · KhoPhim
            </span>
          </div>

          <h2 className="text-lg font-semibold text-white mb-3 leading-snug">
            KhoPhim – Nền tảng xem phim online miễn phí hàng đầu Việt Nam
          </h2>
          <div className="space-y-3 text-sm text-white/60 leading-relaxed">
            <p>
              <strong className="text-white/90">KhoPhim</strong> (tên miền <strong className="text-red-400">khophim.org</strong>, còn được biết đến với tên <strong className="text-white/80">kho phim</strong> hoặc <strong className="text-white/80">khophim</strong>) là website xem phim online miễn phí chất lượng cao,
              cung cấp kho phim khổng lồ gồm hơn 50,000 bộ phim và series từ khắp nơi trên thế giới.
              Từ <strong className="text-white/70">phim lẻ HD</strong>, <strong className="text-white/70">phim bộ vietsub</strong>,{' '}
              <strong className="text-white/70">phim chiếu rạp</strong> đến TV shows, hoạt hình – tất cả đều được cập nhật hàng ngày.
            </p>
            <p>
              Chúng tôi tổng hợp phim từ các quốc gia nổi tiếng như{' '}
              <Link to="/phim-han-quoc" className="text-red-400 hover:underline">phim Hàn Quốc</Link>,{' '}
              <Link to="/phim-trung-quoc" className="text-red-400 hover:underline">phim Trung Quốc</Link>,{' '}
              <Link to="/phim-au-my" className="text-red-400 hover:underline">phim Âu Mỹ</Link>,{' '}
              <Link to="/phim-nhat-ban" className="text-red-400 hover:underline">phim Nhật Bản</Link>,{' '}
              <Link to="/phim-thai-lan" className="text-red-400 hover:underline">phim Thái Lan</Link> và{' '}
              <Link to="/phim-viet-nam" className="text-red-400 hover:underline">phim Việt Nam</Link>.
              Mỗi bộ phim đều có phụ đề tiếng Việt hoặc lồng tiếng, giúp bạn thưởng thức trọn vẹn nội dung.
            </p>
            <p>
              <strong className="text-white/80">KhoPhim – khophim.org</strong> không yêu cầu đăng ký tài khoản, không có quảng cáo phiền phức và tương thích hoàn toàn
              trên mọi thiết bị – máy tính, điện thoại và máy tính bảng. Xem <strong className="text-white/70">kho phim</strong> online chất lượng{' '}
              <strong className="text-white/70">Full HD</strong> tốt nhất tại <a href="https://khophim.org" className="text-red-400 hover:underline">khophim.org</a>.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-[#1a1d27] border border-white/5 rounded-lg px-4 py-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 flex items-center justify-center bg-red-500/10 rounded-lg shrink-0">
                  <i className={`${s.icon} text-red-400 text-lg`} />
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{s.value}</div>
                  <div className="text-white/40 text-xs">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right – category links (SEO value) */}
        <div>
          <h3 className="text-base font-semibold text-white/80 mb-4">Khám phá theo quốc gia</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {categories.map((cat) => (
              <Link
                key={cat.to}
                to={cat.to}
                className="group bg-[#1a1d27] border border-white/5 hover:border-red-500/30 rounded-lg p-4 transition-all cursor-pointer"
              >
                <div className="text-white font-medium text-sm group-hover:text-red-400 transition-colors mb-1">
                  {cat.label}
                </div>
                <p className="text-white/40 text-xs leading-relaxed">{cat.desc}</p>
              </Link>
            ))}
          </div>

          {/* Type quick links */}
          <h3 className="text-base font-semibold text-white/80 mb-3">Khám phá theo thể loại</h3>
          <div className="grid grid-cols-3 gap-2">
            {typeLinks.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="flex items-center gap-2 bg-[#1a1d27] border border-white/5 hover:border-red-500/30 rounded-lg px-3 py-2.5 transition-all cursor-pointer group"
              >
                <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <i className={`${t.icon} text-red-400/70 group-hover:text-red-400 text-sm transition-colors`} />
                </span>
                <span className="text-white/60 group-hover:text-white/90 text-xs font-medium transition-colors whitespace-nowrap">{t.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Feature tags */}
      <div className="flex flex-wrap gap-2">
        {[
          'KhoPhim miễn phí',
          'khophim.org',
          'Kho phim online',
          'Không cần đăng ký',
          'HD & Full HD',
          'Phụ đề tiếng Việt',
          'Cập nhật hàng ngày',
          'Không quảng cáo',
          'Tương thích mobile',
          'Phim mới nhất 2026',
        ].map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 bg-white/5 text-white/50 text-xs rounded-full border border-white/10"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}
