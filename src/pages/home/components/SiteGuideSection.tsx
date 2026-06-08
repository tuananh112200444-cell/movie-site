import { Link } from 'react-router-dom';

const guides = [
  {
    icon: 'ri-search-line',
    title: 'Cách tìm phim nhanh nhất',
    desc: 'Dùng thanh tìm kiếm ở đầu trang, nhập tên phim bằng tiếng Việt hoặc tiếng Anh. KhoPhim hỗ trợ tìm kiếm thông minh, gợi ý tên phim ngay khi bạn gõ. Bạn cũng có thể lọc phim theo thể loại, quốc gia, năm sản xuất để tìm đúng phim mình muốn.',
  },
  {
    icon: 'ri-hd-line',
    title: 'Chất lượng phim HD & Full HD',
    desc: 'Tất cả phim trên KhoPhim đều được cung cấp với chất lượng HD (720p) và Full HD (1080p). Hệ thống tự động điều chỉnh chất lượng phù hợp với tốc độ mạng của bạn, đảm bảo xem phim mượt mà không bị giật lag.',
  },
  {
    icon: 'ri-smartphone-line',
    title: 'Xem phim trên điện thoại',
    desc: 'KhoPhim tương thích hoàn toàn với điện thoại Android và iPhone. Giao diện tự động điều chỉnh theo màn hình, trình phát video hỗ trợ xoay ngang để xem toàn màn hình. Không cần tải app, chỉ cần mở trình duyệt là xem được ngay.',
  },
  {
    icon: 'ri-history-line',
    title: 'Lưu lịch sử xem phim',
    desc: 'KhoPhim tự động lưu lịch sử xem phim của bạn ngay trên trình duyệt. Lần sau vào trang, bạn có thể tiếp tục xem từ chỗ đã dừng mà không cần nhớ tên phim hay tập đang xem. Tính năng này hoạt động mà không cần đăng ký tài khoản.',
  },
  {
    icon: 'ri-heart-line',
    title: 'Danh sách phim yêu thích',
    desc: 'Bấm vào biểu tượng trái tim trên mỗi poster phim để thêm vào danh sách yêu thích. Danh sách được lưu trên trình duyệt, giúp bạn dễ dàng tìm lại các phim muốn xem sau mà không cần ghi nhớ.',
  },
  {
    icon: 'ri-closed-captioning-line',
    title: 'Phụ đề & lồng tiếng Việt',
    desc: 'Phần lớn phim nước ngoài trên KhoPhim đều có phụ đề tiếng Việt (vietsub) hoặc lồng tiếng Việt. Phụ đề được dịch chuẩn, đồng bộ với hình ảnh. Một số phim có cả hai lựa chọn để bạn tự chọn theo sở thích.',
  },
];

