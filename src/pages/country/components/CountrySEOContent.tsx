import { Link } from 'react-router-dom';
import type { CountryConfig } from '../page';

interface Props {
  config: CountryConfig;
}

const COUNTRY_GUIDES: Record<string, { intro: string; discovery: string[] }> = {
  'han-quoc': {
    intro: 'Danh mục Phim Hàn Quốc tập trung vào drama, phim điện ảnh và series Hàn có trong thư viện KhoPhim. Danh sách được sắp xếp theo dữ liệu cập nhật của từng phim để người xem dễ tìm phim mới và tập mới.',
    discovery: ['Drama tình cảm và tâm lý', 'Hành động, hình sự và kinh dị', 'Phim cổ trang Hàn Quốc', 'Phim lẻ và series đang cập nhật'],
  },
  'trung-quoc': {
    intro: 'Danh mục Phim Trung Quốc tổng hợp các phim cổ trang, tiên hiệp, ngôn tình, hành động và phim hiện đại có trong thư viện KhoPhim. Người xem có thể chuyển giữa phim mới và phim đang được quan tâm.',
    discovery: ['Cổ trang và cung đấu', 'Tiên hiệp và huyền huyễn', 'Ngôn tình và phim hiện đại', 'Phim bộ đang cập nhật tập'],
  },
  'au-my': {
    intro: 'Danh mục Phim Âu Mỹ tổng hợp phim điện ảnh và series từ Mỹ, châu Âu cùng các thị trường nói tiếng Anh có trong thư viện KhoPhim, gồm nhiều nhóm hành động, viễn tưởng, kinh dị và chính kịch.',
    discovery: ['Phim điện ảnh Hollywood', 'Series và TV shows', 'Hành động và khoa học viễn tưởng', 'Kinh dị, bí ẩn và chính kịch'],
  },
  'nhat-ban': {
    intro: 'Danh mục Phim Nhật Bản kết hợp anime, live action, J-drama và phim điện ảnh Nhật có trong thư viện KhoPhim. Danh sách ưu tiên dữ liệu mới cập nhật để thuận tiện theo dõi anime và series đang phát hành.',
    discovery: ['Anime và hoạt hình Nhật Bản', 'J-drama và live action', 'Phim điện ảnh Nhật', 'Tác phẩm mới cập nhật'],
  },
  'thai-lan': {
    intro: 'Danh mục Phim Thái Lan tổng hợp lakorn, BL, phim tình cảm, hài hước, hành động và kinh dị Thái có trong thư viện KhoPhim. Các phim đang phát hành được cập nhật theo dữ liệu tập hiện có.',
    discovery: ['Lakorn và phim tình cảm', 'Series BL Thái Lan', 'Hài hước và học đường', 'Hành động và kinh dị'],
  },
  'viet-nam': {
    intro: 'Danh mục Phim Việt Nam tổng hợp phim chiếu rạp, phim truyền hình, web drama, hài, tình cảm và hành động Việt có trong thư viện KhoPhim.',
    discovery: ['Phim Việt chiếu rạp', 'Phim bộ truyền hình', 'Hài và tình cảm', 'Web drama và phim mới cập nhật'],
  },
};

export default function CountrySEOContent({ config }: Props) {
  const guide = COUNTRY_GUIDES[config.slug] ?? {
    intro: `Danh mục ${config.name} tổng hợp các phim hiện có trong thư viện KhoPhim và được làm mới theo dữ liệu cập nhật của từng phim.`,
    discovery: ['Phim mới cập nhật', 'Phim lẻ', 'Phim bộ', 'Nhiều thể loại khác nhau'],
  };

  return (
    <section className="mt-16 pt-12 pb-4" aria-label={`Thông tin ${config.name}`}>
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-1 h-6 ${config.accentBg} rounded-full flex-shrink-0`} />
        <div className="flex-1">
          <h2 className="text-base font-bold text-white leading-snug">
            Khám phá {config.name} trên KhoPhim
          </h2>
          <div className={`h-px bg-gradient-to-r ${config.gradientFrom} to-transparent mt-2`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10">
        <div className="lg:col-span-3">
          <p className="text-white/50 text-sm leading-relaxed">{guide.intro}</p>
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
          {guide.discovery.map((item, index) => (
            <div
              key={item}
              className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3"
            >
              <div className={`w-7 h-7 flex items-center justify-center rounded-lg ${config.accentBg}/10 flex-shrink-0`}>
                <i className={`${index === 0 ? 'ri-film-line' : 'ri-arrow-right-s-line'} ${config.accentColor} text-sm`} />
              </div>
              <span className="text-white/60 text-sm leading-snug">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.05] pt-6">
        <div className="flex items-center gap-2 mb-3">
          <i className="ri-links-line text-white/20 text-sm" />
          <h3 className="text-xs font-semibold text-white/25 uppercase tracking-wider">Danh mục liên quan</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.related.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/70 border border-white/[0.06] hover:border-white/10 rounded-full text-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-right-s-line text-xs" />
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
