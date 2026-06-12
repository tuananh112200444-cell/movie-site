import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import SEO, { SITE_URL } from '@/components/base/SEO';
import { fetchMoviesByCategory, fetchMoviesByType } from '@/services/movieApi';
import type { Movie } from '@/types/movie';
import CountryHeroBanner from './components/CountryHeroBanner';
import CountrySEOContent from './components/CountrySEOContent';
import { useLazySection } from '@/hooks/useLazySection';
import Pagination from '@/components/base/Pagination';

export interface CountryConfig {
  slug: string;
  name: string;
  nameEn: string;
  flag: string;
  type: 'phim-le' | 'phim-bo';
  path: string;
  bgImage: string;
  accentColor: string;
  accentBg: string;
  gradientFrom: string;
  gradientVia: string;
  tagline: string;
  description: string;
  keywords: string;
  seoDesc: string;
  seoIntro?: string;
  stats: { label: string; value: string; icon: string }[];
  highlights: string[];
  faq: { q: string; a: string }[];
  related: { label: string; href: string }[];
  reviews: { title: string; year: number; rating: string; review: string; genre: string }[];
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  'han-quoc': {
    slug: 'han-quoc',
    name: 'Phim Hàn Quốc',
    nameEn: 'Korean Drama',
    flag: '🇰🇷',
    type: 'phim-bo',
    path: '/phim-han-quoc',
    bgImage: 'https://readdy.ai/api/search-image?query=Seoul%20South%20Korea%20cityscape%20night%20panoramic%20view%20Han%20River%20bridge%20lights%20modern%20skyscrapers%20dramatic%20cinematic%20atmosphere%20dark%20moody&width=1400&height=500&seq=country-kr-hero-1&orientation=landscape',
    accentColor: 'text-pink-400',
    accentBg: 'bg-pink-500',
    gradientFrom: 'from-pink-600/40',
    gradientVia: 'via-rose-500/20',
    tagline: 'Xứ Sở Kim Chi — Nơi Sinh Ra Những Bộ Drama Làm Rung Chuyển Thế Giới',
    description: 'Từ romance ngọt ngào đến thriller tâm lý đỉnh cao — drama Hàn Quốc vietsub HD miễn phí',
    keywords: 'phim Hàn, phim han quoc, phim Hàn Quốc, drama Hàn, phim Hàn vietsub, phim han quoc vietsub, phim Hàn hay 2026',
    seoDesc: 'Xem 12.000+ drama Hàn Quốc vietsub HD miễn phí tại KhoPhim 2026. Romance, hành động, cổ trang, kinh dị – cập nhật tập mới nhanh nhất. Không quảng cáo, xem ngay!',
    seoIntro: 'KhoPhim là điểm đến hàng đầu để xem phim Hàn Quốc vietsub online miễn phí với chất lượng HD Full HD. Kho drama Hàn cực kỳ đa dạng: từ phim tình cảm lãng mạn ngọt ngào, phim hành động hình sự đến phim lịch sử cổ trang saeguk và kinh dị tâm lý mới nhất 2026. Tất cả phim Hàn đều có vietsub hoặc lồng tiếng Việt chuẩn, không quảng cáo, cập nhật cực nhanh sau khi phát sóng tại Hàn Quốc. Điện ảnh Hàn Quốc đã trở thành hiện tượng toàn cầu với những tác phẩm đỉnh cao như Squid Game, Crash Landing on You, My Mister, Signal – và KhoPhim là nơi bạn có thể xem tất cả miễn phí. Từ các đài truyền hình lớn như tvN, SBS, MBC đến các nền tảng streaming như Netflix Korea và Disney+ – mọi drama Hàn đều được cập nhật nhanh nhất tại khophim.org. Không cần đăng ký tài khoản, không giới hạn số tập, xem ngay trên trình duyệt hoặc điện thoại.',
    stats: [
      { label: 'Drama Hàn', value: '12K+', icon: 'ri-tv-2-line' },
      { label: 'Đài phát sóng', value: 'tvN/SBS/MBC', icon: 'ri-broadcast-line' },
      { label: 'Cập nhật', value: 'Sau phát sóng', icon: 'ri-time-line' },
      { label: 'Chất lượng', value: 'Full HD', icon: 'ri-hd-line' },
    ],
    highlights: [
      'Drama Hàn Quốc vietsub HD đầy đủ, không quảng cáo',
      'Cập nhật tập mới nhanh sau khi phát sóng tại Hàn',
      'Đa thể loại: romance, action, thriller, saeguk 2026',
      'Phim Hàn lẻ & bộ từ tvN, SBS, MBC, Netflix Korea',
      'Tìm kiếm phim theo tên diễn viên, đạo diễn Hàn',
    ],
    faq: [
      { q: 'Trang web nào xem phim Hàn Quốc vietsub miễn phí HD tốt nhất?', a: 'KhoPhim (khophim.org) là trang xem phim Hàn Quốc vietsub miễn phí tốt nhất 2026. Phim được cập nhật liên tục, chất lượng HD Full HD, phụ đề tiếng Việt chuẩn. Hoàn toàn miễn phí, không quảng cáo, không cần đăng ký.' },
      { q: 'Xem phim bộ Hàn Quốc hay nhất 2026 ở đâu miễn phí?', a: 'Tại KhoPhim, bạn có thể xem hàng nghìn phim bộ Hàn Quốc vietsub hay nhất từ trước đến nay. Từ Hậu Duệ Mặt Trời, Crash Landing On You đến các drama mới nhất 2026 đều có đầy đủ vietsub HD miễn phí.' },
      { q: 'KhoPhim có phim Hàn Quốc lồng tiếng không?', a: 'Ngoài vietsub, KhoPhim còn có nhiều phim Hàn Quốc được lồng tiếng Việt, phù hợp cho người xem không muốn đọc phụ đề.' },
      { q: 'Phim Hàn Quốc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp các phim Hàn Quốc được đánh giá cao nhất 2026 từ các thể loại: romance, thriller, cổ trang, hành động. Vào mục Phim Hàn Quốc để xem danh sách đầy đủ.' },
    ],
    related: [
      { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' },
      { label: 'Phim Nhật Bản', href: '/phim-nhat-ban' },
      { label: 'Phim Thái Lan', href: '/phim-thai-lan' },
      { label: 'Phim Âu Mỹ', href: '/phim-au-my' },
    ],
    reviews: [
      { title: 'My Mister (Anh Trai Của Tôi)', year: 2018, rating: '9.6/10', review: 'Nếu phải chọn một bộ phim Hàn Quốc để giới thiệu với người chưa từng xem phim Hàn, đó sẽ là My Mister. Không có cảnh hôn nhau, không có tình tiết lãng mạn sến súa – chỉ là hai con người cô đơn tìm thấy nhau trong im lặng. IU vào vai một cô gái trẻ mang gánh nặng cuộc đời quá sức, Lee Sun-kyun là người đàn ông trung niên đang chìm dần trong thất bại.', genre: 'Drama / Tâm lý' },
      { title: 'Signal (Tín Hiệu)', year: 2016, rating: '9.3/10', review: 'Signal là bằng chứng rằng phim hình sự Hàn Quốc có thể vượt xa mọi kỳ vọng. Ý tưởng về chiếc bộ đàm kết nối hai thám tử ở hai thời điểm khác nhau nghe có vẻ phi lý, nhưng biên kịch Kim Eun-hee đã biến nó thành công cụ để khám phá những vụ án lạnh chưa được giải quyết trong lịch sử Hàn Quốc.', genre: 'Hình sự / Khoa học viễn tưởng' },
    ],
  },
  'trung-quoc': {
    slug: 'trung-quoc',
    name: 'Phim Trung Quốc',
    nameEn: 'Chinese Drama',
    flag: '🇨🇳',
    type: 'phim-bo',
    path: '/phim-trung-quoc',
    bgImage: 'https://readdy.ai/api/search-image?query=ancient%20Chinese%20palace%20imperial%20architecture%20forbidden%20city%20dramatic%20sunset%20golden%20light%20cinematic%20epic%20fantasy%20wuxia%20atmosphere%20dark%20moody&width=1400&height=500&seq=country-cn-hero-1&orientation=landscape',
    accentColor: 'text-red-400',
    accentBg: 'bg-red-500',
    gradientFrom: 'from-red-700/40',
    gradientVia: 'via-orange-600/20',
    tagline: 'Đại Lục Phim Ảnh — Cổ Trang Hùng Tráng, Tiên Hiệp Kỳ Ảo, Hiện Đại Sôi Động',
    description: 'Cổ trang hoàng cung, tiên hiệp tu tiên, ngôn tình hiện đại — phim Trung Quốc vietsub HD miễn phí',
    keywords: 'phim Trung, phim trung quoc, phim Trung Quốc, phim cổ trang, tien hiep, tiên hiệp, phim Trung vietsub',
    seoDesc: 'Xem 20.000+ phim Trung Quốc vietsub HD miễn phí tại KhoPhim 2026. Cổ trang hoàng cung, tiên hiệp tu tiên, ngôn tình hiện đại. Cập nhật liên tục, xem ngay!',
    seoIntro: 'KhoPhim mang đến kho phim Trung Quốc phong phú nhất với đầy đủ thể loại: phim cổ trang hoàng cung đình đám, tiên hiệp tu tiên kỳ ảo, phim hiện đại tình cảm ngôn tình và hành động đô thị sôi động. Tất cả phim Trung Quốc tại khophim.org đều có phụ đề tiếng Việt hoặc lồng tiếng, chất lượng HD Full HD, cập nhật liên tục hàng ngày. Điện ảnh Trung Quốc nổi tiếng với những bộ phim cổ trang hoành tráng như Diên Hi Công Lược, Hạo Y Hành, Thượng Dương Phú – những tác phẩm tái hiện cung đình lộng lẫy với phục trang tinh xảo và cốt truyện hấp dẫn. Bên cạnh đó, thể loại tiên hiệp tu tiên với những thế giới huyền ảo như Hương Mật Tựa Khói Sương, Trần Tình Lệnh, Tiên Kiếm Kỳ Hiệp cũng được yêu thích rộng rãi. Nguồn phim từ các nền tảng lớn nhất Trung Quốc như iQIYI, Youku, Tencent Video đảm bảo chất lượng hình ảnh và âm thanh tốt nhất. Xem phim Trung Quốc tại KhoPhim hoàn toàn miễn phí, không cần đăng ký.',
    stats: [
      { label: 'Phim Trung', value: '20K+', icon: 'ri-ancient-gate-line' },
      { label: 'Thể loại', value: 'Cổ trang/Tiên hiệp', icon: 'ri-sword-line' },
      { label: 'Nguồn', value: 'iQIYI/Youku', icon: 'ri-play-circle-line' },
      { label: 'Cập nhật', value: 'Hàng ngày', icon: 'ri-time-line' },
    ],
    highlights: [
      'Phim cổ trang Trung Quốc vietsub đầy đủ',
      'Tiên hiệp, tu tiên, kiếm hiệp hay nhất',
      'Phim hiện đại ngôn tình, hành động',
      'Từ iQIYI, Youku, Tencent Video',
      'Cập nhật tập mới liên tục không gián đoạn',
    ],
    faq: [
      { q: 'Phim cổ trang Trung Quốc hay nhất hiện nay là gì?', a: 'KhoPhim cập nhật liên tục phim cổ trang Trung Quốc mới nhất và hay nhất. Các bom tấn như Diên Hi Công Lược, Hạo Y Hành, Thượng Dương Phú đều có đầy đủ tại KhoPhim.' },
      { q: 'Xem phim tiên hiệp Trung Quốc vietsub ở đâu?', a: 'KhoPhim (khophim.org) có kho phim tiên hiệp Trung Quốc cực kỳ đồ sộ với vietsub chuẩn và chất lượng HD. Từ Tiên Kiếm Kỳ Hiệp, Hoa Thiên Cốt đến các phim tu tiên mới nhất 2026 đều có tại đây.' },
      { q: 'KhoPhim có phim ngôn tình Trung Quốc không?', a: 'KhoPhim có đầy đủ phim ngôn tình Trung Quốc vietsub HD, từ cổ trang lãng mạn đến hiện đại. Cập nhật liên tục hàng ngày.' },
      { q: 'Phim Trung Quốc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim Trung Quốc được đánh giá cao nhất 2026 từ cổ trang, tiên hiệp đến hiện đại. Vào mục Phim Trung Quốc để khám phá.' },
    ],
    related: [
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
      { label: 'Phim Nhật Bản', href: '/phim-nhat-ban' },
      { label: 'Phim Bộ', href: '/phim-bo' },
      { label: 'Phim Lẻ', href: '/phim-le' },
    ],
    reviews: [
      { title: 'Trường Phong Độ', year: 2022, rating: '8.9/10', review: 'Trong biển phim cổ trang Trung Quốc tràn ngập cung đấu và tình yêu sến súa, Trường Phong Độ là làn gió lạ. Bộ phim lấy bối cảnh thời Tam Quốc nhưng không tập trung vào những anh hùng nổi tiếng – thay vào đó là câu chuyện về hai điệp viên bình thường bị kẹt giữa hai thế lực.', genre: 'Cổ trang / Gián điệp' },
      { title: 'Hương Mật Tựa Khói Sương', year: 2018, rating: '8.7/10', review: 'Hương Mật Tựa Khói Sương là đỉnh cao của thể loại tiên hiệp ngôn tình Trung Quốc. Điều khiến bộ phim này vượt trội so với hàng trăm tác phẩm cùng thể loại là chiều sâu cảm xúc – tình yêu giữa Bạch Phượng Cửu và Dạ Hoa không phải là tình yêu sét đánh mà là sự gắn kết qua hàng nghìn năm và vô số kiếp nạn.', genre: 'Tiên hiệp / Tình cảm' },
    ],
  },
  'au-my': {
    slug: 'au-my',
    name: 'Phim Âu Mỹ',
    nameEn: 'Western Movies',
    flag: '🇺🇸',
    type: 'phim-le',
    path: '/phim-au-my',
    bgImage: 'https://readdy.ai/api/search-image?query=Hollywood%20sign%20Los%20Angeles%20California%20night%20cityscape%20dramatic%20cinematic%20aerial%20view%20dark%20moody%20atmosphere%20epic%20blockbuster%20movie%20production&width=1400&height=500&seq=country-us-hero-1&orientation=landscape',
    accentColor: 'text-sky-400',
    accentBg: 'bg-sky-500',
    gradientFrom: 'from-sky-700/40',
    gradientVia: 'via-indigo-600/20',
    tagline: 'Hollywood — Kinh Đô Điện Ảnh Thế Giới, Nơi Những Bom Tấn Được Sinh Ra',
    description: 'Bom tấn Marvel, DC, blockbuster Hollywood — phim Âu Mỹ vietsub HD Full HD miễn phí',
    keywords: 'phim Mỹ, phim au my, phim Âu Mỹ, phim Hollywood, phim Marvel, phim DC vietsub',
    seoDesc: 'Xem 8.000+ phim Âu Mỹ vietsub HD miễn phí tại KhoPhim 2026. Bom tấn Hollywood, Marvel, DC, series Netflix HBO mới nhất. Cập nhật nhanh, xem ngay!',
    seoIntro: 'KhoPhim cung cấp kho phim Âu Mỹ khổng lồ với hàng nghìn bộ phim Hollywood và châu Âu chất lượng cao. Từ các bom tấn Marvel Cinematic Universe, DC Extended Universe, phim hành động thế giới đến phim tình cảm lãng mạn, kinh dị, khoa học viễn tưởng – tất cả đều có tại khophim.org với chất lượng HD Full HD, phụ đề tiếng Việt hoặc lồng tiếng. Hollywood là kinh đô điện ảnh thế giới với những tác phẩm kinh điển như The Shawshank Redemption, Interstellar, The Dark Knight – và những bom tấn mới nhất 2026 đều được cập nhật nhanh nhất tại KhoPhim. Vũ trụ điện ảnh Marvel (MCU) với hơn 30 bộ phim từ Iron Man đến Avengers: Endgame đều có đầy đủ. Ngoài phim lẻ, KhoPhim còn có các TV series đình đám từ Netflix, HBO, Disney+ như Breaking Bad, Game of Thrones, Stranger Things với vietsub chuẩn. Xem phim Âu Mỹ tại KhoPhim hoàn toàn miễn phí, không quảng cáo, không cần đăng ký tài khoản.',
    stats: [
      { label: 'Phim Âu Mỹ', value: '8K+', icon: 'ri-earth-line' },
      { label: 'Marvel/DC', value: 'Đầy đủ', icon: 'ri-shield-star-line' },
      { label: 'Chất lượng', value: '4K/HDR', icon: 'ri-hd-line' },
      { label: 'Cập nhật', value: 'Sau ra rạp', icon: 'ri-time-line' },
    ],
    highlights: [
      'Bom tấn Hollywood HD Full HD mới nhất',
      'Marvel, DC, Disney, Universal đầy đủ',
      'Phim lẻ & phim bộ Âu Mỹ vietsub',
      'Cập nhật phim chiếu rạp sau khi ra mắt',
      'Âm thanh & hình ảnh sắc nét chất lượng cao',
    ],
    faq: [
      { q: 'Xem phim Mỹ online HD miễn phí không quảng cáo ở đâu?', a: 'KhoPhim (khophim.org) là trang xem phim Mỹ và phim Âu Mỹ online miễn phí tốt nhất 2026, chất lượng HD Full HD, không có quảng cáo phiền phức.' },
      { q: 'Phim Marvel và DC mới nhất xem ở đâu?', a: 'Toàn bộ vũ trụ điện ảnh Marvel (MCU) và DC đều có đầy đủ tại KhoPhim với chất lượng HD, vietsub chuẩn. Từ các phim cũ đến bom tấn mới nhất đều được cập nhật nhanh chóng.' },
      { q: 'KhoPhim có phim Netflix Mỹ không?', a: 'KhoPhim có đầy đủ phim và series từ Netflix, HBO, Disney+ với vietsub HD. Cập nhật liên tục hàng ngày.' },
      { q: 'Phim Âu Mỹ hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp các phim Âu Mỹ được đánh giá cao nhất 2026 từ action, sci-fi, drama đến comedy. Vào mục Phim Âu Mỹ để xem danh sách.' },
    ],
    related: [
      { label: 'Phim Lẻ', href: '/phim-le' },
      { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' },
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
      { label: 'TV Shows', href: '/tv-shows' },
    ],
    reviews: [
      { title: 'Interstellar', year: 2014, rating: '9.3/10', review: 'Interstellar là bộ phim khoa học viễn tưởng duy nhất khiến người xem vừa hiểu vật lý thiên văn vừa khóc vì tình phụ tử. Christopher Nolan đã hợp tác với nhà vật lý lý thuyết Kip Thorne để tạo ra hình ảnh lỗ đen chính xác nhất từng xuất hiện trên màn ảnh.', genre: 'Khoa học viễn tưởng / Drama' },
      { title: 'The Shawshank Redemption', year: 1994, rating: '9.8/10', review: 'Sau hơn 30 năm, Nhà Tù Shawshank vẫn đứng đầu danh sách phim hay nhất mọi thời đại trên IMDb. Frank Darabont đã chuyển thể truyện ngắn của Stephen King thành một bài ca về hy vọng không bao giờ tắt.', genre: 'Drama / Tội phạm' },
    ],
  },
  'nhat-ban': {
    slug: 'nhat-ban',
    name: 'Phim Nhật Bản',
    nameEn: 'Japanese Drama & Anime',
    flag: '🇯🇵',
    type: 'phim-bo',
    path: '/phim-nhat-ban',
    bgImage: 'https://readdy.ai/api/search-image?query=Tokyo%20Japan%20night%20cityscape%20cherry%20blossom%20sakura%20anime%20style%20cinematic%20dramatic%20neon%20lights%20futuristic%20dark%20moody%20atmosphere&width=1400&height=500&seq=country-jp-hero-1&orientation=landscape',
    accentColor: 'text-rose-400',
    accentBg: 'bg-rose-500',
    gradientFrom: 'from-rose-700/40',
    gradientVia: 'via-pink-600/20',
    tagline: 'Đất Nước Mặt Trời Mọc — Anime Huyền Thoại, J-Drama Tinh Tế, Điện Ảnh Đỉnh Cao',
    description: 'Anime mùa mới, J-Drama tinh tế, phim điện ảnh đoạt giải — phim Nhật Bản vietsub HD miễn phí',
    keywords: 'anime, phim Nhật, phim nhat ban, phim Nhật Bản, anime vietsub, j-drama, phim nhat hay',
    seoDesc: 'Xem 6.000+ anime và phim Nhật Bản vietsub HD miễn phí tại KhoPhim 2026. Anime mùa mới, j-drama, điện ảnh Nhật. Cập nhật hàng tuần, xem ngay!',
    seoIntro: 'KhoPhim là kho anime và phim Nhật Bản trực tuyến lớn nhất với chất lượng HD, phụ đề tiếng Việt đầy đủ. Từ anime hành động shounen đỉnh cao như Attack on Titan, Demon Slayer, Jujutsu Kaisen đến anime tình cảm lãng mạn, isekai phiêu lưu và slice of life nhẹ nhàng – tất cả đều có tại khophim.org. Điện ảnh Nhật Bản nổi tiếng với những tác phẩm bất hủ của Studio Ghibli như Spirited Away, My Neighbor Totoro, Princess Mononoke – những bộ phim hoạt hình đã giành giải Oscar và được yêu thích trên toàn thế giới. Bên cạnh anime, KhoPhim còn có j-drama Nhật Bản đa dạng thể loại: từ drama tình cảm lãng mạn, hình sự hành động đến drama y tế và học đường. Anime mùa mới 2026 được cập nhật hàng tuần ngay sau khi phát sóng tại Nhật Bản với vietsub chuẩn. Xem phim Nhật Bản và anime tại KhoPhim hoàn toàn miễn phí, không quảng cáo, không cần đăng ký.',
    stats: [
      { label: 'Anime', value: '6K+', icon: 'ri-sword-line' },
      { label: 'Mùa mới', value: '2026', icon: 'ri-calendar-line' },
      { label: 'Studio', value: 'Ufotable/MAPPA', icon: 'ri-film-line' },
      { label: 'Cập nhật', value: 'Hàng tuần', icon: 'ri-time-line' },
    ],
    highlights: [
      'Anime Nhật Bản vietsub & lồng tiếng',
      'J-drama Nhật Bản đa dạng thể loại',
      'Phim điện ảnh Nhật Bản đoạt giải',
      'Cập nhật tập anime mới hàng tuần',
      'Tìm kiếm theo tên tiếng Nhật & tiếng Việt',
    ],
    faq: [
      { q: 'Trang web xem anime vietsub HD tốt nhất là gì?', a: 'KhoPhim (khophim.org) là một trong những trang xem anime vietsub HD tốt nhất hiện nay. Kho anime cực kỳ đa dạng từ các thể loại shounen, romance, isekai, slice of life đến các anime kinh điển và mới nhất 2026.' },
      { q: 'Xem phim Nhật Bản lồng tiếng Việt ở đâu?', a: 'KhoPhim có đầy đủ phim Nhật Bản với cả vietsub và lồng tiếng Việt. Từ anime cho trẻ em đến phim người lớn, j-drama tình cảm đến phim hành động – tất cả đều miễn phí và không quảng cáo.' },
      { q: 'Anime mùa mới 2026 có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật anime mùa mới 2026 nhanh nhất với vietsub đầy đủ. Từ shounen, shoujo, isekai đến slice of life đều có đủ.' },
      { q: 'KhoPhim có phim điện ảnh Nhật Bản không?', a: 'Ngoài anime, KhoPhim còn có phim điện ảnh Nhật Bản, j-drama vietsub HD. Từ phim của Studio Ghibli đến các tác phẩm điện ảnh nổi tiếng.' },
    ],
    related: [
      { label: 'Hoạt Hình', href: '/hoat-hinh' },
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
      { label: 'Phim Trung Quốc', href: '/phim-trung-quoc' },
      { label: 'TV Shows', href: '/tv-shows' },
    ],
    reviews: [
      { title: 'Spirited Away (Vùng Đất Linh Hồn)', year: 2001, rating: '9.7/10', review: 'Hayao Miyazaki đã tạo ra một thế giới không thể tưởng tượng được – và rồi khiến nó trở nên hoàn toàn có thật. Vùng Đất Linh Hồn là hành trình trưởng thành của cô bé Chihiro trong một thế giới thần linh kỳ bí. Đây là phim hoạt hình duy nhất không phải tiếng Anh giành Oscar Phim Hoạt Hình Xuất Sắc Nhất.', genre: 'Hoạt hình / Fantasy' },
      { title: 'Your Name (Tên Cậu Là Gì?)', year: 2016, rating: '9.1/10', review: 'Makoto Shinkai đã làm điều mà nhiều đạo diễn mơ ước: tạo ra một bộ phim hoạt hình vừa đẹp đến nghẹt thở vừa kể một câu chuyện tình yêu không thể quên. Tên Cậu Là Gì? không chỉ là phim về hai người hoán đổi thân xác – đó là câu chuyện về sự kết nối vượt qua không gian và thời gian.', genre: 'Hoạt hình / Tình cảm' },
    ],
  },
  'thai-lan': {
    slug: 'thai-lan',
    name: 'Phim Thái Lan',
    nameEn: 'Thai Drama',
    flag: '🇹🇭',
    type: 'phim-bo',
    path: '/phim-thai-lan',
    bgImage: 'https://readdy.ai/api/search-image?query=Bangkok%20Thailand%20temple%20golden%20pagoda%20dramatic%20sunset%20tropical%20cinematic%20atmosphere%20dark%20moody%20exotic%20beautiful%20landscape&width=1400&height=500&seq=country-th-hero-1&orientation=landscape',
    accentColor: 'text-teal-400',
    accentBg: 'bg-teal-500',
    gradientFrom: 'from-teal-700/40',
    gradientVia: 'via-emerald-600/20',
    tagline: 'Đất Nước Chùa Vàng — Lakorn Ngọt Ngào, BL Drama Đình Đám, Phim Hành Động Mãn Nhãn',
    description: 'Lakorn tình cảm, BL drama GMMTV, phim hành động Thái — vietsub HD miễn phí cập nhật hàng ngày',
    keywords: 'phim Thái, phim thai lan, phim Thái Lan, phim BL Thái, lakorn, phim thai lan vietsub',
    seoDesc: 'Xem 3.000+ phim Thái Lan vietsub HD miễn phí tại KhoPhim 2026. Lakorn tình cảm, BL drama, phim hành động Thái. Cập nhật hàng ngày, xem ngay!',
    seoIntro: 'KhoPhim mang đến bộ sưu tập phim Thái Lan phong phú với các thể loại đa dạng: tình cảm lãng mạn lakorn ngọt ngào, hành động mãn nhãn, kinh dị rùng rợn, hài hước vui nhộn và BL (Boys\' Love) đình đám. Tất cả phim Thái tại khophim.org đều có phụ đề tiếng Việt chuẩn, chất lượng HD, cập nhật tập mới liên tục. Phim BL Thái Lan đã trở thành hiện tượng toàn cầu với những tác phẩm như 2gether: The Series, Bad Buddy, KinnPorsche – được sản xuất bởi GMMTV và các nhà sản xuất hàng đầu Thái Lan. Lakorn tình cảm từ các đài truyền hình lớn như Ch3, Ch7, One31 cũng được cập nhật đầy đủ với vietsub chuẩn. Phim hành động Thái Lan nổi tiếng với những pha võ thuật mãn nhãn, đặc biệt là các phim có sự tham gia của Tony Jaa. Xem phim Thái Lan tại KhoPhim hoàn toàn miễn phí, không quảng cáo, không cần đăng ký tài khoản.',
    stats: [
      { label: 'Phim Thái', value: '3K+', icon: 'ri-flower-line' },
      { label: 'BL Drama', value: 'GMMTV', icon: 'ri-heart-line' },
      { label: 'Đài TV', value: 'Ch3/Ch7/One31', icon: 'ri-broadcast-line' },
      { label: 'Cập nhật', value: 'Hàng ngày', icon: 'ri-time-line' },
    ],
    highlights: [
      'Phim bộ Thái Lan vietsub HD đầy đủ',
      'Lakorn Thái tình cảm mới nhất',
      'Phim BL Thái hay nhất hiện nay',
      'Cập nhật từ Ch3, Ch7, GMMTV, One31',
      'Phim Thái lẻ & bộ đa thể loại',
    ],
    faq: [
      { q: 'Xem phim Thái Lan vietsub online ở đâu?', a: 'KhoPhim (khophim.org) là trang xem phim Thái Lan vietsub online tốt nhất. Kho phim Thái cực kỳ đầy đủ từ phim bộ tình cảm lakorn đến phim hành động, kinh dị và BL drama. Miễn phí, HD, không cần đăng ký.' },
      { q: 'Phim BL Thái Lan hay nhất 2026 là gì?', a: 'KhoPhim cập nhật đầy đủ các phim BL Thái Lan mới nhất và hot nhất. Bạn có thể dùng bộ lọc thể loại hoặc tìm kiếm trực tiếp để tìm các phim BL từ GMMTV và các nhà sản xuất Thái Lan khác.' },
      { q: 'KhoPhim có lakorn Thái Lan không?', a: 'KhoPhim có đầy đủ lakorn (phim truyền hình Thái Lan) vietsub HD, cập nhật liên tục từ các đài truyền hình lớn của Thái Lan.' },
      { q: 'Phim Thái Lan hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim Thái Lan được đánh giá cao nhất 2026 từ tình cảm, hành động, kinh dị đến BL. Vào mục Phim Thái Lan để xem danh sách.' },
    ],
    related: [
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
      { label: 'Phim Việt Nam', href: '/phim-viet-nam' },
      { label: 'Phim Bộ', href: '/phim-bo' },
      { label: 'Phim Lẻ', href: '/phim-le' },
    ],
    reviews: [
      { title: '2gether: The Series', year: 2020, rating: '8.5/10', review: '2gether: The Series là bộ phim BL Thái Lan đã thay đổi hoàn toàn cách thế giới nhìn nhận thể loại này. Trước 2gether, BL Thái chủ yếu chỉ được biết đến trong cộng đồng fan nhỏ – sau 2gether, nó trở thành hiện tượng toàn cầu với hashtag trending ở hàng chục quốc gia.', genre: 'BL / Tình cảm' },
      { title: 'Hormones (Tuổi Nổi Loạn)', year: 2013, rating: '8.8/10', review: 'Hormones là bộ phim học đường Thái Lan dũng cảm nhất từng được sản xuất. Thay vì tô hồng tuổi teen như hầu hết phim học đường Châu Á, Hormones đối mặt thẳng với những vấn đề thực sự: tình dục, ma túy, bạo lực học đường, áp lực gia đình, bản dạng giới.', genre: 'Học đường / Drama' },
    ],
  },
  'viet-nam': {
    slug: 'viet-nam',
    name: 'Phim Việt Nam',
    nameEn: 'Vietnamese Movies',
    flag: '🇻🇳',
    type: 'phim-le',
    path: '/phim-viet-nam',
    bgImage: 'https://readdy.ai/api/search-image?query=Vietnam%20Hanoi%20Hoi%20An%20ancient%20town%20lanterns%20night%20dramatic%20cinematic%20atmosphere%20beautiful%20landscape%20dark%20moody%20golden%20light&width=1400&height=500&seq=country-vn-hero-1&orientation=landscape',
    accentColor: 'text-yellow-400',
    accentBg: 'bg-yellow-500',
    gradientFrom: 'from-red-700/40',
    gradientVia: 'via-yellow-600/20',
    tagline: 'Điện Ảnh Việt Nam — Từ Phim Chiếu Rạp Bom Tấn Đến Drama Truyền Hình Đỉnh Cao',
    description: 'Phim chiếu rạp, phim bộ truyền hình, phim hài Việt Nam — HD miễn phí cập nhật mới nhất',
    keywords: 'phim Việt, phim viet nam, phim Việt Nam, phim Việt hay, phim chieu rap Viet, phim bo Viet',
    seoDesc: 'Xem 2.000+ phim Việt Nam HD miễn phí tại KhoPhim 2026. Phim chiếu rạp bom tấn, phim bộ truyền hình, phim hài. Cập nhật hàng ngày, xem ngay!',
    seoIntro: 'KhoPhim là địa chỉ xem phim Việt Nam online miễn phí tốt nhất với kho phim cực kỳ đa dạng. Từ phim chiếu rạp bom tấn Việt đến phim bộ truyền hình, phim hài, tình cảm, hành động Việt Nam – tất cả đều có tại khophim.org với chất lượng HD Full HD. Điện ảnh Việt Nam đang ngày càng phát triển mạnh mẽ với những tác phẩm chất lượng cao như Mắt Biếc, Hai Phượng, Bố Già, Nhà Bà Nữ – những bộ phim đã phá kỷ lục phòng vé và được khán giả yêu thích. Phim bộ truyền hình Việt Nam từ các đài VTV, HTV, THVL với những series đình đám như Về Nhà Đi Con, Hương Vị Tình Thân, Thương Ngày Nắng Về đều có đầy đủ tại KhoPhim. Phim hài Việt Nam với những tên tuổi quen thuộc như Hoài Linh, Trấn Thành, Trường Giang cũng được tổng hợp đầy đủ. Xem phim Việt Nam tại KhoPhim hoàn toàn miễn phí, không quảng cáo, không cần đăng ký tài khoản, tương thích mọi thiết bị.',
    stats: [
      { label: 'Phim Việt', value: '2K+', icon: 'ri-flag-line' },
      { label: 'Chiếu rạp', value: 'Mới nhất', icon: 'ri-movie-2-line' },
      { label: 'Đài TV', value: 'VTV/HTV', icon: 'ri-broadcast-line' },
      { label: 'Cập nhật', value: 'Hàng ngày', icon: 'ri-time-line' },
    ],
    highlights: [
      'Phim chiếu rạp Việt Nam mới nhất',
      'Phim bộ truyền hình VTV, HTV đầy đủ',
      'Phim hài Việt Nam hàng nghìn bộ',
      'Phim hành động, tình cảm, kinh dị Việt',
      'Chất lượng HD Full HD rõ nét',
    ],
    faq: [
      { q: 'Xem phim Việt Nam chiếu rạp online ở đâu miễn phí?', a: 'KhoPhim (khophim.org) có đầy đủ phim chiếu rạp Việt Nam với chất lượng HD, miễn phí hoàn toàn. Phim được cập nhật nhanh sau khi ra rạp. Không cần đăng ký, xem ngay trên trình duyệt.' },
      { q: 'Phim bộ Việt Nam hay nhất xem ở đâu?', a: 'KhoPhim tổng hợp hàng nghìn phim bộ Việt Nam từ các đài VTV, HTV, THVL đến các phim web drama mới nhất. Tất cả đều miễn phí, HD, có thể xem trên mọi thiết bị.' },
      { q: 'KhoPhim có phim hài Việt Nam không?', a: 'KhoPhim có đầy đủ phim hài Việt Nam, từ phim chiếu rạp đến phim truyền hình hài. Cập nhật liên tục với chất lượng HD.' },
      { q: 'Phim Việt Nam hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim Việt Nam được đánh giá cao nhất 2026. Vào mục Phim Việt Nam để xem danh sách phim hay nhất.' },
    ],
    related: [
      { label: 'Phim Hàn Quốc', href: '/phim-han-quoc' },
      { label: 'Phim Thái Lan', href: '/phim-thai-lan' },
      { label: 'Phim Bộ', href: '/phim-bo' },
      { label: 'Phim Chiếu Rạp', href: '/phim-chieu-rap' },
    ],
    reviews: [
      { title: 'Mắt Biếc', year: 2019, rating: '8.6/10', review: 'Victor Vũ đã chuyển thể tiểu thuyết của Nguyễn Nhật Ánh thành một bộ phim điện ảnh Việt Nam đẹp đến đau lòng. Mắt Biếc không phải là câu chuyện tình yêu có hậu – đó là câu chuyện về một tình yêu đơn phương kéo dài suốt cả tuổi thơ và thanh xuân.', genre: 'Tình cảm / Drama' },
      { title: 'Hai Phượng', year: 2019, rating: '8.4/10', review: 'Hai Phượng đã làm điều mà điện ảnh Việt Nam chưa từng làm được: tạo ra một bộ phim hành động đủ chất lượng để cạnh tranh trên thị trường quốc tế. Ngô Thanh Vân không chỉ đóng vai chính mà còn tự thực hiện hầu hết các cảnh hành động.', genre: 'Hành động / Gia đình' },
    ],
  },
};

const PAGE_SIZE = 30;
const API_PAGE_SIZE = 24;
const POOL_CACHE_TTL = 10 * 60 * 1000;

function getPoolCacheKey(country: string) {
  return `kp_country_${country}_v1`;
}

function getPoolCache(country: string): Movie[] | null {
  try {
    const raw = sessionStorage.getItem(getPoolCacheKey(country));
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: Movie[]; ts: number };
    if (Date.now() - entry.ts > POOL_CACHE_TTL) { sessionStorage.removeItem(getPoolCacheKey(country)); return null; }
    return entry.data;
  } catch { return null; }
}

function setPoolCache(country: string, data: Movie[]): void {
  try {
    sessionStorage.setItem(getPoolCacheKey(country), JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota */ }
}

async function apiFetch(type: string, apiPage: number, country: string): Promise<Movie[]> {
  const res = await fetchMoviesByCategory({ type, country, page: apiPage, sortField: 'modified.time', sortType: 'desc' });
  return res.items ?? [];
}

function sortByYear(movies: Movie[]): Movie[] {
  return [...movies].sort((a, b) => {
    const yd = (b.year ?? 0) - (a.year ?? 0);
    if (yd !== 0) return yd;
    return new Date(b.modified?.time ?? 0).getTime() - new Date(a.modified?.time ?? 0).getTime();
  });
}

interface Props {
  countrySlug: string;
}

export default function CountryPage({ countrySlug }: Props) {
  const config = COUNTRY_CONFIGS[countrySlug];
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sectionRef: seoRef, visible: seoVisible } = useLazySection('300px');

  // Read page from URL param
  const urlPage = parseInt(searchParams.get('page') ?? '1', 10);
  const [page, setPage] = useState(isNaN(urlPage) || urlPage < 1 ? 1 : urlPage);
  const [sortBy, setSortBy] = useState<'new' | 'hot'>('new');
  
  // Sync page state with URL param
  useEffect(() => {
    const p = parseInt(searchParams.get('page') ?? '1', 10);
    if (!isNaN(p) && p >= 1 && p !== page) {
      setPage(p);
    }
  }, [searchParams, page]);

  const handleSetPage = useCallback((p: number) => {
    setPage(p);
    navigate({
      pathname: config?.path ?? pathname,
      search: p > 1 ? `?page=${p}` : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [config?.path, navigate, pathname]);
  
  // Self-referencing canonical — includes page param when page > 1
  const canonicalUrl = page > 1 
    ? `${SITE_URL}${config?.path ?? pathname}?page=${page}` 
    : `${SITE_URL}${config?.path ?? pathname}`;

  const poolRef = useRef<Movie[]>([]);
  const seenRef = useRef(new Set<string>());
  const nextApiRef = useRef(1);
  const apiDoneRef = useRef(false);
  const fetchingRef = useRef(false);
  const initialised = useRef(false);

  const [pool, setPool] = useState<Movie[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolReady, setPoolReady] = useState(false);

  const addToPool = useCallback((items: Movie[]) => {
    const fresh = items.filter((m) => !seenRef.current.has(m._id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seenRef.current.add(m._id));
    poolRef.current = sortByYear([...poolRef.current, ...fresh]);
    setPool([...poolRef.current]);
  }, []);

  const resetPool = useCallback(() => {
    poolRef.current = [];
    seenRef.current = new Set();
    nextApiRef.current = 1;
    apiDoneRef.current = false;
    fetchingRef.current = false;
    initialised.current = false;
    setPool([]);
    setPoolLoading(false);
    setPoolReady(false);
  }, []);

  useEffect(() => {
    resetPool();
    setPage(1);
    navigate({ pathname: config?.path ?? pathname, search: '' }, { replace: true });
  }, [countrySlug, config?.path, navigate, pathname, resetPool]);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    const cached = getPoolCache(countrySlug);
    if (cached && cached.length >= PAGE_SIZE) {
      cached.forEach((m) => seenRef.current.add(m._id));
      poolRef.current = cached;
      setPool([...cached]);
      nextApiRef.current = 3;
      setPoolReady(true);
      setPoolLoading(false);
      apiFetch(config.type, 1, countrySlug).then((items) => {
        addToPool(items);
        setPoolCache(countrySlug, poolRef.current);
      }).catch(() => {});
      return;
    }

    setPoolLoading(true);
    Promise.all([
      apiFetch(config.type, 1, countrySlug),
      apiFetch(config.type, 2, countrySlug),
    ]).then(([r1, r2]) => {
      addToPool(r1);
      addToPool(r2);
      nextApiRef.current = 3;
      if (!r2 || r2.length < API_PAGE_SIZE) apiDoneRef.current = true;
      setPoolReady(true);
      setPoolLoading(false);
      setPoolCache(countrySlug, poolRef.current);
    });
  }, [countrySlug, config.type, addToPool]);

  const fetchMore = useCallback(async () => {
    if (fetchingRef.current || apiDoneRef.current) return;
    fetchingRef.current = true;
    setPoolLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        apiFetch(config.type, nextApiRef.current, countrySlug),
        apiFetch(config.type, nextApiRef.current + 1, countrySlug),
      ]);
      addToPool(r1);
      addToPool(r2);
      nextApiRef.current += 2;
      if (r1.length === 0 && r2.length === 0) apiDoneRef.current = true;
      setPoolCache(countrySlug, poolRef.current);
    } finally {
      fetchingRef.current = false;
      setPoolLoading(false);
    }
  }, [config.type, countrySlug, addToPool]);

