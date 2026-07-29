import { Link } from 'react-router-dom';

interface CategoryGuide {
  heading: string;
  intro: string;
  features: string[];
  related: Array<{ label: string; href: string }>;
}

const CATEGORY_GUIDES: Record<string, CategoryGuide> = {
  'phim-le': {
    heading: 'Khám phá phim lẻ Vietsub HD',
    intro: 'Danh mục Phim Lẻ tổng hợp phim điện ảnh có trong thư viện KhoPhim. Danh sách bao gồm nhiều nhóm hành động, tình cảm, kinh dị, hài hước và khoa học viễn tưởng, được sắp xếp theo dữ liệu cập nhật của từng phim.',
    features: ['Phim điện ảnh nhiều quốc gia', 'Danh sách phim mới cập nhật', 'Nhiều thể loại để lựa chọn', 'Xem thông tin và nguồn hiện có của từng phim'],
    related: [{ label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' }, { label: 'Phim Âu Mỹ', href: '/phim-au-my' }, { label: 'Phim Việt Nam', href: '/phim-viet-nam' }, { label: 'Phim Bộ', href: '/phim-bo' }],
  },
  'phim-bo': {
    heading: 'Khám phá phim bộ và series Vietsub HD',
    intro: 'Danh mục Phim Bộ tập trung vào series và phim dài tập có trong thư viện KhoPhim. Trạng thái tập được hiển thị theo dữ liệu hiện có để người xem nhận biết phim đang cập nhật hay đã hoàn tất.',
    features: ['Series nhiều quốc gia', 'Hiển thị trạng thái tập', 'Phim đang chiếu và đã hoàn tất', 'Sắp xếp theo thời gian cập nhật'],
    related: [{ label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }, { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' }, { label: 'Phim Thái Lan', href: '/phim-thai-lan' }, { label: 'Phim Lẻ', href: '/phim-le' }],
  },
  'phim-chieu-rap': {
    heading: 'Khám phá phim chiếu rạp mới cập nhật',
    intro: 'Danh mục Phim Chiếu Rạp tổng hợp các phim điện ảnh được đánh dấu chiếu rạp trong dữ liệu KhoPhim, gồm phim Hollywood, Hàn Quốc, Trung Quốc, Việt Nam và hoạt hình.',
    features: ['Phim điện ảnh được gắn nhãn chiếu rạp', 'Nhiều quốc gia và thể loại', 'Thông tin năm phát hành', 'Danh sách được làm mới theo dữ liệu phim'],
    related: [{ label: 'Phim Lẻ', href: '/phim-le' }, { label: 'Phim Âu Mỹ', href: '/phim-au-my' }, { label: 'Phim Việt Nam', href: '/phim-viet-nam' }, { label: 'Phim Mới Cập Nhật', href: '/phim-moi-cap-nhat' }],
  },
  'phim-sap-chieu': {
    heading: 'Theo dõi phim sắp chiếu và trailer',
    intro: 'Danh mục Phim Sắp Chiếu tập hợp các phim có trạng thái sắp phát hành hoặc mới có trailer trong dữ liệu KhoPhim. Ngày phát hành và trailer chỉ được hiển thị khi có dữ liệu tương ứng.',
    features: ['Phim có trạng thái sắp phát hành', 'Trailer khi nguồn dữ liệu cung cấp', 'Thông tin năm và ngày dự kiến', 'Liên kết sang phim khi có nguồn xem'],
    related: [{ label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' }, { label: 'Phim Mới Cập Nhật', href: '/phim-moi-cap-nhat' }, { label: 'Phim Lẻ', href: '/phim-le' }],
  },
  'hoat-hinh': {
    heading: 'Khám phá anime và phim hoạt hình',
    intro: 'Danh mục Hoạt Hình tổng hợp anime, hoạt hình điện ảnh và series hoạt hình có trong thư viện KhoPhim, được làm mới theo dữ liệu phim và tập hiện có.',
    features: ['Anime và hoạt hình nhiều quốc gia', 'Phim lẻ và series', 'Theo dõi trạng thái tập', 'Danh sách mới cập nhật'],
    related: [{ label: 'Anime', href: '/anime' }, { label: 'Phim Nhật Bản', href: '/phim-nhat-ban' }, { label: 'Phim Bộ', href: '/phim-bo' }, { label: 'Phim Lẻ', href: '/phim-le' }],
  },
  'tv-shows': {
    heading: 'Khám phá TV shows và series truyền hình',
    intro: 'Danh mục TV Shows tập hợp show truyền hình, reality show và series được phân loại trong dữ liệu KhoPhim. Người xem có thể theo dõi thông tin và tập hiện có của từng chương trình.',
    features: ['Show và series truyền hình', 'Nhiều quốc gia', 'Hiển thị trạng thái tập', 'Cập nhật theo dữ liệu chương trình'],
    related: [{ label: 'Phim Bộ', href: '/phim-bo' }, { label: 'Phim Âu Mỹ', href: '/phim-au-my' }, { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' }],
  },
};

const DEFAULT_GUIDE: CategoryGuide = {
  heading: 'Khám phá danh mục phim trên KhoPhim',
  intro: 'Danh mục này tổng hợp các phim phù hợp với tiêu chí đang chọn và được làm mới theo dữ liệu hiện có trong thư viện KhoPhim.',
  features: ['Danh sách phim theo tiêu chí', 'Nhiều thể loại', 'Thông tin phim hiện có', 'Liên kết tới các danh mục liên quan'],
  related: [{ label: 'Phim Lẻ', href: '/phim-le' }, { label: 'Phim Bộ', href: '/phim-bo' }, { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' }, { label: 'Phim Mới', href: '/phim-moi-cap-nhat' }],
};

interface Props {
  categoryKey: string;
}

export default function CategorySEOContent({ categoryKey }: Props) {
  const guide = CATEGORY_GUIDES[categoryKey] ?? DEFAULT_GUIDE;

  return (
    <section className="mt-8 sm:mt-16 pt-6 sm:pt-12 pb-4" aria-label="Thông tin danh mục phim">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-1 h-6 bg-red-500 rounded-full flex-shrink-0" />
        <div className="flex-1">
          <h2 className="text-base font-bold text-white leading-snug">{guide.heading}</h2>
          <div className="h-px bg-gradient-to-r from-red-500/30 to-transparent mt-2" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10">
        <p className="lg:col-span-3 text-white/50 text-sm leading-relaxed">{guide.intro}</p>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
          {guide.features.map((feature, index) => (
            <div
              key={feature}
              className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3"
            >
              <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 flex-shrink-0">
                <i className={`${index === 0 ? 'ri-film-line' : 'ri-check-line'} text-red-400 text-sm`} />
              </div>
              <span className="text-white/60 text-sm leading-snug">{feature}</span>
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
          {guide.related.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-white/[0.03] hover:bg-red-500/10 text-white/40 hover:text-red-400 border border-white/[0.06] hover:border-red-500/25 rounded-full text-sm transition-all cursor-pointer whitespace-nowrap"
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
