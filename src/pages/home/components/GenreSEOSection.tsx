import { Link } from 'react-router-dom';

const genres = [
  { label: 'Phim Hành Động', slug: 'hanh-dong', desc: 'Xem phim hành động vietsub HD mới nhất – bom tấn, chiến tranh, võ thuật đỉnh cao' },
  { label: 'Phim Tình Cảm', slug: 'tinh-cam', desc: 'Phim tình cảm lãng mạn vietsub – romance Hàn, Trung, Âu Mỹ hay nhất 2026' },
  { label: 'Phim Kinh Dị', slug: 'kinh-di', desc: 'Xem phim kinh dị vietsub HD – horror, thriller, ma quỷ rùng rợn nhất' },
  { label: 'Phim Hài Hước', slug: 'hai-huoc', desc: 'Phim hài hước vietsub – comedy Hàn, Mỹ, Trung vui nhộn giải trí' },
  { label: 'Phim Viễn Tưởng', slug: 'vien-tuong', desc: 'Phim viễn tưởng sci-fi HD – Marvel, DC, khoa học viễn tưởng đỉnh cao' },
  { label: 'Phim Hoạt Hình', slug: 'hoat-hinh', desc: 'Xem hoạt hình anime vietsub – Nhật Bản, Disney, Pixar mới nhất' },
  { label: 'Phim Tâm Lý', slug: 'tam-ly', desc: 'Phim tâm lý drama vietsub – câu chuyện sâu sắc, cảm xúc chân thực' },
  { label: 'Phim Phiêu Lưu', slug: 'phieu-luu', desc: 'Phim phiêu lưu mạo hiểm vietsub HD – khám phá, hành trình kỳ thú' },
  { label: 'Phim Cổ Trang', slug: 'co-trang', desc: 'Phim cổ trang Trung Quốc vietsub – tiên hiệp, kiếm hiệp, cung đình hay nhất' },
  { label: 'Phim Hình Sự', slug: 'hinh-su', desc: 'Phim hình sự trinh thám vietsub – crime, detective, thriller hấp dẫn' },
  { label: 'Phim Chiến Tranh', slug: 'chien-tranh', desc: 'Phim chiến tranh lịch sử vietsub HD – bom tấn lịch sử đỉnh cao' },
  { label: 'Phim Gia Đình', slug: 'gia-dinh', desc: 'Phim gia đình vietsub – phim hay cho cả nhà, ấm áp và ý nghĩa' },
  { label: 'Phim Việt Nam', slug: 'phim-viet-nam', desc: 'Phim Việt Nam vietsub HD – phim chiếu rạp, phim bộ, phim hài Việt hay nhất', to: '/phim-viet-nam' },
  { label: 'Phim Bí Ẩn', slug: 'bi-an', desc: 'Phim bí ẩn mystery vietsub – câu chuyện huyền bí, twist bất ngờ' },
  { label: 'Phim Thể Thao', slug: 'the-thao', desc: 'Phim thể thao vietsub – bóng đá, bóng rổ, võ thuật truyền cảm hứng' },
  { label: 'Phim Âm Nhạc', slug: 'am-nhac', desc: 'Phim âm nhạc vietsub – musical, concert, câu chuyện nghệ sĩ hay nhất' },
  { label: 'Phim Kinh Điển', slug: 'kinh-dien', desc: 'Phim kinh điển mọi thời đại – classic movies vietsub HD chất lượng cao' },
];

export default function GenreSEOSection() {
  return (
    <section className="py-8 mt-2" aria-labelledby="genre-seo-heading">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-5 bg-red-500 rounded-full" />
        <h2 id="genre-seo-heading" className="text-white font-bold text-base">
          <a href="#genre-seo-heading" className="hover:text-red-400 transition-colors">
            Xem Phim Theo Thể Loại
          </a>
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {genres.map((g) => (
          <Link
            key={g.slug}
            to={g.to ?? `/the-loai/${g.slug}`}
            className="group bg-[#141720] border border-white/5 hover:border-red-500/25 rounded-lg p-3.5 transition-all cursor-pointer"
            title={g.desc}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <i className="ri-film-fill text-red-400/70 group-hover:text-red-400 text-xs transition-colors" />
              </span>
              <span className="text-white/80 group-hover:text-white font-medium text-sm transition-colors whitespace-nowrap">
                {g.label}
              </span>
            </div>
            <p className="text-white/35 text-xs leading-relaxed line-clamp-2">{g.desc}</p>
          </Link>
        ))}
      </div>

      {/* Hidden SEO text — Google reads this, users don't notice */}
      <div className="mt-6 text-white/20 text-xs leading-relaxed select-none" aria-hidden="true">
        <div className="sr-only">KhoPhim – Xem phim online miễn phí vietsub HD</div>
        <strong>KhoPhim</strong> – Xem phim online miễn phí vietsub HD đầy đủ thể loại: phim hành động, phim tình cảm, phim kinh dị, phim hài hước, phim viễn tưởng, phim hoạt hình, phim tâm lý, phim phiêu lưu, phim cổ trang, phim hình sự, phim chiến tranh, phim gia đình, phim bí ẩn, phim thể thao, phim âm nhạc. Cập nhật phim mới 2026 hàng ngày tại khophim.org.
      </div>
    </section>
  );
}