  useEffect(() => {
    if (!poolReady) return;
    const needed = (page + 1) * PAGE_SIZE;
    if (pool.length < needed && !apiDoneRef.current && !fetchingRef.current) {
      fetchMore();
    }
  }, [poolReady, page, pool.length, fetchMore]);

  const sortedMovies = useMemo(() => {
    if (sortBy === 'new') {
      return pool.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }
    const currentYear = new Date().getFullYear();
    const score = (m: Movie): number => {
      const yearDiff = currentYear - (m.year ?? 0);
      const yearScore = yearDiff <= 0 ? 60 : yearDiff === 1 ? 45 : yearDiff === 2 ? 30 : yearDiff === 3 ? 15 : yearDiff <= 5 ? 5 : 0;
      const mtime = new Date(m.modified?.time ?? 0).getTime();
      const freshScore = Math.max(0, 80 - (Date.now() - mtime) / 3600000 * 2);
      const ep = (m.episode_current ?? '').toLowerCase().trim();
      const isFull = ep === 'full' || ep === 'full hd' || ep.startsWith('hoàn tất');
      return yearScore + freshScore + (isFull ? 25 : 0) + (m.chieurap ? 15 : 0);
    };
    return [...pool].sort((a, b) => score(b) - score(a)).slice(0, PAGE_SIZE);
  }, [sortBy, pool, page]);

