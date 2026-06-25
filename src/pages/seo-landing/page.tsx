import { Link } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import SEO, { SITE_URL } from '@/components/base/SEO';

type LandingConfig = {
  title: string;
  h1: string;
  description: string;
  keywords: string;
  primaryHref: string;
  primaryLabel: string;
  sections: Array<{ title: string; body: string }>;
  related: Array<{ label: string; href: string }>;
};

const LANDINGS: Record<string, LandingConfig> = {
  'xem-phim-online': {
    title: 'Xem Phim Online Vietsub HD Miễn Phí | KhoPhim',
    h1: 'Xem phim online Vietsub HD miễn phí',
    description: 'Xem phim online miễn phí tại KhoPhim với phim lẻ, phim bộ, phim chiếu rạp, anime, TV shows Vietsub HD cập nhật mỗi ngày.',
    keywords: 'xem phim online, xem phim online miễn phí, xem phim online mien phi, xem phim Vietsub, xem phim HD, KhoPhim',
    primaryHref: '/phim-moi-nhat',
    primaryLabel: 'Xem phim mới cập nhật',
    sections: [
      { title: 'Kho phim online cập nhật mỗi ngày', body: 'KhoPhim tập trung vào tốc độ tải nhanh, giao diện dễ dùng trên điện thoại và máy tính, đồng thời ưu tiên các phim có thông tin rõ ràng, poster đẹp, tập mới và chất lượng xem ổn định.' },
      { title: 'Tìm phim bằng tiếng Việt hoặc không dấu', body: 'Người xem có thể tìm tên phim có dấu, không dấu, tên tiếng Anh, tên gốc hoặc một phần tên phim. Các trang phim cũng được tối ưu để Google hiểu nhiều biến thể tìm kiếm tự nhiên.' },
      { title: 'Phù hợp cho người xem phim hằng ngày', body: 'Các danh mục như phim lẻ, phim bộ, phim chiếu rạp, anime, phim Hàn Quốc, phim Trung Quốc và Vũ Trụ Đam Mỹ đều được liên kết nội bộ để người xem dễ chuyển qua lại.' },
    ],
    related: [
      { label: 'Phim mới nhất', href: '/phim-moi-nhat' },
      { label: 'Phim lẻ', href: '/phim-le' },
      { label: 'Phim bộ', href: '/phim-bo' },
      { label: 'Tìm kiếm phim', href: '/search' },
    ],
  },
  'phim-vietsub': {
    title: 'Phim Vietsub HD - Xem Phim Phụ Đề Việt | KhoPhim',
    h1: 'Phim Vietsub HD phụ đề Việt',
    description: 'Tổng hợp phim Vietsub HD có phụ đề tiếng Việt: phim lẻ, phim bộ, phim chiếu rạp, anime, phim Hàn, Trung, Âu Mỹ và Thái Lan.',
    keywords: 'phim Vietsub, phim vietsub, xem phim Vietsub, xem phim vietsub, phim phụ đề Việt, phim phu de Viet, KhoPhim',
    primaryHref: '/phim-moi-nhat',
    primaryLabel: 'Xem phim Vietsub mới',
    sections: [
      { title: 'Ưu tiên phụ đề dễ xem', body: 'Trang phim được trình bày rõ ràng để người xem nhanh chóng biết phim đang có Vietsub, tập mới, trạng thái và chất lượng phát hiện có.' },
      { title: 'Phủ nhiều quốc gia và thể loại', body: 'KhoPhim liên kết các nhóm phim Hàn Quốc, Trung Quốc, Âu Mỹ, Nhật Bản, Thái Lan, Việt Nam, anime và phim đam mỹ để tăng khả năng tìm thấy nội dung phù hợp.' },
      { title: 'SEO theo cả có dấu và không dấu', body: 'Các từ khóa Vietsub được tối ưu ở cả dạng tiếng Việt có dấu và không dấu, giúp Google hiểu các truy vấn như phim vietsub, phim phụ đề Việt hoặc xem phim Vietsub HD.' },
    ],
    related: [
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
      { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' },
      { label: 'Anime Vietsub', href: '/anime' },
      { label: 'Vũ Trụ Đam Mỹ', href: '/vu-tru-dam-my' },
    ],
  },
  'phim-thuyet-minh': {
    title: 'Phim Thuyết Minh HD - Xem Phim Lồng Tiếng Việt | KhoPhim',
    h1: 'Phim thuyết minh và lồng tiếng Việt',
    description: 'Xem phim thuyết minh, phim lồng tiếng Việt và phim Vietsub HD trên KhoPhim, cập nhật nhiều phim hay dễ xem cho mọi thiết bị.',
    keywords: 'phim thuyết minh, phim thuyet minh, xem phim thuyết minh, phim lồng tiếng, phim long tieng, phim tiếng Việt, KhoPhim',
    primaryHref: '/filter',
    primaryLabel: 'Lọc phim cần xem',
    sections: [
      { title: 'Dễ xem cho mọi đối tượng', body: 'Nhóm phim thuyết minh và lồng tiếng phù hợp cho người xem không muốn đọc phụ đề hoặc muốn xem phim trên TV, điện thoại trong thời gian dài.' },
      { title: 'Liên kết với phim bộ và phim lẻ', body: 'Người xem có thể bắt đầu từ trang này rồi chuyển nhanh sang phim bộ, phim lẻ, phim chiếu rạp hoặc tìm kiếm theo tên phim cụ thể.' },
      { title: 'Tín hiệu SEO tự nhiên', body: 'Trang sử dụng cụm từ tự nhiên thay vì nhồi từ khóa, giúp nội dung dễ đọc và phù hợp với cách Google đánh giá chất lượng trang.' },
    ],
    related: [
      { label: 'Phim bộ', href: '/phim-bo' },
      { label: 'Phim lẻ', href: '/phim-le' },
      { label: 'Phim chiếu rạp', href: '/phim-chieu-rap' },
      { label: 'Tìm phim', href: '/search' },
    ],
  },
  'phim-long-tieng': {
    title: 'Phim Lồng Tiếng Việt HD | KhoPhim',
    h1: 'Phim lồng tiếng Việt HD',
    description: 'Kho phim lồng tiếng Việt, phim thuyết minh và phim Vietsub HD dễ xem trên điện thoại, máy tính và TV.',
    keywords: 'phim lồng tiếng, phim long tieng, xem phim lồng tiếng, phim thuyết minh, phim tiếng Việt, KhoPhim',
    primaryHref: '/filter',
    primaryLabel: 'Lọc phim lồng tiếng',
    sections: [
      { title: 'Tập trung trải nghiệm nghe nhìn', body: 'Các trang phim được thiết kế để người xem nhanh chóng vào phần phát phim, chọn tập và tiếp tục xem trên nhiều thiết bị.' },
      { title: 'Nội dung liên quan rõ ràng', body: 'Trang liên kết tới phim bộ, phim lẻ, phim Hàn Quốc, phim Trung Quốc và các danh mục phổ biến để tăng khả năng khám phá.' },
      { title: 'Tối ưu cho truy vấn không dấu', body: 'Người dùng tìm phim long tieng, phim long tieng viet hoặc phim thuyet minh vẫn có tín hiệu SEO tương ứng.' },
    ],
    related: [
      { label: 'Phim thuyết minh', href: '/phim-thuyet-minh' },
      { label: 'Phim Vietsub', href: '/phim-vietsub' },
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
      { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' },
    ],
  },
  'phim-full-hd': {
    title: 'Phim Full HD - Xem Phim HD Nét | KhoPhim',
    h1: 'Phim Full HD chất lượng cao',
    description: 'Xem phim Full HD, phim HD Vietsub, phim chiếu rạp, phim bộ và anime chất lượng cao trên KhoPhim.',
    keywords: 'phim Full HD, phim full hd, xem phim Full HD, phim HD, phim nét, phim net, xem phim HD, KhoPhim',
    primaryHref: '/phim-moi-nhat',
    primaryLabel: 'Xem phim HD mới',
    sections: [
      { title: 'Ưu tiên poster và thông tin rõ nét', body: 'KhoPhim tối ưu ảnh poster, ảnh nền, tiêu đề và mô tả phim để người xem dễ nhận diện nội dung trước khi bấm xem.' },
      { title: 'Tối ưu tải trang', body: 'Các tài nguyên được chia nhỏ và tải lười để ưu tiên phần trên màn hình, giúp người xem vào trang nhanh hơn mà vẫn giữ chất lượng hình ảnh tốt.' },
      { title: 'Phù hợp truy vấn chất lượng phim', body: 'Trang phủ các cụm từ như phim HD, phim Full HD, xem phim nét, xem phim chất lượng cao và biến thể không dấu.' },
    ],
    related: [
      { label: 'Phim chiếu rạp', href: '/phim-chieu-rap' },
      { label: 'Phim lẻ', href: '/phim-le' },
      { label: 'Phim bộ', href: '/phim-bo' },
      { label: 'Phim mới nhất', href: '/phim-moi-nhat' },
    ],
  },
  'phim-hay': {
    title: 'Phim Hay - Xem Phim Hay Chọn Lọc | KhoPhim',
    h1: 'Phim hay chọn lọc trên KhoPhim',
    description: 'Khám phá phim hay, phim hot, phim mới cập nhật, phim lẻ, phim bộ và phim chiếu rạp đáng xem trên KhoPhim.',
    keywords: 'phim hay, xem phim hay, phim hot, phim mới, phim moi, phim đáng xem, phim dang xem, KhoPhim',
    primaryHref: '/phim-hot-2026',
    primaryLabel: 'Xem phim hot',
    sections: [
      { title: 'Tổng hợp nội dung đáng xem', body: 'Trang này gom các hướng tìm phim phổ biến: phim hot, phim mới, phim chiếu rạp, phim bộ đang cập nhật và phim lẻ được quan tâm.' },
      { title: 'Tìm nhanh theo nhu cầu', body: 'Người xem có thể đi tiếp sang phim Hàn, phim Trung, phim Âu Mỹ, anime hoặc Vũ Trụ Đam Mỹ tùy gu xem phim.' },
      { title: 'Hỗ trợ Google hiểu chủ đề', body: 'Các liên kết nội bộ và mô tả rõ ràng giúp Google hiểu KhoPhim là một hệ thống xem phim online có cấu trúc chứ không chỉ là một trang chủ đơn lẻ.' },
    ],
    related: [
      { label: 'Phim hot 2026', href: '/phim-hot-2026' },
      { label: 'Phim mới nhất', href: '/phim-moi-nhat' },
      { label: 'Phim chiếu rạp', href: '/phim-chieu-rap' },
      { label: 'Top phim hôm nay', href: '/' },
    ],
  },
  'phim-2026': {
    title: 'Phim 2026 - Xem Phim Mới 2026 Vietsub HD | KhoPhim',
    h1: 'Phim 2026 mới cập nhật',
    description: 'Danh sách phim 2026 mới, phim hot 2026, phim chiếu rạp 2026, phim bộ 2026 và anime 2026 Vietsub HD trên KhoPhim.',
    keywords: 'phim 2026, phim mới 2026, phim moi 2026, phim hot 2026, xem phim 2026, phim chiếu rạp 2026, KhoPhim',
    primaryHref: '/phim-hot-2026',
    primaryLabel: 'Xem phim hot 2026',
    sections: [
      { title: 'Cập nhật phim mới trong năm', body: 'KhoPhim ưu tiên các phim mới phát hành, phim đang chiếu, phim chiếu rạp và phim bộ có tập mới trong năm 2026.' },
      { title: 'Có cả phim đã chiếu và sắp chiếu', body: 'Người xem có thể theo dõi phim đã có tập, phim full, trailer và lịch chiếu của các phim mới đáng chú ý.' },
      { title: 'Tối ưu cho truy vấn theo năm', body: 'Trang phủ các cụm phim 2026, phim moi 2026, phim hot 2026 và phim chiếu rạp 2026 theo cấu trúc rõ ràng.' },
    ],
    related: [
      { label: 'Phim hot 2026', href: '/phim-hot-2026' },
      { label: 'Phim sắp chiếu', href: '/phim-sap-chieu' },
      { label: 'Phim chiếu rạp', href: '/phim-chieu-rap' },
      { label: 'Phim mới nhất', href: '/phim-moi-nhat' },
    ],
  },
  'phim-2025': {
    title: 'Phim 2025 - Xem Lại Phim Hay 2025 | KhoPhim',
    h1: 'Phim 2025 hay và đáng xem',
    description: 'Tổng hợp phim 2025 hay, phim lẻ 2025, phim bộ 2025, phim chiếu rạp 2025 và anime 2025 Vietsub HD.',
    keywords: 'phim 2025, phim hay 2025, phim le 2025, phim bo 2025, phim chieu rap 2025, KhoPhim',
    primaryHref: '/phim-le',
    primaryLabel: 'Xem phim lẻ hay',
    sections: [
      { title: 'Kho phim theo năm phát hành', body: 'Trang giúp Google và người xem hiểu rõ nhóm phim theo mốc thời gian, phù hợp với các truy vấn tìm lại phim hay của năm trước.' },
      { title: 'Liên kết tới danh mục chính', body: 'Người xem có thể chuyển sang phim lẻ, phim bộ, phim chiếu rạp hoặc tìm kiếm tên phim cụ thể nếu đã nhớ tên.' },
      { title: 'Không tạo nội dung trùng lặp', body: 'Nội dung được viết theo mục đích tìm phim 2025, khác với trang phim mới nhất hoặc phim hot 2026.' },
    ],
    related: [
      { label: 'Phim lẻ', href: '/phim-le' },
      { label: 'Phim bộ', href: '/phim-bo' },
      { label: 'Phim chiếu rạp', href: '/phim-chieu-rap' },
      { label: 'Tìm kiếm phim', href: '/search' },
    ],
  },
  'phim-2024': {
    title: 'Phim 2024 - Xem Phim Hay 2024 Vietsub HD | KhoPhim',
    h1: 'Phim 2024 Vietsub HD',
    description: 'Xem lại phim 2024 hay, phim chiếu rạp 2024, phim bộ 2024 và anime 2024 Vietsub HD trên KhoPhim.',
    keywords: 'phim 2024, phim hay 2024, xem phim 2024, phim chieu rap 2024, phim bo 2024, KhoPhim',
    primaryHref: '/phim-le',
    primaryLabel: 'Xem phim 2024',
    sections: [
      { title: 'Phù hợp người tìm phim cũ hơn', body: 'Nhiều người không tìm theo tên phim mà tìm theo năm phát hành. Trang này giúp bắt nhóm truy vấn phim 2024 một cách tự nhiên.' },
      { title: 'Dẫn người xem về kho phim chính', body: 'Các liên kết nội bộ đưa người xem về phim lẻ, phim bộ, phim chiếu rạp và bộ lọc để tiếp tục khám phá.' },
      { title: 'Có dấu và không dấu', body: 'Các biến thể phim 2024, xem phim 2024, phim hay 2024 đều được giữ trong metadata và nội dung.' },
    ],
    related: [
      { label: 'Phim lẻ', href: '/phim-le' },
      { label: 'Phim bộ', href: '/phim-bo' },
      { label: 'Phim Âu Mỹ', href: '/phim-au-my' },
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
    ],
  },
  'phim-4k': {
    title: 'Phim 4K - Xem Phim Chất Lượng Cao | KhoPhim',
    h1: 'Phim 4K và phim chất lượng cao',
    description: 'Tìm phim 4K, phim Full HD, phim HD chất lượng cao, phim chiếu rạp và phim lẻ nét trên KhoPhim.',
    keywords: 'phim 4K, phim 4k, xem phim 4K, phim chất lượng cao, phim chat luong cao, phim Full HD, KhoPhim',
    primaryHref: '/phim-full-hd',
    primaryLabel: 'Xem phim Full HD',
    sections: [
      { title: 'Tập trung vào chất lượng xem', body: 'Trang này phục vụ người dùng quan tâm đến độ nét, poster đẹp, thông tin rõ ràng và trải nghiệm xem phim ổn định.' },
      { title: 'Liên kết tới phim HD và phim rạp', body: 'Các phim có nhu cầu chất lượng cao thường nằm trong phim chiếu rạp, phim lẻ và phim mới cập nhật.' },
      { title: 'Không cam kết sai chất lượng nguồn', body: 'KhoPhim ưu tiên nguồn rõ và nét nhất có thể, đồng thời tránh mô tả quá mức nếu nguồn phim phụ thuộc host bên ngoài.' },
    ],
    related: [
      { label: 'Phim Full HD', href: '/phim-full-hd' },
      { label: 'Phim chiếu rạp', href: '/phim-chieu-rap' },
      { label: 'Phim lẻ', href: '/phim-le' },
      { label: 'Phim mới nhất', href: '/phim-moi-nhat' },
    ],
  },
  'phim-hoan-tat': {
    title: 'Phim Hoàn Tất - Xem Phim Full Trọn Bộ | KhoPhim',
    h1: 'Phim hoàn tất, phim full trọn bộ',
    description: 'Xem phim hoàn tất, phim full, phim trọn bộ Vietsub HD, phim bộ đã đủ tập và phim lẻ xem ngay trên KhoPhim.',
    keywords: 'phim hoàn tất, phim hoan tat, phim full, phim trọn bộ, phim tron bo, xem phim full, KhoPhim',
    primaryHref: '/phim-bo',
    primaryLabel: 'Xem phim bộ',
    sections: [
      { title: 'Dành cho người muốn xem liền mạch', body: 'Nhóm phim hoàn tất phù hợp với người xem muốn chọn phim đã đủ tập, không phải chờ cập nhật tập mới.' },
      { title: 'Liên quan mạnh tới phim bộ', body: 'Các truy vấn phim full, phim trọn bộ, phim hoàn tất thường gắn với phim bộ Hàn, Trung, Thái và series Âu Mỹ.' },
      { title: 'Giúp giảm nhầm lẫn tập phim', body: 'Landing này cũng tạo đường dẫn rõ cho người dùng đang muốn tìm phim đã có đủ tập để xem ngay.' },
    ],
    related: [
      { label: 'Phim bộ', href: '/phim-bo' },
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
      { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' },
      { label: 'TV Shows', href: '/tv-shows' },
    ],
  },
  'phim-dang-chieu': {
    title: 'Phim Đang Chiếu - Phim Đang Cập Nhật Tập Mới | KhoPhim',
    h1: 'Phim đang chiếu và đang cập nhật',
    description: 'Theo dõi phim đang chiếu, phim đang cập nhật tập mới, phim bộ mới, anime mùa mới và phim hot trên KhoPhim.',
    keywords: 'phim đang chiếu, phim dang chieu, phim đang cập nhật, phim dang cap nhat, phim tập mới, phim tap moi, KhoPhim',
    primaryHref: '/phim-moi-cap-nhat',
    primaryLabel: 'Xem phim mới cập nhật',
    sections: [
      { title: 'Theo dõi tập mới nhanh', body: 'Trang này phục vụ người xem đang chờ tập mới của phim bộ, anime, BL hoặc phim truyền hình đang phát sóng.' },
      { title: 'Liên kết tới lịch cập nhật', body: 'Người xem có thể chuyển sang phim mới cập nhật, phim bộ, anime hoặc Vũ Trụ Đam Mỹ để xem danh sách phù hợp.' },
      { title: 'Tối ưu từ khóa trạng thái phim', body: 'Các cụm phim đang chiếu, phim đang cập nhật, phim tập mới và biến thể không dấu được đưa vào nội dung tự nhiên.' },
    ],
    related: [
      { label: 'Phim mới cập nhật', href: '/phim-moi-cap-nhat' },
      { label: 'Phim bộ', href: '/phim-bo' },
      { label: 'Anime', href: '/anime' },
      { label: 'Vũ Trụ Đam Mỹ', href: '/vu-tru-dam-my' },
    ],
  },
  'phim-trailer': {
    title: 'Trailer Phim - Phim Sắp Chiếu Và Lịch Chiếu | KhoPhim',
    h1: 'Trailer phim và phim sắp chiếu',
    description: 'Xem trailer phim, lịch chiếu, thông tin phim sắp ra mắt, phim hot 2026 và nội dung phim mới trên KhoPhim.',
    keywords: 'trailer phim, phim trailer, phim sắp chiếu, phim sap chieu, lịch chiếu phim, lich chieu phim, KhoPhim',
    primaryHref: '/phim-sap-chieu',
    primaryLabel: 'Xem phim sắp chiếu',
    sections: [
      { title: 'Dành cho phim chưa phát hành', body: 'Các phim mới chỉ có trailer vẫn có thể có trang thông tin rõ ràng để Google hiểu nội dung, lịch chiếu và trạng thái phát hành.' },
      { title: 'Không làm lẫn với phim đã có tập', body: 'Trang tách rõ nhóm trailer, phim sắp chiếu và phim đã phát hành để người xem không bị nhầm khi bấm xem.' },
      { title: 'Tăng khả năng bắt trend sớm', body: 'Phim sắp chiếu và trailer thường có nhu cầu tìm kiếm trước ngày phát hành, nên đây là nhóm landing quan trọng cho SEO phim mới.' },
    ],
    related: [
      { label: 'Phim sắp chiếu', href: '/phim-sap-chieu' },
      { label: 'Phim hot 2026', href: '/phim-hot-2026' },
      { label: 'Phim chiếu rạp', href: '/phim-chieu-rap' },
      { label: 'Phim mới nhất', href: '/phim-moi-nhat' },
    ],
  },
};

interface SeoLandingPageProps {
  landingKey: string;
}

export default function SeoLandingPage({ landingKey }: SeoLandingPageProps) {
  const data = LANDINGS[landingKey] ?? LANDINGS['xem-phim-online'];
  const path = `/${landingKey}`;
  const canonical = `${SITE_URL}${path}`;
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: data.title,
      headline: data.h1,
      description: data.description,
      url: canonical,
      inLanguage: 'vi-VN',
      keywords: data.keywords,
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: data.h1, item: canonical },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.sections.map((section) => ({
        '@type': 'Question',
        name: section.title,
        acceptedAnswer: { '@type': 'Answer', text: section.body },
      })),
    },
  ];

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title={data.title}
        description={data.description}
        keywords={data.keywords}
        canonical={canonical}
        schema={schema}
      />
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <nav className="mb-5 flex items-center gap-2 text-xs text-white/40">
          <Link to="/" className="hover:text-white">Trang chủ</Link>
          <i className="ri-arrow-right-s-line" />
          <span>{data.h1}</span>
        </nav>

        <section className="border-b border-white/[0.08] pb-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-red-400">KhoPhim SEO</p>
          <h1 className="max-w-4xl text-3xl font-bold leading-tight md:text-5xl">{data.h1}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">{data.description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={data.primaryHref}
              className="rounded-lg bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-500"
            >
              {data.primaryLabel}
            </Link>
            <Link
              to="/search"
              className="rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              Tìm phim ngay
            </Link>
          </div>
        </section>

        <section className="grid gap-4 py-8 md:grid-cols-3">
          {data.sections.map((section) => (
            <article key={section.title} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-5">
              <h2 className="mb-3 text-lg font-bold text-white">{section.title}</h2>
              <p className="text-sm leading-6 text-white/60">{section.body}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-white/[0.08] bg-[#0d0f18] p-5">
          <h2 className="mb-4 text-lg font-bold">Danh mục liên quan</h2>
          <div className="flex flex-wrap gap-2">
            {data.related.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="rounded-full border border-white/[0.1] px-4 py-2 text-sm text-white/65 transition hover:border-red-500/40 hover:text-red-300"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
