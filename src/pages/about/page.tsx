import { Link } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import SEO, { SITE_URL } from '@/components/base/SEO';

const aboutSchema = [
  {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'Giới Thiệu KhoPhim – Website Khám Phá Và Xem Phim Tiếng Việt',
    url: `${SITE_URL}/about`,
    description:
      'KhoPhim (khophim.org) là website khám phá và xem phim tiếng Việt, tổ chức nội dung theo phim, thể loại, quốc gia và trạng thái cập nhật.',
    inLanguage: 'vi',
    isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'KhoPhim',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: 'https://khophim.org/brand/khophim-logo-v2.png',
      },
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Giới Thiệu', item: `${SITE_URL}/about` },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KhoPhim',
    alternateName: ['khophim', 'khophim.org', 'kho phim', 'Kho Phim Online'],
    url: SITE_URL,
    logo: 'https://khophim.org/brand/khophim-logo-v2.png',
    description:
      'KhoPhim là website khám phá và xem phim tiếng Việt với metadata phim, danh mục, tìm kiếm và trạng thái cập nhật được chuẩn hóa.',
    areaServed: 'VN',
    knowsLanguage: 'vi',
    sameAs: ['https://www.tiktok.com/@khophim.org'],
    publishingPrinciples: `${SITE_URL}/press/`,
    contactPoint: {
      '@type': 'ContactPoint',
      name: 'KhoPhim Customer Support',
      contactType: 'customer support',
      availableLanguage: 'Vietnamese',
      areaServed: 'VN',
    },
  },
];

const STATS = [
  { value: 'Tự động', label: 'Cập Nhật', icon: 'ri-film-line', desc: 'Có kiểm tra chất lượng' },
  { value: 'Nhiều', label: 'Nguồn Phát', icon: 'ri-hd-line', desc: 'Chuyển nguồn khi có sẵn' },
  { value: '0đ', label: 'Phí Truy Cập', icon: 'ri-gift-line', desc: 'Không có gói trả phí' },
  { value: 'Rõ ràng', label: 'Quảng Cáo', icon: 'ri-shield-check-line', desc: 'Liên kết được gắn nhãn Ad' },
  { value: '10+', label: 'Quốc Gia', icon: 'ri-global-line', desc: 'Phim đa quốc gia' },
  { value: 'Mọi lúc', label: 'Truy Cập', icon: 'ri-time-line', desc: 'Theo trạng thái hệ thống' },
];

const FEATURES = [
  {
    icon: 'ri-play-circle-line',
    title: 'Truy cập trực tiếp trên trình duyệt',
    desc: 'Mở trang phim trực tiếp trên trình duyệt. Quảng cáo của KhoPhim được gắn nhãn và nguồn phát bên thứ ba có thể có chính sách riêng.',
  },
  {
    icon: 'ri-hd-line',
    title: 'Chất lượng theo nguồn phát',
    desc: 'Trang hiển thị chất lượng và trạng thái tập theo dữ liệu đã nhận. Độ phân giải thực tế phụ thuộc vào nguồn phát đang khả dụng.',
  },
  {
    icon: 'ri-translate-2',
    title: 'Vietsub & Lồng Tiếng Việt',
    desc: 'Nhãn Vietsub, thuyết minh và lồng tiếng được hiển thị khi nguồn dữ liệu có cung cấp, giúp người xem chọn phiên bản phù hợp.',
  },
  {
    icon: 'ri-refresh-line',
    title: 'Cập Nhật Hàng Ngày',
    desc: 'Dữ liệu mới được đồng bộ theo lô nhỏ, kiểm tra ảnh, metadata, tập phim và trạng thái trước khi đưa vào các khu vực khám phá.',
  },
  {
    icon: 'ri-smartphone-line',
    title: 'Xem Trên Mọi Thiết Bị',
    desc: 'Giao diện được thiết kế cho điện thoại, máy tính bảng và máy tính; không bắt buộc cài ứng dụng.',
  },
  {
    icon: 'ri-user-line',
    title: 'Không Cần Đăng Ký',
    desc: 'Xem phim ngay lập tức mà không cần tạo tài khoản hay đăng nhập. KhoPhim tôn trọng quyền riêng tư của người dùng, không yêu cầu thông tin cá nhân.',
  },
];