const highlights = [
  {
    category: 'Phim Hàn Quốc',
    href: '/phim-han-quoc',
    color: 'from-rose-500/20 to-pink-500/10',
    border: 'border-rose-500/20',
    icon: 'ri-heart-fill',
    iconColor: 'text-rose-400',
    desc: 'Drama Hàn là thể loại được yêu thích nhất tại KhoPhim. Từ phim tình cảm lãng mạn, hành động hình sự đến cổ trang lịch sử — tất cả đều có vietsub HD cập nhật nhanh nhất sau khi phát sóng tại Hàn Quốc. Các bộ phim nổi tiếng như Crash Landing On You, Hậu Duệ Mặt Trời, Goblin đều có đầy đủ tại đây.',
    tags: ['Romance', 'Thriller', 'Saeguk', 'tvN', 'Netflix Korea'],
  },
  {
    category: 'Phim Âu Mỹ',
    href: '/phim-au-my',
    color: 'from-blue-500/20 to-indigo-500/10',
    border: 'border-blue-500/20',
    icon: 'ri-star-fill',
    iconColor: 'text-yellow-400',
    desc: 'Bom tấn Hollywood luôn được cập nhật nhanh tại KhoPhim. Toàn bộ vũ trụ Marvel (MCU), DC Extended Universe, phim Disney và các blockbuster từ Universal, Paramount đều có đầy đủ với vietsub HD chất lượng cao. Phim bộ Mỹ từ Netflix, HBO, Disney+ cũng được cập nhật liên tục.',
    tags: ['Marvel', 'DC', 'Netflix', 'HBO', 'Disney+'],
  },
  {
    category: 'Phim Trung Quốc',
    href: '/phim-trung-quoc',
    color: 'from-amber-500/20 to-orange-500/10',
    border: 'border-amber-500/20',
    icon: 'ri-sword-fill',
    iconColor: 'text-amber-400',
    desc: 'Phim Trung Quốc tại KhoPhim cực kỳ đa dạng: từ phim cổ trang hoàng cung đình đám, tiên hiệp tu tiên huyền ảo đến phim hiện đại ngôn tình và hành động đô thị. Các bom tấn từ iQIYI, Youku, Tencent Video đều được cập nhật với vietsub chuẩn, không bỏ sót tập nào.',
    tags: ['Cổ trang', 'Tiên hiệp', 'Ngôn tình', 'iQIYI', 'Youku'],
  },
];

