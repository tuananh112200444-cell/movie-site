import { Link } from 'react-router-dom';

const countryLinks = [
  { label: 'Phim Hàn Quốc', to: '/phim-han-quoc', desc: 'Drama, phim điện ảnh và series Hàn Quốc' },
  { label: 'Phim Trung Quốc', to: '/phim-trung-quoc', desc: 'Cổ trang, tiên hiệp, ngôn tình và phim hiện đại' },
  { label: 'Phim Âu Mỹ', to: '/phim-au-my', desc: 'Phim Hollywood, series, hành động và viễn tưởng' },
  { label: 'Phim Việt Nam', to: '/phim-viet-nam', desc: 'Phim chiếu rạp, truyền hình và web drama Việt' },
  { label: 'Phim Thái Lan', to: '/phim-thai-lan', desc: 'Lakorn, BL, tình cảm, hài và kinh dị Thái' },
  { label: 'Phim Nhật Bản', to: '/phim-nhat-ban', desc: 'Anime, J-drama, live action và điện ảnh Nhật' },
];

const typeLinks = [
  { label: 'Phim Lẻ', to: '/phim-le' },
  { label: 'Phim Bộ', to: '/phim-bo' },
  { label: 'Hoạt Hình', to: '/hoat-hinh' },
  { label: 'TV Shows', to: '/tv-shows' },
  { label: 'Phim Chiếu Rạp', to: '/phim-chieu-rap' },
  { label: 'Phim Sắp Chiếu', to: '/phim-sap-chieu' },
];

export default function AboutSection() {
  return (
    <section className="mt-16 mb-8" aria-labelledby="about-heading">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-1 h-6 bg-red-500 rounded-full" />
        <h2 id="about-heading" className="text-xl font-bold text-white">Khám phá KhoPhim</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-4 text-sm text-white/60 leading-relaxed">
          <p>
            <strong className="text-white/90">KhoPhim</strong> tại <strong className="text-red-400">khophim.org</strong> giúp
            người xem tìm phim theo loại, quốc gia, thể loại và thời gian cập nhật. Thông tin tập, ngôn ngữ và chất lượng
            được hiển thị theo dữ liệu hiện có của từng phim.
          </p>
          <p>
            Các trang phim mới, phim bộ đang chiếu và phim sắp chiếu được tách riêng để người xem dễ theo dõi thay đổi.
            Trang tìm kiếm hỗ trợ tên tiếng Việt, tên gốc và các cách viết gần đúng.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {typeLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="px-3 py-1.5 bg-white/5 text-white/60 hover:text-red-400 text-xs rounded-full border border-white/10 hover:border-red-500/25 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-white/80 mb-4">Khám phá theo quốc gia</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {countryLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group bg-[#1a1d27] border border-white/5 hover:border-red-500/30 rounded-lg p-4 transition-all"
              >
                <div className="text-white font-medium text-sm group-hover:text-red-400 transition-colors mb-1">{item.label}</div>
                <p className="text-white/40 text-xs leading-relaxed">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
