import { Link } from 'react-router-dom';

const genres = [
  { label: 'Phim Hành Động', slug: 'hanh-dong', desc: 'Danh sách phim hành động, chiến đấu và võ thuật.' },
  { label: 'Phim Tình Cảm', slug: 'tinh-cam', desc: 'Danh sách phim tình cảm và lãng mạn từ nhiều quốc gia.' },
  { label: 'Phim Kinh Dị', slug: 'kinh-di', desc: 'Danh sách phim kinh dị, giật gân và chủ đề siêu nhiên.' },
  { label: 'Phim Hài Hước', slug: 'hai-huoc', desc: 'Danh sách phim hài và nội dung giải trí nhẹ nhàng.' },
  { label: 'Phim Viễn Tưởng', slug: 'vien-tuong', desc: 'Danh sách phim khoa học và thế giới viễn tưởng.' },
  { label: 'Phim Hoạt Hình', slug: 'hoat-hinh', desc: 'Danh sách phim hoạt hình và anime.' },
  { label: 'Phim Tâm Lý', slug: 'tam-ly', desc: 'Danh sách phim tâm lý và chính kịch.' },
  { label: 'Phim Phiêu Lưu', slug: 'phieu-luu', desc: 'Danh sách phim phiêu lưu và hành trình khám phá.' },
  { label: 'Phim Cổ Trang', slug: 'co-trang', desc: 'Danh sách phim cổ trang, kiếm hiệp và cung đình.' },
  { label: 'Phim Hình Sự', slug: 'hinh-su', desc: 'Danh sách phim hình sự, tội phạm và điều tra.' },
  { label: 'Phim Chiến Tranh', slug: 'chien-tranh', desc: 'Danh sách phim chiến tranh và lịch sử.' },
  { label: 'Phim Gia Đình', slug: 'gia-dinh', desc: 'Danh sách phim có chủ đề gia đình.' },
  { label: 'Phim Việt Nam', slug: 'phim-viet-nam', desc: 'Danh sách phim điện ảnh và phim bộ Việt Nam.', to: '/phim-viet-nam' },
  { label: 'Phim Bí Ẩn', slug: 'bi-an', desc: 'Danh sách phim bí ẩn và điều tra.' },
  { label: 'Phim Thể Thao', slug: 'the-thao', desc: 'Danh sách phim có chủ đề thể thao.' },
  { label: 'Phim Âm Nhạc', slug: 'am-nhac', desc: 'Danh sách phim âm nhạc và câu chuyện nghệ sĩ.' },
  { label: 'Phim Kinh Điển', slug: 'kinh-dien', desc: 'Danh sách các phim được xếp vào nhóm kinh điển.' },
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

      <p className="mt-6 max-w-4xl text-sm leading-relaxed text-white/55">
        Chọn một thể loại để xem danh sách phim tương ứng. Mỗi trang thể loại có bộ lọc,
        trạng thái tập và liên kết tới trang thông tin của từng phim.
      </p>
    </section>
  );
}