export default function SiteGuideSection() {
  return (
    <section className="mt-16 mb-4" aria-labelledby="guide-heading">
      {/* Hướng dẫn sử dụng */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-red-500 rounded-full" />
        <h2 id="guide-heading" className="text-xl font-bold text-white">
          Hướng Dẫn Xem Phim Tại KhoPhim
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
        {guides.map((g) => (
          <div
            key={g.title}
            className="bg-[#141720] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 flex items-center justify-center bg-red-500/10 rounded-lg shrink-0">
                <i className={`${g.icon} text-red-400 text-lg`} />
              </div>
              <h3 className="text-sm font-semibold text-white/90">{g.title}</h3>

            </div>
            <p className="text-xs text-white/50 leading-relaxed">{g.desc}</p>
          </div>
        ))}
      </div>

      {/* Nổi bật theo thể loại */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-red-500 rounded-full" />
        <h2 className="text-xl font-bold text-white">Thể Loại Phim Nổi Bật</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
        {highlights.map((h) => (
          <Link
            key={h.href}
            to={h.href}
            className={`group bg-gradient-to-br ${h.color} border ${h.border} rounded-xl p-5 hover:scale-[1.01] transition-all cursor-pointer block`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 flex items-center justify-center">
                <i className={`${h.icon} ${h.iconColor} text-base`} />
              </span>
              <h3 className="text-base font-bold text-white group-hover:text-red-300 transition-colors">{h.category}</h3>
            </div>
            <p className="text-xs text-white/55 leading-relaxed mb-4">{h.desc}</p>
            <div className="flex flex-wrap gap-1.5">
              {h.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-white/10 text-white/60 text-xs rounded-full border border-white/10"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      {/* Bài viết SEO dài */}
      <div className="bg-[#0f1118] border border-white/5 rounded-2xl p-7 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">
          KhoPhim – Trang Xem Phim Online Miễn Phí Tốt Nhất Việt Nam 2026
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm text-white/55 leading-relaxed">
          <div className="space-y-4">
            <p>
              <strong className="text-white/80">KhoPhim</strong> (địa chỉ:{' '}
              <a href="https://khophim.org" className="text-red-400 hover:underline" rel="noopener noreferrer nofollow">khophim.org</a>)
              là nền tảng xem phim trực tuyến miễn phí hàng đầu Việt Nam, cung cấp kho phim khổng lồ với hơn{' '}
              <strong className="text-white/70">50,000 bộ phim và series</strong> từ khắp nơi trên thế giới.
              Được thành lập với mục tiêu mang đến trải nghiệm xem phim tốt nhất, KhoPhim không ngừng cập nhật
              phim mới hàng ngày với chất lượng HD và Full HD.
            </p>
            <p>
              Điểm nổi bật của KhoPhim so với các trang xem phim khác là{' '}
              <strong className="text-white/70">hoàn toàn miễn phí</strong>, không yêu cầu đăng ký tài khoản,
              không có quảng cáo phiền phức làm gián đoạn trải nghiệm xem phim. Giao diện thân thiện, tốc độ
              tải nhanh và tương thích hoàn toàn trên mọi thiết bị từ máy tính đến điện thoại.
            </p>
            <p>
              Kho phim của KhoPhim bao gồm đầy đủ các thể loại:{' '}
              <Link to="/phim-le" className="text-red-400 hover:underline">phim lẻ</Link>,{' '}
              <Link to="/phim-bo" className="text-red-400 hover:underline">phim bộ</Link>,{' '}
              <Link to="/phim-chieu-rap" className="text-red-400 hover:underline">phim chiếu rạp</Link>,{' '}
              <Link to="/hoat-hinh" className="text-red-400 hover:underline">hoạt hình</Link>,{' '}
              <Link to="/tv-shows" className="text-red-400 hover:underline">TV shows</Link> và{' '}
              <Link to="/phim-sap-chieu" className="text-red-400 hover:underline">phim sắp chiếu</Link>.
              Phim được phân loại rõ ràng theo quốc gia, thể loại, năm sản xuất giúp bạn dễ dàng tìm kiếm.
            </p>
          </div>
          <div className="space-y-4">
            <p>
              Về chất lượng phụ đề, KhoPhim cung cấp{' '}
              <strong className="text-white/70">vietsub (phụ đề tiếng Việt)</strong> cho hầu hết phim nước ngoài,
              được dịch chuẩn xác và đồng bộ hoàn hảo với hình ảnh. Nhiều phim còn có thêm lựa chọn lồng tiếng
              Việt, phù hợp cho người xem không muốn đọc phụ đề.
            </p>
            <p>
              Hệ thống phát video của KhoPhim sử dụng công nghệ HLS (HTTP Live Streaming) tiên tiến, cho phép
              phát phim mượt mà ngay cả khi tốc độ mạng không ổn định. Chất lượng video tự động điều chỉnh
              từ 480p đến Full HD 1080p tùy theo băng thông của người dùng.
            </p>
            <p>
              KhoPhim cập nhật phim mới <strong className="text-white/70">hàng ngày</strong>, bao gồm cả phim
              đang chiếu rạp, phim bộ đang phát sóng và phim mới ra mắt từ các nền tảng streaming lớn như
              Netflix, HBO, Disney+, iQIYI. Người dùng luôn có thể tìm thấy phim mới nhất tại KhoPhim trước
              khi tìm ở bất kỳ đâu khác.
            </p>
          </div>
        </div>
      </div>

      {/* Quick links SEO */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: 'Phim Lẻ HD', href: '/phim-le' },
          { label: 'Phim Bộ Vietsub', href: '/phim-bo' },
          { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' },
          { label: 'Hoạt Hình Anime', href: '/hoat-hinh' },
          { label: 'TV Shows', href: '/tv-shows' },
          { label: 'Phim Sắp Chiếu', href: '/phim-sap-chieu' },
          { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
          { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' },
          { label: 'Phim Âu Mỹ', href: '/phim-au-my' },
          { label: 'Phim Nhật Bản', href: '/phim-nhat-ban' },
          { label: 'Phim Thái Lan', href: '/phim-thai-lan' },
          { label: 'Phim Việt Nam', href: '/phim-viet-nam' },
        ].map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="flex items-center justify-center px-3 py-2 bg-[#141720] border border-white/5 hover:border-red-500/30 hover:text-red-400 text-white/50 text-xs rounded-lg transition-all cursor-pointer text-center whitespace-nowrap"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