const CATEGORIES = [
  { label: 'Phim Lẻ', to: '/phim-le', icon: 'ri-movie-2-line', count: 'Điện ảnh' },
  { label: 'Phim Bộ', to: '/phim-bo', icon: 'ri-tv-2-line', count: 'Series' },
  { label: 'Phim Chiếu Rạp', to: '/phim-chieu-rap', icon: 'ri-building-4-line', count: 'Phim rạp' },
  { label: 'Hoạt Hình & Anime', to: '/hoat-hinh', icon: 'ri-gamepad-line', count: 'Hoạt hình' },
  { label: 'TV Shows', to: '/tv-shows', icon: 'ri-broadcast-line', count: 'Truyền hình' },
  { label: 'Phim Hàn Quốc', to: '/phim-han-quoc', icon: 'ri-heart-3-line', count: 'Drama Hàn' },
  { label: 'Phim Trung Quốc', to: '/phim-trung-quoc', icon: 'ri-ancient-pavilion-line', count: 'Phim Trung' },
  { label: 'Phim Âu Mỹ', to: '/phim-au-my', icon: 'ri-rocket-2-line', count: 'Hollywood' },
];

const FAQS = [
  {
    q: 'KhoPhim có hoàn toàn miễn phí không?',
    a: 'KhoPhim hiện không thu phí truy cập và không có gói premium. Các liên kết quảng cáo của KhoPhim được gắn nhãn rõ ràng.',
  },
  {
    q: 'Tôi có cần tạo tài khoản để xem phim không?',
    a: 'Không cần. Bạn có thể xem phim ngay lập tức mà không cần đăng ký hay đăng nhập. Chỉ cần truy cập khophim.org và chọn phim muốn xem.',
  },
  {
    q: 'KhoPhim có phim vietsub không?',
    a: 'Nhiều phim có Vietsub, thuyết minh hoặc lồng tiếng. Phiên bản cụ thể được ghi trên trang phim và phụ thuộc vào nguồn đang khả dụng.',
  },
  {
    q: 'Tôi có thể xem phim trên điện thoại không?',
    a: 'Hoàn toàn có thể. KhoPhim tương thích với mọi thiết bị — điện thoại Android, iPhone, máy tính bảng và máy tính. Không cần tải app, xem trực tiếp trên trình duyệt.',
  },
  {
    q: 'KhoPhim cập nhật phim mới như thế nào?',
    a: 'Hệ thống đồng bộ từ các nguồn đã cấu hình, đối chiếu metadata, kiểm tra chất lượng rồi cập nhật trang phim và sitemap theo trạng thái đủ điều kiện.',
  },
  {
    q: 'Nếu phim bị lỗi, tôi phải làm gì?',
    a: 'Nếu phim bị lỗi, hãy thử chuyển sang nguồn phim khác (Vietsub, Lồng Tiếng, Thuyết Minh) trong trang xem phim. Nếu vẫn lỗi, hãy liên hệ chúng tôi qua Telegram.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title="Giới Thiệu KhoPhim – Website Khám Phá Phim Tiếng Việt"
        description="KhoPhim là website khám phá và xem phim tiếng Việt, có tìm kiếm, danh mục, metadata và trạng thái cập nhật phim rõ ràng."
        keywords="giới thiệu KhoPhim, KhoPhim là gì, khophim.org, website phim tiếng Việt"
        canonical="/about"
        ogType="website"
        schema={aboutSchema}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://readdy.ai/api/search-image?query=cinematic%20dark%20film%20reel%20movie%20theater%20abstract%20background%20with%20deep%20red%20and%20black%20tones%2C%20bokeh%20lights%2C%20dramatic%20atmosphere%2C%20minimalist%20dark%20aesthetic%2C%20high%20contrast%20moody%20lighting%2C%20film%20strip%20texture%2C%20professional%20photography&width=1400&height=500&seq=about-hero-1&orientation=landscape"
            alt="KhoPhim – Xem phim online miễn phí"
            className="w-full h-full object-cover object-top opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#080a10]/60 via-[#080a10]/40 to-[#080a10]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#080a10]/80 via-transparent to-[#080a10]/80" />
        </div>

        <div className="relative max-w-[1760px] mx-auto px-4 md:px-6 text-center">
          {/* Breadcrumb */}
          <nav className="flex items-center justify-center gap-1.5 mb-8 text-xs text-white/30">
            <Link to="/" className="hover:text-white/60 transition-colors">Trang Chủ</Link>
            <i className="ri-arrow-right-s-line" />
            <span className="text-white/50">Giới Thiệu</span>
          </nav>

          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse inline-block" />
            <span className="text-red-400 text-xs font-semibold uppercase tracking-widest">Về Chúng Tôi</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-black mb-4 leading-tight">
            <span className="text-white">Kho</span><span className="text-red-500">Phim</span>
            <span className="text-white/60 font-light"> — Xem Phim Online</span>
            <br />
            <span className="text-white">Nhanh, Rõ Ràng Và Dễ Sử Dụng</span>
          </h1>
          <p className="text-white/50 text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-10">
            Website khám phá và xem phim tiếng Việt với metadata, tìm kiếm, danh mục và trạng thái tập được cập nhật thường xuyên tại <a href="https://khophim.org" className="text-red-400 hover:text-red-300 transition-colors">khophim.org</a>.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/" className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-3 rounded-xl transition-all cursor-pointer whitespace-nowrap">
              <i className="ri-play-fill" />
              Xem Phim Ngay
            </Link>
            <Link to="/filter" className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white/80 hover:text-white font-medium px-6 py-3 rounded-xl transition-all cursor-pointer whitespace-nowrap">
              <i className="ri-equalizer-2-line" />
              Khám Phá Phim
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-[1760px] mx-auto px-4 md:px-6 pb-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STATS.map(({ value, label, icon, desc }) => (
            <div key={label} className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5 text-center group hover:border-red-500/20 transition-all">
              <div className="w-10 h-10 flex items-center justify-center bg-red-500/10 rounded-xl mx-auto mb-3 group-hover:bg-red-500/20 transition-colors">
                <i className={`${icon} text-red-400 text-lg`} />
              </div>
              <div className="text-2xl font-black text-white mb-0.5">{value}</div>
              <div className="text-xs font-semibold text-white/60 mb-1">{label}</div>
              <div className="text-[10px] text-white/25">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* About content */}
      <section className="max-w-[1760px] mx-auto px-4 md:px-6 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-5 bg-red-500 rounded-full inline-block" />
              <h2 className="text-xl font-bold text-white">KhoPhim Là Gì?</h2>
            </div>
            <div className="space-y-4 text-white/55 text-sm leading-relaxed">
              <p>
                <strong className="text-white/80">KhoPhim</strong> (tên miền: <a href="https://khophim.org" className="text-red-400 hover:text-red-300 transition-colors">khophim.org</a>) là website khám phá và xem phim tiếng Việt, tập trung vào tìm kiếm nhanh, metadata rõ ràng và trải nghiệm đa thiết bị.
              </p>
              <p>
                Thư viện gồm phim lẻ, phim bộ, phim chiếu rạp, hoạt hình và anime từ nhiều quốc gia. Quy mô dữ liệu thay đổi theo quá trình đồng bộ, kiểm tra chất lượng và hợp nhất bản trùng.
              </p>
              <p>
                KhoPhim không yêu cầu tài khoản để khám phá và xem nội dung. Quảng cáo do KhoPhim đặt được gắn nhãn <strong className="text-white/70">Ad</strong>; trình phát từ bên thứ ba có thể áp dụng chính sách riêng.
              </p>
              <p>
                Khi một tập có nhiều nguồn, người xem có thể đổi nguồn. Tính khả dụng và chất lượng phát thực tế phụ thuộc vào từng nhà cung cấp, vì vậy trang không tuyên bố mọi phim luôn phát được ở mọi thời điểm.
              </p>
              <p>
                Metadata được tổng hợp từ các nguồn đã cấu hình như OPhim, KKPhim, BLVietsub, GLVietsub và TMDB. Hệ thống chỉ bổ sung trường còn thiếu khi đối sánh danh tính đủ chặt, đồng thời giữ nguyên tên chuẩn, tập phim và liên kết phát đang tốt.
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden aspect-video">
              <img
                src="https://readdy.ai/api/search-image?query=modern%20home%20cinema%20setup%20with%20large%20screen%20displaying%20colorful%20movie%20poster%2C%20comfortable%20dark%20room%2C%20ambient%20lighting%2C%20popcorn%20and%20remote%20control%2C%20cozy%20movie%20watching%20atmosphere%2C%20cinematic%20dark%20tones%2C%20professional%20interior%20photography&width=700&height=400&seq=about-cinema-1&orientation=landscape"
                alt="Xem phim online tại nhà với KhoPhim"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080a10]/60 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="bg-[#080a10]/80 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-red-500 rounded-lg flex-shrink-0">
                    <i className="ri-play-fill text-white text-sm" />
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold">Xem trực tiếp trên trình duyệt</p>
                    <p className="text-white/40 text-[10px]">HD · Vietsub · Miễn phí · Không đăng ký</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-[1760px] mx-auto px-4 md:px-6 pb-16">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-1 h-5 bg-red-500 rounded-full inline-block" />
            <h2 className="text-xl font-bold text-white">Tại Sao Chọn KhoPhim?</h2>
          </div>
          <p className="text-white/40 text-sm max-w-xl mx-auto">Các nguyên tắc sản phẩm và dữ liệu mà KhoPhim áp dụng cho trải nghiệm khám phá phim</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon, title, desc }) => (
            <article key={title} className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-6 hover:border-red-500/20 transition-all group">
              <div className="w-11 h-11 flex items-center justify-center bg-red-500/10 rounded-xl mb-4 group-hover:bg-red-500/20 transition-colors">
                <i className={`${icon} text-red-400 text-xl`} />
              </div>
              <h3 className="text-white font-bold text-sm mb-2">{title}</h3>
              <p className="text-white/45 text-xs leading-relaxed">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-[1760px] mx-auto px-4 md:px-6 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-1 h-5 bg-red-500 rounded-full inline-block" />
          <h2 className="text-xl font-bold text-white">Danh Mục Phim Tại KhoPhim</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CATEGORIES.map(({ label, to, icon, count }) => (
            <Link key={to} to={to}
              className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3 hover:border-red-500/25 hover:bg-[#12141f] transition-all group cursor-pointer">
              <div className="w-10 h-10 flex items-center justify-center bg-red-500/10 rounded-xl flex-shrink-0 group-hover:bg-red-500/20 transition-colors">
                <i className={`${icon} text-red-400 text-lg`} />
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-semibold truncate">{label}</p>
                <p className="text-white/30 text-[10px] mt-0.5">{count} phim</p>
              </div>
              <i className="ri-arrow-right-s-line text-white/20 group-hover:text-red-400 transition-colors ml-auto flex-shrink-0" />
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-[1760px] mx-auto px-4 md:px-6 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-1 h-5 bg-red-500 rounded-full inline-block" />
          <h2 className="text-xl font-bold text-white">Câu Hỏi Thường Gặp</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQS.map(({ q, a }) => (
            <article key={q} className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-5">
              <h3 className="text-white font-semibold text-sm mb-2 flex items-start gap-2">
                <span className="w-5 h-5 flex items-center justify-center bg-red-500/15 rounded-lg flex-shrink-0 mt-0.5">
                  <i className="ri-question-line text-red-400 text-xs" />
                </span>
                {q}
              </h3>
              <p className="text-white/45 text-xs leading-relaxed pl-7">{a}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Contact / CTA */}
      <section className="max-w-[1760px] mx-auto px-4 md:px-6 pb-20">
        <div className="bg-[#0d0f18] border border-white/[0.06] rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent" />
          <div className="relative">
            <div className="w-14 h-14 flex items-center justify-center bg-red-500/15 rounded-2xl mx-auto mb-5">
              <i className="ri-customer-service-2-line text-red-400 text-2xl" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Liên Hệ & Hỗ Trợ</h2>
            <p className="text-white/45 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
              Gặp vấn đề khi xem phim? Muốn yêu cầu thêm phim? Hãy liên hệ với chúng tôi qua các kênh bên dưới. Đội ngũ hỗ trợ KhoPhim luôn sẵn sàng giúp đỡ bạn.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a href="https://t.me/davisjohn_1" target="_blank" rel="noopener noreferrer nofollow"
                className="flex items-center gap-2 bg-[#29A8E8]/15 hover:bg-[#29A8E8]/25 border border-[#29A8E8]/25 text-[#29A8E8] font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap">
                <i className="ri-telegram-fill" />
                Telegram
              </a>
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer nofollow"
                className="flex items-center gap-2 bg-[#1877F2]/15 hover:bg-[#1877F2]/25 border border-[#1877F2]/25 text-[#1877F2] font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap">
                <i className="ri-facebook-fill" />
                Facebook
              </a>
              <Link to="/"
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap">
                <i className="ri-play-fill" />
                Xem Phim Ngay
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