  const loading = poolLoading && !poolReady;
  const hasNextPage = !apiDoneRef.current || page * PAGE_SIZE < pool.length;
  const totalPages = Math.ceil(pool.length / PAGE_SIZE) + (apiDoneRef.current ? 0 : 5);
  const prevPage = page > 1 
    ? (page > 2 ? `${SITE_URL}${config?.path ?? pathname}?page=${page - 1}` : `${SITE_URL}${config?.path ?? pathname}`)
    : undefined;
  const nextPage = hasNextPage ? `${SITE_URL}${config?.path ?? pathname}?page=${page + 1}` : undefined;

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [page]);

  if (!config) {
    return (
      <div className="min-h-screen bg-[#080a10] text-white">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <i className="ri-error-warning-line text-5xl text-white/20" />
          <p className="text-white/40">Quốc gia không tồn tại</p>
          <Link to="/" className="text-red-400 hover:text-red-300 text-sm">← Về trang chủ</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const seoTitle = `${config.name} Vietsub HD Miễn Phí | KhoPhim`;
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: config.name, item: `${SITE_URL}${config.path}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: seoTitle,
      url: `${SITE_URL}${config.path}`,
      description: config.seoDesc,
      inLanguage: 'vi',
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
    },
    ...(sortedMovies.length > 0 ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${config.name} – Danh Sách Phim`,
      url: `${SITE_URL}${config.path}`,
      numberOfItems: sortedMovies.length,
      itemListElement: sortedMovies.slice(0, 10).map((m, i) => ({
        '@type': 'ListItem',
        position: (page - 1) * PAGE_SIZE + i + 1,
        url: `${SITE_URL}/phim/${m.slug}`,
        name: m.name,
      })),
    }] : []),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: config.faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <SEO
        title={seoTitle}
        description={config.seoDesc}
        keywords={config.keywords}
        canonical={canonicalUrl}
        prev={prevPage}
        next={nextPage}
        schema={schema}
      />
      <Navbar />

      {/* Hero Banner */}
      <CountryHeroBanner config={config} page={page} />

      <main className="max-w-[1400px] mx-auto px-4 pb-12">

        {/* Sort Bar */}
        <div className="flex items-center justify-between mb-5 gap-3 py-3 flex-col sm:flex-row">
          <div className="flex items-center gap-2">
            {!loading && sortedMovies.length > 0 && (
              <span className="text-sm text-white/35 flex items-center gap-1.5">
                <i className="ri-film-line text-xs" />
                Trang {page} · <span className="text-white/55 font-medium">{sortedMovies.length} phim</span>
                {poolLoading && poolReady && (
                  <i className="ri-loader-4-line animate-spin text-xs text-white/25 ml-1" />
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 bg-[#1a1d27] border border-white/[0.06] rounded-xl p-1 overflow-x-auto w-full sm:w-auto">
            {([
              { key: 'new', icon: 'ri-time-line', label: 'Mới Nhất' },
              { key: 'hot', icon: 'ri-fire-line', label: 'Hot Nhất' },
            ] as const).map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-all cursor-pointer whitespace-nowrap font-medium ${
                  sortBy === s.key
                    ? `${config.accentBg} text-white`
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                <i className={`${s.icon} text-xs`} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Movie Grid */}
        {loading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-10">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[2/3] skeleton rounded-xl" />
                <div className="mt-2 h-3 skeleton rounded w-3/4" />
                <div className="mt-1 h-2.5 skeleton rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : sortedMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-white/30">
            <i className="ri-film-line text-5xl mb-3" />
            <p className="text-lg">Không có phim nào</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-10">
            {sortedMovies.map((m, idx) => (
              <MovieCard key={m._id} movie={m} priority={idx < 2} />
            ))}
          </div>
        )}

        {/* Fetch-more indicator */}
        {poolLoading && poolReady && (
          <div className="flex justify-center mt-6">
            <span className="flex items-center gap-2 text-sm text-white/30 bg-white/[0.03] border border-white/[0.06] px-4 py-2 rounded-full">
              <i className="ri-loader-4-line animate-spin" /> Đang tải thêm phim...
            </span>
          </div>
        )}

        {/* Pagination */}
        {!loading && (sortedMovies.length > 0 || page > 1) && (
          <>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              basePath={config?.path ?? pathname}
              hasNext={hasNextPage}
              accentClass={config.accentBg}
              onPageChange={setPage}
            />
            <JumpToPage current={page} onGo={handleSetPage} />
          </>
        )}

        {/* SEO Content */}
        <div ref={seoRef}>
          {seoVisible && <CountrySEOContent config={config} />}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function JumpToPage({ current, onGo }: { current: number; onGo: (p: number) => void }) {
  const [input, setInput] = useState('');
  const handle = () => {
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 1) { onGo(n); setInput(''); }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/30">Nhảy đến trang</span>
      <input
        type="number"
        min={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handle()}
        placeholder={String(current)}
        className="w-16 h-8 bg-[#1a1d27] border border-white/10 rounded-lg text-center text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/60"
      />
      <button
        onClick={handle}
        className="px-4 h-8 bg-[#1a1d27] hover:bg-white/10 text-white/60 hover:text-white border border-white/10 rounded-lg text-sm transition-all cursor-pointer whitespace-nowrap"
      >
        Đi
      </button>
    </div>
  );
}
