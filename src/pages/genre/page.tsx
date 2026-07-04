import { useState, useEffect, useCallback, useRef } from 'react';
import { useHeroLazyLoad } from '@/hooks/useHeroLazyLoad';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import SEO, { SITE_URL } from '@/components/base/SEO';
import { fetchMoviesByCategory, searchMovies } from '@/services/movieApi';
import { setSmartSessionCache } from '@/utils/smartCache';
import type { MovieItem } from '@/types/movie';
import Pagination from '@/components/base/Pagination';

/* ─── Genre config: màu, icon, hình nền riêng từng thể loại ─── */
const GENRE_META: Record<string, {
  name: string;
  desc: string;
  keywords: string;
  icon: string;
  color: string;        // tailwind gradient from-X
  colorTo: string;      // tailwind gradient to-X
  accent: string;       // hex for glow
  bgImage: string;
  faq: Array<{ q: string; a: string }>;
}> = {
  'hanh-dong': {
    name: 'Hành Động', icon: 'ri-sword-line',
    color: 'from-orange-600', colorTo: 'to-red-700', accent: '#ea580c',
    bgImage: 'https://readdy.ai/api/search-image?query=epic%20action%20movie%20scene%20explosion%20fire%20dark%20cinematic%20dramatic%20lighting%20orange%20red%20tones%20high%20contrast%20blockbuster%20film%20atmosphere%20intense%20battle%20sequence&width=1400&height=500&seq=genre-hanh-dong-1&orientation=landscape',
    desc: 'Xem 5.000+ phim hành động vietsub HD miễn phí tại KhoPhim 2026. Phim action Hollywood, Hàn, Trung hay nhất. Cập nhật hàng ngày, không quảng cáo, xem ngay!',
    keywords: 'phim hành động, phim hanh dong, phim action, phim hành động hay, phim hanh dong hay',
    faq: [
      { q: 'Xem phim hành động vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim hành động vietsub HD khổng lồ từ Hollywood, Hàn Quốc, Trung Quốc. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim hành động hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim hành động được đánh giá cao nhất 2026 từ nhiều quốc gia. Vào mục Phim Hành Động để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim action Hollywood không?', a: 'KhoPhim có đầy đủ phim action Hollywood vietsub HD, từ bom tấn Marvel, DC đến phim hành động độc lập. Cập nhật nhanh nhất.' },
      { q: 'Phim hành động Hàn Quốc hay nhất là gì?', a: 'KhoPhim có kho phim hành động Hàn Quốc vietsub HD đa dạng. Từ phim chiếu rạp đến drama hành động đều có đủ, cập nhật hàng ngày.' },
    ],
  },
  'tinh-cam': {
    name: 'Tình Cảm', icon: 'ri-heart-3-line',
    color: 'from-pink-600', colorTo: 'to-rose-700', accent: '#db2777',
    bgImage: 'https://readdy.ai/api/search-image?query=romantic%20movie%20scene%20couple%20soft%20pink%20warm%20lighting%20bokeh%20flowers%20petals%20cinematic%20dreamy%20atmosphere%20love%20story%20film%20aesthetic&width=1400&height=500&seq=genre-tinh-cam-1&orientation=landscape',
    desc: 'Xem 8.000+ phim tình cảm vietsub HD miễn phí tại KhoPhim 2026. Romance Hàn, ngôn tình Trung, phim lãng mạn Âu Mỹ. Cập nhật hàng ngày, không quảng cáo!',
    keywords: 'phim tình cảm, phim tinh cam, phim romance, phim tình cảm Hàn, phim tinh cam hay',
    faq: [
      { q: 'Xem phim tình cảm vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim tình cảm, romance vietsub HD từ Hàn Quốc, Trung Quốc, Âu Mỹ. Tất cả đều miễn phí, không quảng cáo.' },
      { q: 'Phim tình cảm Hàn Quốc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp drama tình cảm Hàn Quốc được đánh giá cao nhất 2026. Vào mục Phim Tình Cảm để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim romance Trung Quốc không?', a: 'KhoPhim có đầy đủ phim tình cảm Trung Quốc vietsub HD, từ cổ trang lãng mạn đến hiện đại. Cập nhật liên tục hàng ngày.' },
      { q: 'Phim tình cảm hay nhất để xem là gì?', a: 'KhoPhim tổng hợp phim tình cảm hay nhất từ nhiều quốc gia. Từ romance Hàn, ngôn tình Trung đến phim tình cảm Âu Mỹ đều có đủ.' },
    ],
  },
  'hai-huoc': {
    name: 'Hài Hước', icon: 'ri-emotion-laugh-line',
    color: 'from-yellow-500', colorTo: 'to-amber-600', accent: '#d97706',
    bgImage: 'https://readdy.ai/api/search-image?query=comedy%20movie%20scene%20bright%20colorful%20fun%20cheerful%20atmosphere%20warm%20yellow%20golden%20lighting%20happy%20characters%20cinematic%20film%20aesthetic%20vibrant&width=1400&height=500&seq=genre-hai-huoc-1&orientation=landscape',
    desc: 'Xem 4.000+ phim hài hước vietsub HD miễn phí tại KhoPhim 2026. Comedy Hàn, Trung, Âu Mỹ, Việt Nam. Cập nhật hàng ngày, không quảng cáo, xem ngay!',
    keywords: 'phim hài, phim hai huoc, phim comedy, phim hài hay, phim hai hay',
    faq: [
      { q: 'Xem phim hài hước vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim hài hước vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim hài hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim hài được đánh giá cao nhất 2026 từ Hàn Quốc, Trung Quốc, Âu Mỹ, Việt Nam. Vào mục Phim Hài để xem danh sách.' },
      { q: 'KhoPhim có phim hài Việt Nam không?', a: 'KhoPhim có đầy đủ phim hài Việt Nam vietsub HD, từ phim chiếu rạp đến phim truyền hình hài. Cập nhật liên tục.' },
      { q: 'Phim comedy Hàn Quốc hay nhất là gì?', a: 'KhoPhim có kho phim hài Hàn Quốc vietsub HD đa dạng. Từ romantic comedy đến sitcom Hàn đều có đủ, cập nhật hàng ngày.' },
    ],
  },
  'co-trang': {
    name: 'Cổ Trang', icon: 'ri-ancient-gate-line',
    color: 'from-amber-700', colorTo: 'to-yellow-800', accent: '#b45309',
    bgImage: 'https://readdy.ai/api/search-image?query=ancient%20chinese%20historical%20drama%20palace%20traditional%20architecture%20golden%20lanterns%20misty%20mountains%20cinematic%20dark%20atmospheric%20period%20film%20aesthetic&width=1400&height=500&seq=genre-co-trang-1&orientation=landscape',
    desc: 'Xem 6.000+ phim cổ trang vietsub HD miễn phí tại KhoPhim 2026. Cung đấu Trung Quốc, tiên hiệp tu tiên, phim Hàn sageuk. Cập nhật liên tục, xem ngay!',
    keywords: 'phim cổ trang, phim co trang, phim cổ trang Trung Quốc, tien hiep, tiên hiệp, phim co trang hay',
    faq: [
      { q: 'Xem phim cổ trang vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim cổ trang vietsub HD khổng lồ từ Trung Quốc, Hàn Quốc. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim cổ trang Trung Quốc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim cổ trang Trung Quốc được đánh giá cao nhất 2026, từ tiên hiệp, tu tiên đến cung đấu. Vào mục Phim Cổ Trang để xem.' },
      { q: 'KhoPhim có phim tiên hiệp cổ trang không?', a: 'KhoPhim có đầy đủ phim tiên hiệp, tu tiên, cổ trang Trung Quốc vietsub HD. Từ kinh điển đến mới nhất 2026 đều có đủ.' },
      { q: 'Phim cổ trang Hàn Quốc hay nhất là gì?', a: 'KhoPhim có kho phim cổ trang Hàn Quốc (sageuk) vietsub HD đa dạng. Từ phim lịch sử đến cổ trang fantasy đều có đủ.' },
    ],
  },
  'tam-ly': {
    name: 'Tâm Lý', icon: 'ri-mental-health-line',
    color: 'from-violet-700', colorTo: 'to-purple-800', accent: '#7c3aed',
    bgImage: 'https://readdy.ai/api/search-image?query=psychological%20drama%20film%20dark%20moody%20atmospheric%20deep%20shadows%20purple%20blue%20tones%20cinematic%20introspective%20character%20study%20emotional%20depth%20film%20noir&width=1400&height=500&seq=genre-tam-ly-1&orientation=landscape',
    desc: 'Xem 5.000+ phim tâm lý drama vietsub HD miễn phí tại KhoPhim 2026. Phim sâu sắc, kịch tính từ Hàn, Âu Mỹ, Trung. Cập nhật hàng ngày, không quảng cáo!',
    keywords: 'phim tâm lý, phim tam ly, phim drama, phim tâm lý hay, phim tam ly Han',
    faq: [
      { q: 'Xem phim tâm lý vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim tâm lý, drama vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim tâm lý hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim tâm lý được đánh giá cao nhất 2026. Vào mục Phim Tâm Lý để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim drama Hàn Quốc không?', a: 'KhoPhim có đầy đủ phim drama tâm lý Hàn Quốc vietsub HD. Từ melodrama đến thriller tâm lý đều có đủ, cập nhật hàng ngày.' },
      { q: 'Phim tâm lý kịch tính nhất là gì?', a: 'KhoPhim tổng hợp phim tâm lý kịch tính nhất từ Hàn Quốc, Âu Mỹ. Từ thriller tâm lý đến drama sâu sắc đều có đủ.' },
    ],
  },
  'kinh-di': {
    name: 'Kinh Dị', icon: 'ri-ghost-2-line',
    color: 'from-gray-800', colorTo: 'to-slate-900', accent: '#475569',
    bgImage: 'https://readdy.ai/api/search-image?query=horror%20movie%20dark%20scary%20atmosphere%20fog%20abandoned%20building%20eerie%20lighting%20shadows%20dark%20blue%20gray%20tones%20cinematic%20thriller%20suspense%20film%20aesthetic&width=1400&height=500&seq=genre-kinh-di-1&orientation=landscape',
    desc: 'Xem 3.000+ phim kinh dị vietsub HD miễn phí tại KhoPhim 2026. Horror Hàn, Nhật, Âu Mỹ rùng rợn nhất. Cập nhật hàng ngày, không quảng cáo, xem ngay!',
    keywords: 'phim kinh dị, phim kinh di, phim horror, phim kinh di hay, phim ma',
    faq: [
      { q: 'Xem phim kinh dị vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim kinh dị vietsub HD từ Hàn Quốc, Nhật Bản, Âu Mỹ. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim kinh dị hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim kinh dị được đánh giá cao nhất 2026. Vào mục Phim Kinh Dị để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim horror Hàn Quốc không?', a: 'KhoPhim có đầy đủ phim kinh dị Hàn Quốc vietsub HD. Từ phim ma, phim tâm lý kinh dị đến thriller đều có đủ.' },
      { q: 'Phim kinh dị Nhật Bản hay nhất là gì?', a: 'KhoPhim có kho phim kinh dị Nhật Bản vietsub HD đa dạng. Từ J-horror kinh điển đến phim kinh dị mới nhất 2026 đều có đủ.' },
    ],
  },
  'vien-tuong': {
    name: 'Viễn Tưởng', icon: 'ri-rocket-2-line',
    color: 'from-cyan-600', colorTo: 'to-teal-700', accent: '#0891b2',
    bgImage: 'https://readdy.ai/api/search-image?query=science%20fiction%20movie%20space%20futuristic%20city%20neon%20lights%20dark%20atmosphere%20cinematic%20sci-fi%20aesthetic%20stars%20galaxy%20technology%20advanced%20civilization%20film&width=1400&height=500&seq=genre-vien-tuong-1&orientation=landscape',
    desc: 'Xem 3.000+ phim viễn tưởng sci-fi vietsub HD miễn phí tại KhoPhim 2026. Phim khoa học viễn tưởng Hollywood, Hàn hay nhất. Cập nhật hàng ngày, xem ngay!',
    keywords: 'phim viễn tưởng, phim vien tuong, phim sci-fi, phim khoa hoc vien tuong, phim vien tuong hay',
    faq: [
      { q: 'Xem phim viễn tưởng vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim viễn tưởng, sci-fi vietsub HD từ Hollywood và nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo.' },
      { q: 'Phim sci-fi hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim khoa học viễn tưởng được đánh giá cao nhất 2026. Vào mục Phim Viễn Tưởng để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim Star Wars và Star Trek không?', a: 'KhoPhim có đầy đủ phim viễn tưởng Hollywood vietsub HD, bao gồm các franchise lớn như Star Wars, Star Trek và nhiều phim sci-fi khác.' },
      { q: 'Phim viễn tưởng Hàn Quốc hay nhất là gì?', a: 'KhoPhim có kho phim viễn tưởng Hàn Quốc vietsub HD. Từ phim chiếu rạp đến drama sci-fi Hàn đều có đủ, cập nhật hàng ngày.' },
    ],
  },
  'phieu-luu': {
    name: 'Phiêu Lưu', icon: 'ri-compass-3-line',
    color: 'from-emerald-600', colorTo: 'to-green-700', accent: '#059669',
    bgImage: 'https://readdy.ai/api/search-image?query=adventure%20movie%20jungle%20mountains%20explorer%20cinematic%20green%20lush%20nature%20dramatic%20lighting%20epic%20landscape%20film%20aesthetic%20action%20hero%20quest&width=1400&height=500&seq=genre-phieu-luu-1&orientation=landscape',
    desc: 'Xem phim phiêu lưu vietsub miễn phí HD tại KhoPhim. Phim adventure mạo hiểm hay nhất 2026.',
    keywords: 'phim phiêu lưu, phim phieu luu, phim adventure, phim mao hiem, phim phieu luu hay',
    faq: [
      { q: 'Xem phim phiêu lưu vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim phiêu lưu, adventure vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim phiêu lưu hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim phiêu lưu được đánh giá cao nhất 2026. Vào mục Phim Phiêu Lưu để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim Indiana Jones và Jurassic Park không?', a: 'KhoPhim có đầy đủ phim phiêu lưu Hollywood vietsub HD, bao gồm các franchise nổi tiếng và phim phiêu lưu mới nhất 2026.' },
      { q: 'Phim phiêu lưu cho gia đình hay nhất là gì?', a: 'KhoPhim có kho phim phiêu lưu gia đình vietsub HD đa dạng, phù hợp cho mọi lứa tuổi. Cập nhật liên tục hàng ngày.' },
    ],
  },
  'chien-tranh': {
    name: 'Chiến Tranh', icon: 'ri-shield-cross-line',
    color: 'from-stone-700', colorTo: 'to-neutral-800', accent: '#78716c',
    bgImage: 'https://readdy.ai/api/search-image?query=war%20movie%20battlefield%20soldiers%20dramatic%20dark%20smoke%20explosions%20cinematic%20gritty%20realistic%20military%20film%20aesthetic%20intense%20historical%20epic%20atmosphere&width=1400&height=500&seq=genre-chien-tranh-1&orientation=landscape',
    desc: 'Xem phim chiến tranh vietsub miễn phí HD tại KhoPhim. Phim chiến tranh lịch sử hay nhất 2026.',
    keywords: 'phim chiến tranh, phim chien tranh, phim war, phim chien tranh hay, phim lich su chien tranh',
    faq: [
      { q: 'Xem phim chiến tranh vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim chiến tranh vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim chiến tranh hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim chiến tranh được đánh giá cao nhất 2026. Vào mục Phim Chiến Tranh để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim chiến tranh Hàn Quốc không?', a: 'KhoPhim có đầy đủ phim chiến tranh Hàn Quốc vietsub HD, từ phim lịch sử đến drama chiến tranh hiện đại.' },
      { q: 'Phim chiến tranh thế giới hay nhất là gì?', a: 'KhoPhim có kho phim chiến tranh thế giới vietsub HD đa dạng, từ Thế chiến I, II đến các cuộc chiến hiện đại. Cập nhật liên tục.' },
    ],
  },
  'hinh-su': {
    name: 'Hình Sự', icon: 'ri-spy-line',
    color: 'from-red-800', colorTo: 'to-rose-900', accent: '#991b1b',
    bgImage: 'https://readdy.ai/api/search-image?query=crime%20thriller%20detective%20dark%20noir%20city%20night%20rain%20red%20neon%20lights%20cinematic%20mystery%20investigation%20film%20aesthetic%20dramatic%20shadows%20police&width=1400&height=500&seq=genre-hinh-su-1&orientation=landscape',
    desc: 'Xem phim hình sự vietsub miễn phí HD tại KhoPhim. Phim trinh thám, tội phạm hay nhất 2026.',
    keywords: 'phim hình sự, phim hinh su, phim trinh tham, phim toi pham, phim hinh su hay',
    faq: [
      { q: 'Xem phim hình sự vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim hình sự, trinh thám vietsub HD từ Hàn Quốc, Âu Mỹ. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim hình sự Hàn Quốc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim hình sự Hàn Quốc được đánh giá cao nhất 2026. Vào mục Phim Hình Sự để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim trinh thám không?', a: 'KhoPhim có đầy đủ phim trinh thám, hình sự vietsub HD từ nhiều quốc gia. Từ detective drama Hàn đến crime thriller Âu Mỹ đều có đủ.' },
      { q: 'Phim tội phạm hay nhất là gì?', a: 'KhoPhim tổng hợp phim tội phạm, hình sự hay nhất từ Hàn Quốc, Âu Mỹ, Trung Quốc. Cập nhật liên tục hàng ngày.' },
    ],
  },
  'hoat-hinh': {
    name: 'Hoạt Hình', icon: 'ri-gamepad-line',
    color: 'from-sky-500', colorTo: 'to-blue-600', accent: '#0284c7',
    bgImage: 'https://readdy.ai/api/search-image?query=anime%20animation%20colorful%20vibrant%20fantasy%20world%20magical%20characters%20bright%20cinematic%20artistic%20illustration%20style%20beautiful%20scenery%20film%20aesthetic&width=1400&height=500&seq=genre-hoat-hinh-1&orientation=landscape',
    desc: 'Xem 8.000+ hoạt hình & anime vietsub HD miễn phí tại KhoPhim 2026. Anime mùa mới, cartoon Disney Pixar. Cập nhật hàng tuần, không quảng cáo, xem ngay!',
    keywords: 'hoạt hình, hoat hinh, anime, anime vietsub, cartoon, hoat hinh hay',
    faq: [
      { q: 'Xem hoạt hình và anime vietsub miễn phí ở đâu?', a: 'KhoPhim có kho hoạt hình và anime vietsub HD khổng lồ. Từ anime Nhật Bản, cartoon Âu Mỹ đến hoạt hình Trung Quốc đều có đủ, miễn phí hoàn toàn.' },
      { q: 'Anime mùa mới 2026 có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật anime mùa mới 2026 hàng tuần với vietsub nhanh nhất. Từ shounen, shoujo, isekai đến slice of life đều có đủ.' },
      { q: 'KhoPhim có hoạt hình Disney và Pixar không?', a: 'KhoPhim có đầy đủ hoạt hình Disney, Pixar, DreamWorks vietsub HD. Từ phim kinh điển đến mới nhất 2026 đều có đủ.' },
      { q: 'Anime hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp anime được đánh giá cao nhất 2026 từ nhiều thể loại. Vào mục Hoạt Hình để khám phá danh sách đầy đủ.' },
    ],
  },
  'gia-dinh': {
    name: 'Gia Đình', icon: 'ri-home-heart-line',
    color: 'from-teal-600', colorTo: 'to-emerald-700', accent: '#0d9488',
    bgImage: 'https://readdy.ai/api/search-image?query=family%20movie%20warm%20cozy%20home%20golden%20hour%20light%20heartwarming%20cinematic%20soft%20tones%20happy%20family%20together%20film%20aesthetic%20emotional%20touching&width=1400&height=500&seq=genre-gia-dinh-1&orientation=landscape',
    desc: 'Xem phim gia đình vietsub miễn phí HD tại KhoPhim. Phim gia đình ấm áp, cảm động hay nhất 2026.',
    keywords: 'phim gia đình, phim gia dinh, phim family, phim gia dinh hay, phim cam dong',
    faq: [
      { q: 'Xem phim gia đình vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim gia đình vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, phù hợp cho mọi lứa tuổi.' },
      { q: 'Phim gia đình hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim gia đình được đánh giá cao nhất 2026. Vào mục Phim Gia Đình để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim gia đình Hàn Quốc không?', a: 'KhoPhim có đầy đủ phim gia đình Hàn Quốc vietsub HD, từ drama gia đình đến phim cảm động về tình thân.' },
      { q: 'Phim gia đình cảm động nhất là gì?', a: 'KhoPhim tổng hợp phim gia đình cảm động nhất từ nhiều quốc gia. Từ phim Hàn, phim Nhật đến phim Âu Mỹ đều có đủ.' },
    ],
  },
  'lich-su': {
    name: 'Lịch Sử', icon: 'ri-ancient-pavilion-line',
    color: 'from-amber-800', colorTo: 'to-stone-800', accent: '#92400e',
    bgImage: 'https://readdy.ai/api/search-image?query=historical%20epic%20movie%20ancient%20civilization%20dramatic%20lighting%20dark%20atmospheric%20cinematic%20period%20drama%20film%20aesthetic%20grand%20architecture%20warriors&width=1400&height=500&seq=genre-lich-su-1&orientation=landscape',
    desc: 'Xem phim lịch sử vietsub miễn phí HD tại KhoPhim. Phim lịch sử, dã sử hay nhất 2026.',
    keywords: 'phim lịch sử, phim lich su, phim da su, phim lich su hay, phim lich su Han Trung',
    faq: [
      { q: 'Xem phim lịch sử vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim lịch sử vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim lịch sử hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim lịch sử được đánh giá cao nhất 2026. Vào mục Phim Lịch Sử để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim lịch sử Trung Quốc không?', a: 'KhoPhim có đầy đủ phim lịch sử Trung Quốc vietsub HD, từ phim dã sử đến phim lịch sử chính thống.' },
      { q: 'Phim lịch sử Hàn Quốc hay nhất là gì?', a: 'KhoPhim có kho phim lịch sử Hàn Quốc (sageuk) vietsub HD đa dạng. Từ phim triều đại đến drama lịch sử hiện đại đều có đủ.' },
    ],
  },
  'bi-an': {
    name: 'Bí Ẩn', icon: 'ri-eye-2-line',
    color: 'from-indigo-700', colorTo: 'to-violet-800', accent: '#4338ca',
    bgImage: 'https://readdy.ai/api/search-image?query=mystery%20thriller%20dark%20atmospheric%20fog%20shadows%20enigmatic%20cinematic%20deep%20blue%20purple%20tones%20suspense%20film%20aesthetic%20mysterious%20figure%20night&width=1400&height=500&seq=genre-bi-an-1&orientation=landscape',
    desc: 'Xem phim bí ẩn vietsub miễn phí HD tại KhoPhim. Phim mystery, huyền bí hay nhất 2026.',
    keywords: 'phim bí ẩn, phim bi an, phim mystery, phim huyen bi, phim bi an hay',
    faq: [
      { q: 'Xem phim bí ẩn vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim bí ẩn, mystery vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim bí ẩn hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim bí ẩn được đánh giá cao nhất 2026. Vào mục Phim Bí Ẩn để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim mystery Hàn Quốc không?', a: 'KhoPhim có đầy đủ phim bí ẩn Hàn Quốc vietsub HD. Từ thriller bí ẩn đến drama huyền bí đều có đủ, cập nhật hàng ngày.' },
      { q: 'Phim bí ẩn huyền bí nhất là gì?', a: 'KhoPhim tổng hợp phim bí ẩn, huyền bí hay nhất từ nhiều quốc gia. Từ supernatural mystery đến psychological thriller đều có đủ.' },
    ],
  },
  'vo-thuat': {
    name: 'Võ Thuật', icon: 'ri-boxing-line',
    color: 'from-red-700', colorTo: 'to-orange-800', accent: '#b91c1c',
    bgImage: 'https://readdy.ai/api/search-image?query=martial%20arts%20kung%20fu%20movie%20dramatic%20fight%20scene%20dark%20atmospheric%20cinematic%20red%20orange%20tones%20warrior%20action%20film%20aesthetic%20intense%20combat&width=1400&height=500&seq=genre-vo-thuat-1&orientation=landscape',
    desc: 'Xem phim võ thuật vietsub miễn phí HD tại KhoPhim. Phim kung fu, võ thuật hay nhất 2026.',
    keywords: 'phim võ thuật, phim vo thuat, phim kung fu, phim martial arts, phim vo thuat hay',
    faq: [
      { q: 'Xem phim võ thuật vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim võ thuật, kung fu vietsub HD từ Trung Quốc, Hồng Kông. Tất cả đều miễn phí, không quảng cáo.' },
      { q: 'Phim võ thuật hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim võ thuật được đánh giá cao nhất 2026. Vào mục Phim Võ Thuật để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim kung fu Trung Quốc không?', a: 'KhoPhim có đầy đủ phim kung fu, võ thuật Trung Quốc vietsub HD. Từ phim kinh điển đến mới nhất 2026 đều có đủ.' },
      { q: 'Phim võ thuật Hồng Kông hay nhất là gì?', a: 'KhoPhim có kho phim võ thuật Hồng Kông vietsub HD đa dạng. Từ phim kinh điển của Thành Long, Lý Liên Kiệt đến phim mới nhất đều có đủ.' },
    ],
  },
  'than-thoai': {
    name: 'Thần Thoại', icon: 'ri-sparkling-2-line',
    color: 'from-fuchsia-700', colorTo: 'to-pink-800', accent: '#a21caf',
    bgImage: 'https://readdy.ai/api/search-image?query=fantasy%20mythology%20magical%20world%20divine%20beings%20epic%20cinematic%20mystical%20atmosphere%20glowing%20ethereal%20light%20dark%20dramatic%20film%20aesthetic%20gods%20legends&width=1400&height=500&seq=genre-than-thoai-1&orientation=landscape',
    desc: 'Xem phim thần thoại vietsub miễn phí HD tại KhoPhim. Phim fantasy, thần thoại hay nhất 2026.',
    keywords: 'phim thần thoại, phim than thoai, phim fantasy, phim tien hiep, phim than thoai hay',
    faq: [
      { q: 'Xem phim thần thoại vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim thần thoại, fantasy vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim thần thoại hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim thần thoại được đánh giá cao nhất 2026. Vào mục Phim Thần Thoại để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim thần thoại Trung Quốc không?', a: 'KhoPhim có đầy đủ phim thần thoại Trung Quốc vietsub HD, từ phim tiên hiệp đến thần thoại cổ đại. Cập nhật liên tục.' },
      { q: 'Phim fantasy Âu Mỹ hay nhất là gì?', a: 'KhoPhim có kho phim fantasy Âu Mỹ vietsub HD đa dạng. Từ Lord of the Rings đến các phim fantasy mới nhất 2026 đều có đủ.' },
    ],
  },
  'hoc-duong': {
    name: 'Học Đường', icon: 'ri-book-open-line',
    color: 'from-lime-600', colorTo: 'to-green-700', accent: '#65a30d',
    bgImage: 'https://readdy.ai/api/search-image?query=school%20drama%20movie%20youth%20students%20campus%20bright%20cheerful%20cinematic%20warm%20light%20green%20tones%20coming%20of%20age%20film%20aesthetic%20friendship%20teen&width=1400&height=500&seq=genre-hoc-duong-1&orientation=landscape',
    desc: 'Xem phim học đường vietsub miễn phí HD tại KhoPhim. Phim tuổi teen, học đường hay nhất 2026.',
    keywords: 'phim học đường, phim hoc duong, phim tuoi teen, phim hoc duong Han, phim hoc duong hay',
    faq: [
      { q: 'Xem phim học đường vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim học đường vietsub HD từ Hàn Quốc, Nhật Bản, Trung Quốc. Tất cả đều miễn phí, không quảng cáo.' },
      { q: 'Phim học đường Hàn Quốc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim học đường Hàn Quốc được đánh giá cao nhất 2026. Vào mục Phim Học Đường để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim tuổi teen không?', a: 'KhoPhim có đầy đủ phim học đường, tuổi teen vietsub HD từ nhiều quốc gia. Từ romance học đường đến drama tuổi teen đều có đủ.' },
      { q: 'Phim học đường Nhật Bản hay nhất là gì?', a: 'KhoPhim có kho phim học đường Nhật Bản vietsub HD đa dạng. Từ anime học đường đến j-drama tuổi teen đều có đủ.' },
    ],
  },
  'am-nhac': {
    name: 'Âm Nhạc', icon: 'ri-music-2-line',
    color: 'from-violet-600', colorTo: 'to-fuchsia-700', accent: '#7c3aed',
    bgImage: 'https://readdy.ai/api/search-image?query=music%20movie%20concert%20stage%20lights%20colorful%20vibrant%20cinematic%20musical%20film%20aesthetic%20singer%20performer%20dramatic%20lighting%20crowd%20atmosphere&width=1400&height=500&seq=genre-am-nhac-1&orientation=landscape',
    desc: 'Xem phim âm nhạc vietsub miễn phí HD tại KhoPhim. Phim ca nhạc, musical hay nhất 2026.',
    keywords: 'phim âm nhạc, phim am nhac, phim ca nhac, phim musical, phim am nhac hay',
    faq: [
      { q: 'Xem phim âm nhạc vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim âm nhạc vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim âm nhạc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim âm nhạc được đánh giá cao nhất 2026. Vào mục Phim Âm Nhạc để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim musical Hàn Quốc không?', a: 'KhoPhim có đầy đủ phim âm nhạc Hàn Quốc vietsub HD, từ drama về idol đến phim nhạc kịch. Cập nhật liên tục.' },
      { q: 'Phim âm nhạc Âu Mỹ hay nhất là gì?', a: 'KhoPhim có kho phim âm nhạc Âu Mỹ vietsub HD đa dạng. Từ musical kinh điển đến phim âm nhạc mới nhất 2026 đều có đủ.' },
    ],
  },
  'kinh-dien': {
    name: 'Kinh Điển', icon: 'ri-film-line',
    color: 'from-neutral-600', colorTo: 'to-stone-700', accent: '#525252',
    bgImage: 'https://readdy.ai/api/search-image?query=classic%20cinema%20vintage%20film%20noir%20black%20white%20dramatic%20lighting%20old%20hollywood%20cinematic%20aesthetic%20timeless%20masterpiece%20retro%20atmosphere%20film%20reel&width=1400&height=500&seq=genre-kinh-dien-1&orientation=landscape',
    desc: 'Xem phim kinh điển vietsub miễn phí HD tại KhoPhim. Phim kinh điển bất hủ mọi thời đại.',
    keywords: 'phim kinh điển, phim kinh dien, phim classic, phim co dien, phim kinh dien hay',
    faq: [
      { q: 'Xem phim kinh điển vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim kinh điển vietsub HD từ nhiều quốc gia và thời đại. Tất cả đều miễn phí, không quảng cáo.' },
      { q: 'Phim kinh điển hay nhất mọi thời đại là gì?', a: 'KhoPhim tổng hợp phim kinh điển được đánh giá cao nhất mọi thời đại. Vào mục Phim Kinh Điển để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim kinh điển Hollywood không?', a: 'KhoPhim có đầy đủ phim kinh điển Hollywood vietsub HD, từ phim đen trắng đến các tác phẩm kinh điển thập niên 80-90.' },
      { q: 'Phim kinh điển Châu Á hay nhất là gì?', a: 'KhoPhim có kho phim kinh điển Châu Á vietsub HD đa dạng. Từ phim kinh điển Hồng Kông, Nhật Bản đến Hàn Quốc đều có đủ.' },
    ],
  },
  'tai-lieu': {
    name: 'Tài Liệu', icon: 'ri-camera-lens-line',
    color: 'from-slate-600', colorTo: 'to-gray-700', accent: '#475569',
    bgImage: 'https://readdy.ai/api/search-image?query=documentary%20film%20nature%20wildlife%20cinematic%20dramatic%20landscape%20earth%20aerial%20view%20dark%20atmospheric%20film%20aesthetic%20real%20world%20storytelling&width=1400&height=500&seq=genre-tai-lieu-1&orientation=landscape',
    desc: 'Xem phim tài liệu vietsub miễn phí HD tại KhoPhim. Phim documentary hay nhất 2026.',
    keywords: 'phim tài liệu, phim tai lieu, phim documentary, phim tai lieu hay, phim tai lieu thien nhien',
    faq: [
      { q: 'Xem phim tài liệu vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim tài liệu vietsub HD từ nhiều chủ đề. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim tài liệu hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim tài liệu được đánh giá cao nhất 2026. Vào mục Phim Tài Liệu để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim tài liệu Netflix không?', a: 'KhoPhim có nhiều phim tài liệu từ Netflix và các hãng sản xuất lớn vietsub HD. Cập nhật liên tục hàng ngày.' },
      { q: 'Phim tài liệu về thiên nhiên hay nhất là gì?', a: 'KhoPhim có kho phim tài liệu thiên nhiên, khoa học vietsub HD đa dạng. Từ BBC Earth đến National Geographic đều có đủ.' },
    ],
  },
  'the-thao': {
    name: 'Thể Thao', icon: 'ri-trophy-line',
    color: 'from-orange-500', colorTo: 'to-red-600', accent: '#ea580c',
    bgImage: 'https://readdy.ai/api/search-image?query=sports%20movie%20stadium%20dramatic%20lighting%20athletic%20competition%20cinematic%20intense%20action%20film%20aesthetic%20victory%20champion%20crowd%20energy&width=1400&height=500&seq=genre-the-thao-1&orientation=landscape',
    desc: 'Xem phim thể thao vietsub miễn phí HD tại KhoPhim. Phim sports hay nhất 2026.',
    keywords: 'phim thể thao, phim the thao, phim sports, phim bong da, phim the thao hay',
    faq: [
      { q: 'Xem phim thể thao vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim thể thao vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim thể thao hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim thể thao được đánh giá cao nhất 2026. Vào mục Phim Thể Thao để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim bóng đá không?', a: 'KhoPhim có đầy đủ phim về bóng đá, bóng rổ và nhiều môn thể thao khác vietsub HD. Cập nhật liên tục hàng ngày.' },
      { q: 'Phim thể thao Hàn Quốc hay nhất là gì?', a: 'KhoPhim có kho phim thể thao Hàn Quốc vietsub HD đa dạng. Từ drama bóng chày, bóng rổ đến phim thể thao điện ảnh đều có đủ.' },
    ],
  },
  'khoa-hoc': {
    name: 'Khoa Học', icon: 'ri-flask-line',
    color: 'from-teal-600', colorTo: 'to-cyan-700', accent: '#0d9488',
    bgImage: 'https://readdy.ai/api/search-image?query=science%20movie%20laboratory%20technology%20futuristic%20cinematic%20dark%20atmospheric%20teal%20cyan%20tones%20research%20discovery%20film%20aesthetic%20innovation&width=1400&height=500&seq=genre-khoa-hoc-1&orientation=landscape',
    desc: 'Xem phim khoa học vietsub miễn phí HD tại KhoPhim. Phim khoa học viễn tưởng hay nhất 2026.',
    keywords: 'phim khoa học, phim khoa hoc, phim science, phim khoa hoc vien tuong, phim khoa hoc hay',
    faq: [
      { q: 'Xem phim khoa học vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim khoa học vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim khoa học hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim khoa học được đánh giá cao nhất 2026. Vào mục Phim Khoa Học để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim khoa học viễn tưởng không?', a: 'KhoPhim có đầy đủ phim khoa học viễn tưởng vietsub HD. Từ hard sci-fi đến space opera đều có đủ, cập nhật hàng ngày.' },
      { q: 'Phim khoa học Hàn Quốc hay nhất là gì?', a: 'KhoPhim có kho phim khoa học Hàn Quốc vietsub HD đa dạng. Từ drama khoa học đến phim điện ảnh sci-fi Hàn đều có đủ.' },
    ],
  },
  'chinh-kich': {
    name: 'Chính Kịch', icon: 'ri-emotion-sad-line',
    color: 'from-purple-700', colorTo: 'to-violet-800', accent: '#6d28d9',
    bgImage: 'https://readdy.ai/api/search-image?query=dramatic%20political%20thriller%20film%20dark%20moody%20atmosphere%20cinematic%20intense%20emotional%20powerful%20scene%20serious%20tone%20film%20noir%20style%20deep%20shadows%20dramatic%20lighting&width=1400&height=500&seq=genre-chinh-kich-1&orientation=landscape',
    desc: 'Xem phim chính kịch vietsub miễn phí HD tại KhoPhim. Phim drama chính trị, xã hội, gia đình hay nhất 2026.',
    keywords: 'phim chính kịch, phim chinh kich, phim drama chinh tri, phim xã hội, phim chinh kich hay',
    faq: [
      { q: 'Xem phim chính kịch vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim chính kịch vietsub HD từ nhiều quốc gia. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
      { q: 'Phim chính kịch hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim chính kịch được đánh giá cao nhất 2026. Vào mục Phim Chính Kịch để xem danh sách đầy đủ.' },
      { q: 'KhoPhim có phim chính kịch Hàn Quốc không?', a: 'KhoPhim có đầy đủ phim chính kịch Hàn Quốc vietsub HD, từ drama chính trị đến phim xã hội sâu sắc. Cập nhật liên tục.' },
      { q: 'Phim chính kịch hay nhất là gì?', a: 'KhoPhim tổng hợp phim chính kịch hay nhất từ nhiều quốc gia. Từ drama chính trị đến phim gia đình sâu sắc đều có đủ.' },
    ],
  },
  'bl': {
    name: 'BL', icon: 'ri-hearts-line',
    color: 'from-fuchsia-600', colorTo: 'to-pink-700', accent: '#d946ef',
    bgImage: 'https://readdy.ai/api/search-image?query=boy%20love%20drama%20romantic%20cinematic%20scene%20two%20young%20men%20soft%20neon%20pink%20and%20blue%20lighting%20modern%20city%20night%20emotional%20warm%20film%20poster%20style&width=1400&height=500&seq=genre-bl-1&orientation=landscape',
    desc: 'Xem phim BL, Boy Love, đam mỹ vietsub HD miễn phí tại KhoPhim. Tổng hợp BL Thái Lan, Hàn Quốc, Nhật Bản, Đài Loan và Trung Quốc.',
    keywords: 'phim BL, phim boy love, phim đam mỹ, phim dam my, BL Thái Lan, BL vietsub',
    faq: [
      { q: 'Phim BL là gì?', a: 'BL là Boy Love, dòng phim tình cảm nam - nam. KhoPhim tổng hợp phim BL vietsub từ Thái Lan, Hàn Quốc, Nhật Bản, Đài Loan và Trung Quốc.' },
      { q: 'KhoPhim có phim BL Thái Lan không?', a: 'Có. Mục BL ưu tiên các phim Boy Love, đam mỹ, BL Thái Lan và các series châu Á có vietsub HD.' },
      { q: 'Xem phim BL vietsub miễn phí ở đâu?', a: 'Bạn có thể xem phim BL vietsub miễn phí tại KhoPhim, cập nhật liên tục theo nguồn phim hiện có.' },
      { q: 'Mục BL có phim mới không?', a: 'Danh sách BL được lấy theo từ khóa Boy Love, BL và đam mỹ nên sẽ tự cập nhật khi nguồn phim có phim mới phù hợp.' },
    ],
  },
  'gl': {
    name: 'GL', icon: 'ri-heart-2-line',
    color: 'from-rose-500', colorTo: 'to-violet-700', accent: '#f43f5e',
    bgImage: 'https://readdy.ai/api/search-image?query=girl%20love%20drama%20romantic%20cinematic%20scene%20two%20young%20women%20soft%20rose%20violet%20lighting%20modern%20city%20night%20emotional%20warm%20film%20poster%20style&width=1400&height=500&seq=genre-gl-1&orientation=landscape',
    desc: 'Xem phim GL, Girl Love, bách hợp vietsub HD miễn phí tại KhoPhim. Tổng hợp phim tình cảm nữ - nữ từ Thái Lan, Hàn Quốc, Nhật Bản và châu Á.',
    keywords: 'phim GL, phim girl love, phim bách hợp, phim bach hop, GL vietsub, phim nữ nữ',
    faq: [
      { q: 'Phim GL là gì?', a: 'GL là Girl Love, dòng phim tình cảm nữ - nữ. KhoPhim tổng hợp phim GL, bách hợp vietsub từ nhiều quốc gia châu Á.' },
      { q: 'KhoPhim có phim bách hợp không?', a: 'Có. Mục GL ưu tiên các phim Girl Love, bách hợp và phim tình cảm nữ - nữ có vietsub HD.' },
      { q: 'Xem phim GL vietsub miễn phí ở đâu?', a: 'Bạn có thể xem phim GL vietsub miễn phí tại KhoPhim, danh sách được cập nhật theo dữ liệu phim mới.' },
      { q: 'Mục GL có tự cập nhật phim mới không?', a: 'Có. Trang GL tìm theo các từ khóa Girl Love, GL và bách hợp nên sẽ tự lấy thêm phim khi nguồn có dữ liệu phù hợp.' },
    ],
  },
};
  

const SORT_OPTIONS = [
  { value: 'modified.time_desc', label: 'Mới cập nhật', icon: 'ri-time-line' },
  { value: 'year_desc', label: 'Năm mới nhất', icon: 'ri-calendar-line' },
  { value: 'year_asc', label: 'Năm cũ nhất', icon: 'ri-history-line' },
];

const PAGE_SIZE = 36;
const POOL_CACHE_TTL = 10 * 60 * 1000;
const VIRTUAL_GENRE_KEYWORDS: Record<string, string[]> = {
};

function getMovieKey(movie: MovieItem): string {
  return movie._id || movie.slug || `${movie.name}-${movie.year ?? ''}`;
}

function mergeUniqueMovies(items: MovieItem[]): MovieItem[] {
  const seen = new Set<string>();
  return items.filter((movie) => {
    const key = getMovieKey(movie);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferTotalPages(totalPages: number, itemCount: number, pg: number): number {
  if (itemCount >= PAGE_SIZE) return Math.max(totalPages, pg + 1);
  return Math.max(totalPages, pg);
}
function inferCachedTotalPages(items: MovieItem[], current = 1): number {
  return Math.max(current, Math.ceil(items.length / PAGE_SIZE) + (items.length >= PAGE_SIZE ? 1 : 0), 1);
}

function getPoolCacheKey(slug: string, sort: string) {
  return `kp_genre_${slug}_${sort}_v2`;
}

function getPoolCache(slug: string, sort: string): MovieItem[] | null {
  try {
    const key = getPoolCacheKey(slug, sort);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: MovieItem[]; ts: number };
    if (Date.now() - entry.ts > POOL_CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return entry.data;
  } catch { return null; }
}

function setPoolCache(slug: string, sort: string, data: MovieItem[]): void {
  try {
    const key = getPoolCacheKey(slug, sort);
    setSmartSessionCache(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota */ }
}

/* ─── Skeleton card ─── */
function SkeletonCard() {
  return (
    <div>
      <div className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
      <div className="mt-2 h-3 rounded bg-white/5 animate-pulse w-3/4" />
      <div className="mt-1 h-2.5 rounded bg-white/5 animate-pulse w-1/2" />
    </div>
  );
}

/* ─── Related genre card ─── */
function RelatedGenreCard({ slug: s, meta: m }: { slug: string; meta: typeof GENRE_META[string] }) {
  return (
    <Link
      to={`/the-loai/${s}`}
      className="group flex items-center gap-2.5 bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/20 rounded-xl px-3 py-2.5 transition-all cursor-pointer"
    >
      <div className={`w-7 h-7 flex items-center justify-center rounded-lg bg-gradient-to-br ${m.color} ${m.colorTo} flex-shrink-0`}>
        <i className={`${m.icon} text-white text-xs`} />
      </div>
      <span className="text-xs text-white/60 group-hover:text-white/90 transition-colors whitespace-nowrap">{m.name}</span>
    </Link>
  );
}

export default function GenrePage() {
  const { slug } = useParams<{ slug: string }>();
  const hiddenStandaloneGenres = new Set(['bl', 'gl']);
  const meta = slug && !hiddenStandaloneGenres.has(slug) ? GENRE_META[slug] : null;

  const [searchParams, setSearchParams] = useSearchParams();
  
  // Read page from URL param
  const urlPage = parseInt(searchParams.get('page') ?? '1', 10);
  const [page, setPage] = useState(isNaN(urlPage) || urlPage < 1 ? 1 : urlPage);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  // Sync page state with URL param
  useEffect(() => {
    const p = parseInt(searchParams.get('page') ?? '1', 10);
    if (!isNaN(p) && p >= 1 && p !== page) {
      setPage(p);
    }
  }, [searchParams, page]);

  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('modified.time_desc');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const poolMapRef = useRef<Record<string, MovieItem[]>>({});
  const seenMapRef = useRef<Record<string, Set<string>>>({});
  const totalPagesMapRef = useRef<Record<string, number>>({});
  const totalItemsMapRef = useRef<Record<string, number>>({});
  const { heroRef, showHeroBg, heroImgLoaded, setHeroImgLoaded } = useHeroLazyLoad();

  const getSortParams = (sort: string) => {
    if (sort === 'year_desc') return { sortField: 'year', sortType: 'desc' as const };
    if (sort === 'year_asc') return { sortField: 'year', sortType: 'asc' as const };
    return { sortField: 'modified.time', sortType: 'desc' as const };
  };

  const fetchMovies = useCallback(async (pg: number, reset = false, sort = sortBy) => {
    if (!slug) return;
    if (reset) {
      if (pg === 1) {
        // In-memory cache hit
        const cached = poolMapRef.current[sort];
        if (cached && cached.length > 0) {
          setMovies(cached);
          setTotalPages(inferCachedTotalPages(cached, totalPagesMapRef.current[sort] ?? 1));
          setTotalItems(totalItemsMapRef.current[sort] ?? cached.length);
          setLoading(false);
          return;
        }
        // SessionStorage cache hit
        const ssCached = getPoolCache(slug, sort);
        if (ssCached && ssCached.length > 0) {
          poolMapRef.current[sort] = ssCached;
          seenMapRef.current[sort] = new Set(ssCached.map(getMovieKey));
          setMovies(ssCached);
          setTotalPages(inferCachedTotalPages(ssCached, totalPagesMapRef.current[sort] ?? 1));
          setTotalItems(totalItemsMapRef.current[sort] ?? ssCached.length);
          setLoading(false);
          return;
        }
      }
      seenMapRef.current[sort] = new Set();
      poolMapRef.current[sort] = [];
      setMovies([]);
      setTotalPages(1);
      setTotalItems(0);
    }
    setLoading(true);
    try {
      const sortParams = getSortParams(sort);
      const virtualKeywords = VIRTUAL_GENRE_KEYWORDS[slug];
      const responses = virtualKeywords
        ? await Promise.all(virtualKeywords.map((keyword) => searchMovies(keyword, pg)))
        : [await fetchMoviesByCategory({
            type: 'phim-moi-cap-nhat',
            category: slug,
            page: pg,
            ...sortParams,
          })];
      const items = mergeUniqueMovies(responses.flatMap((data) => data.items ?? []));
      const seen = seenMapRef.current[sort] ?? new Set<string>();
      if (reset) {
        items.forEach((m) => seen.add(m._id));
        seenMapRef.current[sort] = seen;items.forEach((m) => seen.add(getMovieKey(m)));
        poolMapRef.current[sort] = items;
        setMovies(items);
      } else {
        const fresh = items.filter((m) => !seen.has(getMovieKey(m)));
        fresh.forEach((m) => seen.add(getMovieKey(m)));
        seenMapRef.current[sort] = seen;
        const updated = [...(poolMapRef.current[sort] ?? []), ...fresh];
        poolMapRef.current[sort] = updated;
        setMovies(updated);
      }
      const tp = inferTotalPages(
        Math.max(...responses.map((data) => data.pagination?.totalPages ?? 1)),
        items.length,
        pg,
      );
      const ti = Math.max(...responses.map((data) => data.pagination?.totalItems ?? 0), items.length);
      setTotalPages(tp);
      totalPagesMapRef.current[sort] = tp;
      setTotalItems(ti);
      totalItemsMapRef.current[sort] = ti;
      if (pg === 1 && poolMapRef.current[sort]?.length) {
        setPoolCache(slug, sort, poolMapRef.current[sort]);
      }
    } catch {
      if (reset) setMovies([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // Genre changed — wipe all sort caches
    poolMapRef.current = {};
    seenMapRef.current = {};
    totalPagesMapRef.current = {};
    totalItemsMapRef.current = {};
    setMovies([]);
    setPage(1);
    setSearchParams({});
    fetchMovies(1, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [slug, fetchMovies, setSearchParams]);

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setPage(1);
    setSearchParams({});
    fetchMovies(1, true, newSort);
  };

  const handlePageChange = useCallback((next: number) => {
    setPage(next);
    fetchMovies(next, true, sortBy);
  }, [fetchMovies, sortBy]);

  if (!meta) {
    return (
      <div className="min-h-screen kp-cinema-page text-white">
        <SEO title="Thể Loại Không Tồn Tại – KhoPhim" description="Thể loại phim không tồn tại." noIndex />
        <Navbar />
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <i className="ri-error-warning-line text-5xl text-white/20" />
          <p className="text-white/40">Thể loại không tồn tại</p>
          <Link to="/" className="text-red-400 hover:text-red-300 text-sm">← Về trang chủ</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const seoTitle = `Phim ${meta.name} Vietsub HD Miễn Phí | KhoPhim`;
  const canonicalPath = `/the-loai/${slug}`;

  // Self-referencing canonical — includes page param when page > 1
  const canonicalUrl = page > 1 
    ? `${SITE_URL}${canonicalPath}?page=${page}` 
    : `${SITE_URL}${canonicalPath}`;

  // Pagination links
  const prevPage = page > 1 
    ? (page > 2 ? `${SITE_URL}${canonicalPath}?page=${page - 1}` : `${SITE_URL}${canonicalPath}`)
    : undefined;
  const nextPage = page < totalPages ? `${SITE_URL}${canonicalPath}?page=${page + 1}` : undefined;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: `Phim ${meta.name}`, item: `${SITE_URL}${canonicalPath}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: seoTitle,
      url: `${SITE_URL}${canonicalPath}`,
      description: meta.desc,
      inLanguage: 'vi',
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
    },
    ...(movies.length > 0 ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Phim ${meta.name} – Danh Sách`,
      url: `${SITE_URL}${canonicalPath}`,
      numberOfItems: movies.length,
      itemListElement: movies.slice(0, 10).map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/phim/${m.slug}`,
        name: m.name,
      })),
    }] : []),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: meta.faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];

  const otherGenres = Object.entries(GENRE_META).filter(([s]) => s !== slug);

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title={seoTitle}
        description={meta.desc}
        keywords={meta.keywords}
        canonical={canonicalUrl}
        prev={prevPage}
        next={nextPage}
        schema={schema}
      />
      <Navbar />

      {/* ─── Hero Banner ─── */}
      <div ref={heroRef} className="relative w-full h-[220px] sm:h-[340px] md:h-[420px] overflow-hidden">
        {/* Background image — lazy loaded via IntersectionObserver */}
        <div className="absolute inset-0">
          {showHeroBg ? (
            <img
              src={meta.bgImage}
              alt={`Phim ${meta.name}`}
              className={`w-full h-full object-cover object-top transition-opacity duration-700 ${heroImgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setHeroImgLoaded(true)}
            />
          ) : null}
          {/* Skeleton placeholder while off-screen / loading */}
          <div
            className={`absolute inset-0 bg-gradient-to-br ${meta.color} ${meta.colorTo} ${showHeroBg && heroImgLoaded ? 'opacity-0' : 'opacity-40'} transition-opacity duration-500`}
          />
        </div>
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080a10] via-[#080a10]/60 to-black/40" />
        {/* Gradient accent overlay */}
        <div className={`absolute inset-0 bg-gradient-to-r ${meta.color} ${meta.colorTo} opacity-20`} />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-end max-w-[1760px] mx-auto px-4 pb-6 sm:pb-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 mb-3 sm:mb-4 text-[11px] sm:text-xs text-white/40 flex-wrap">
            <Link to="/" className="hover:text-white/70 transition-colors">Trang chủ</Link>
            <i className="ri-arrow-right-s-line" />
            <Link to="/" className="hover:text-white/70 transition-colors hidden sm:inline">Thể loại</Link>
            <i className="ri-arrow-right-s-line hidden sm:inline" />
            <span className="text-white/70">Phim {meta.name}</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-5">
            {/* Genre icon badge */}
            <div
              className={`w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl bg-gradient-to-br ${meta.color} ${meta.colorTo} flex-shrink-0`}
              style={{ boxShadow: `0 0 30px ${meta.accent}60` }}
            >
              <i className={`${meta.icon} text-white text-xl sm:text-2xl`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span
                  className={`text-[10px] sm:text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gradient-to-r ${meta.color} ${meta.colorTo} text-white`}
                >
                  THỂ LOẠI
                </span>
                {!loading && totalItems > 0 && (
                  <span className="text-[10px] sm:text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                    {totalItems.toLocaleString()} phim
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">
                Phim {meta.name} Vietsub HD Miễn Phí{page > 1 ? ` – Trang ${page}` : ''}
              </h1>
              <p className="text-white/50 text-xs sm:text-sm max-w-2xl leading-relaxed line-clamp-2">
                {meta.desc}
              </p>
            </div>

            {/* Quick action */}
            <Link
              to={`/filter?genre=${slug}`}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto mt-1 sm:mt-0"
            >
              <i className="ri-equalizer-2-line" />
              Lọc nâng cao
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-[1760px] mx-auto px-4 pb-16">
        {/* ─── Sort & Filter Bar ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 py-4 sm:py-5 border-b border-white/5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
            <span className="text-xs text-white/30 mr-1 flex-shrink-0">Sắp xếp:</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSortChange(opt.value)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  sortBy === opt.value
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                <i className={opt.icon} />
                {opt.label}
              </button>
            ))}
          </div>

          {!loading && totalItems > 0 && (
            <div className="text-xs text-white/30 flex-shrink-0">
              Hiển thị <span className="text-white/60">{movies.length}</span> / {totalItems.toLocaleString()} phim
            </div>
          )}
        </div>

        {/* ─── Movie Grid ─── */}
        <div className="pt-6">
          {loading && movies.length === 0 ? (
            <div className="grid movie-grid-desktop">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-white/30">
              <div className={`w-20 h-20 flex items-center justify-center rounded-2xl bg-gradient-to-br ${meta.color} ${meta.colorTo} opacity-30 mb-4`}>
                <i className={`${meta.icon} text-white text-3xl`} />
              </div>
              <p className="text-lg font-medium mb-1">Không có phim nào</p>
              <p className="text-sm text-white/20">Thể loại này chưa có phim hoặc đang cập nhật</p>
            </div>
          ) : (
            <>
              <div className="grid movie-grid-desktop">
                {movies.map((m, idx) => (
                  <MovieCard key={getMovieKey(m)} movie={m} priority={idx < 2} />
                ))}
              </div>

              <Pagination
                currentPage={page}
                totalPages={totalPages}
                basePath={canonicalPath}
                hasNext={page < totalPages}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </div>

        {/* ─── FAQ Section ─── */}
        <div className="mt-10 sm:mt-16 pt-6 sm:pt-10 border-t border-white/5">
          <h2 className="text-base sm:text-lg font-bold text-white mb-4 sm:mb-6 flex items-center gap-2">
            <i className="ri-question-answer-line text-red-400" />
            Câu hỏi thường gặp về Phim {meta.name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {meta.faq.map((item, i) => (
              <div
                key={i}
                className="bg-white/3 border border-white/8 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-left cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm text-white/80 font-medium leading-snug">{item.q}</span>
                  <i className={`ri-arrow-down-s-line text-white/30 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-3 sm:px-4 pb-4 text-sm text-white/50 leading-relaxed border-t border-white/5 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Related Genres ─── */}
        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-white/5">
          <h2 className="text-xs sm:text-sm font-semibold text-white/40 mb-3 sm:mb-4 uppercase tracking-wider flex items-center gap-2">
            <i className="ri-apps-2-line" />
            Khám phá thể loại khác
          </h2>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {otherGenres.slice(0, 20).map(([s, m]) => (
              <RelatedGenreCard key={s} slug={s} meta={m} />
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
