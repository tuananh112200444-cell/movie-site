import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import MovieCard from '../../components/base/MovieCard';
import FeaturedSection from './components/FeaturedSection';
import SEO, { SITE_URL } from '../../components/base/SEO';
import CategorySEOContent from './components/CategorySEOContent';
import { useLazySection } from '@/hooks/useLazySection';
import { useMoviesByType } from '@/hooks/useMovies';
import Pagination from '@/components/base/Pagination';
import type { Movie } from '../../types/movie';

interface MovieListPageProps {
  type: 'phim-le' | 'phim-bo' | 'phim-sap-chieu' | 'tv-shows' | 'hoat-hinh' | 'phim-chieu-rap';
  title: string;
  countryFilter?: string;
}

const COUNTRY_META: Record<string, { title: string; keywords: string; path: string; desc: string }> = {
  'han-quoc':   { title: 'Phim Hàn Quốc',  path: '/phim-han-quoc',   keywords: 'phim Hàn, phim han quoc, phim Hàn Quốc, drama Hàn, phim Hàn vietsub, phim han quoc vietsub, phim Hàn hay', desc: 'Xem 12.000+ phim Hàn Quốc vietsub HD miễn phí tại KhoPhim 2026. Kho drama Hàn lớn nhất: romance, hành động, cổ trang, kinh dị. Cập nhật tập mới nhanh nhất, không quảng cáo!' },
  'trung-quoc': { title: 'Phim Trung Quốc', path: '/phim-trung-quoc', keywords: 'phim Trung, phim trung quoc, phim Trung Quốc, phim cổ trang, tien hiep, tiên hiệp, phim Trung vietsub', desc: 'Xem 20.000+ phim Trung Quốc vietsub HD miễn phí tại KhoPhim 2026. Cổ trang hoàng cung, tiên hiệp tu tiên, ngôn tình hiện đại. Cập nhật liên tục, không quảng cáo, xem ngay!' },
  'thai-lan':   { title: 'Phim Thái Lan',   path: '/phim-thai-lan',   keywords: 'phim Thái, phim thai lan, phim Thái Lan, phim BL Thái, lakorn, phim thai lan vietsub', desc: 'Xem 3.000+ phim Thái Lan vietsub HD miễn phí tại KhoPhim 2026. Lakorn tình cảm, BL drama, phim hành động Thái. Cập nhật hàng ngày, không quảng cáo, xem ngay!' },
  'au-my':      { title: 'Phim Âu Mỹ',      path: '/phim-au-my',      keywords: 'phim Mỹ, phim au my, phim Âu Mỹ, phim Hollywood, phim Marvel, phim DC vietsub', desc: 'Xem 8.000+ phim Âu Mỹ vietsub HD miễn phí tại KhoPhim 2026. Bom tấn Hollywood, Marvel, DC, series Netflix HBO mới nhất. Cập nhật nhanh sau ra rạp, không quảng cáo!' },
  'nhat-ban':   { title: 'Phim Nhật Bản',   path: '/phim-nhat-ban',   keywords: 'anime, phim Nhật, phim nhat ban, phim Nhật Bản, anime vietsub, j-drama, phim nhat hay', desc: 'Xem 6.000+ anime và phim Nhật Bản vietsub HD miễn phí tại KhoPhim 2026. Anime mùa mới, j-drama, điện ảnh Nhật. Cập nhật hàng tuần, không quảng cáo, xem ngay!' },
  'viet-nam':   { title: 'Phim Việt Nam',   path: '/phim-viet-nam',   keywords: 'phim Việt, phim viet nam, phim Việt Nam, phim Việt hay, phim chieu rap Viet, phim bo Viet', desc: 'Xem 2.000+ phim Việt Nam HD miễn phí tại KhoPhim 2026. Phim chiếu rạp bom tấn, phim bộ truyền hình, phim hài. Cập nhật hàng ngày, không quảng cáo, xem ngay!' },
};

const TYPE_META: Record<string, { keywords: string; desc: string }> = {
  'phim-le':        { keywords: 'phim lẻ, phim le, phim lẻ vietsub, phim le vietsub, phim điện ảnh, phim lẻ hay, phim le hay, phim lẻ 2026', desc: 'Xem 10.000+ phim lẻ vietsub HD miễn phí tại KhoPhim 2026. Phim điện ảnh hay nhất từ Hollywood, Hàn, Trung, Việt. Cập nhật hàng ngày, không quảng cáo, xem ngay!' },
  'phim-bo':        { keywords: 'phim bộ, phim bo, phim bộ vietsub, phim bo vietsub, phim series, phim bộ hay, phim bo hay, phim bộ 2026', desc: 'Xem 15.000+ phim bộ vietsub HD miễn phí tại KhoPhim 2026. Series Hàn, Trung, Âu Mỹ, Việt Nam. Cập nhật tập mới nhanh nhất, không quảng cáo, xem ngay!' },
  'phim-sap-chieu': { keywords: 'phim sắp chiếu, phim sap chieu, phim sắp ra mắt, trailer phim, phim hot 2026', desc: 'Danh sách phim sắp chiếu 2026 hot nhất tại KhoPhim. Trailer chính thức, lịch ra mắt, dàn diễn viên bom tấn. Cập nhật sớm nhất – theo dõi để không bỏ lỡ!' },
  'tv-shows':       { keywords: 'TV shows, TV shows vietsub, series truyền hình, reality show, Netflix HBO', desc: 'Xem 5.000+ TV shows vietsub HD miễn phí tại KhoPhim 2026. Series Netflix, HBO, Disney+, reality show. Cập nhật mỗi ngày, không quảng cáo, xem ngay!' },
  'hoat-hinh':      { keywords: 'hoạt hình, hoat hinh, anime, anime vietsub, cartoon, hoat hinh hay, anime mùa mới 2026', desc: 'Xem 8.000+ hoạt hình & anime vietsub HD miễn phí tại KhoPhim 2026. Anime mùa mới, cartoon Disney Pixar. Cập nhật hàng tuần, không quảng cáo, xem ngay!' },
  'phim-chieu-rap': { keywords: 'phim chiếu rạp, phim chieu rap, phim chiếu rạp 2026, phim chieu rap 2026, phim rạp, blockbuster, phim rạp hay', desc: 'Xem 3.000+ phim chiếu rạp vietsub HD miễn phí tại KhoPhim 2026. Blockbuster Hollywood, Hàn, Việt mới nhất. Cập nhật nhanh sau ra rạp, không quảng cáo!' },
};

const COUNTRY_FAQ: Record<string, Array<{ q: string; a: string }>> = {
  'han-quoc': [
    { q: 'Xem phim Hàn Quốc vietsub miễn phí ở đâu?', a: 'KhoPhim (khophim.org) là nơi xem phim Hàn Quốc vietsub miễn phí tốt nhất. Hàng nghìn drama Hàn từ romance, hành động đến cổ trang đều có vietsub HD, không quảng cáo, không cần đăng ký.' },
    { q: 'Phim Hàn Quốc 2026 mới nhất có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật phim Hàn Quốc 2026 hàng ngày, bao gồm các drama đang chiếu trên Netflix, tvN, MBC, SBS với vietsub nhanh nhất.' },
    { q: 'KhoPhim có phim Hàn Quốc lồng tiếng không?', a: 'Ngoài vietsub, KhoPhim còn có nhiều phim Hàn Quốc được lồng tiếng Việt, phù hợp cho người xem không muốn đọc phụ đề.' },
    { q: 'Phim Hàn Quốc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp các phim Hàn Quốc được đánh giá cao nhất 2026 từ các thể loại: romance, thriller, cổ trang, hành động. Vào mục Phim Hàn Quốc để xem danh sách đầy đủ.' },
  ],
  'trung-quoc': [
    { q: 'Xem phim Trung Quốc cổ trang vietsub ở đâu?', a: 'KhoPhim có kho phim Trung Quốc cổ trang, tiên hiệp, hiện đại vietsub HD khổng lồ. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
    { q: 'Phim Trung Quốc 2026 mới nhất có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật phim Trung Quốc 2026 liên tục, bao gồm phim cổ trang, tiên hiệp, hiện đại, hành động với vietsub đầy đủ.' },
    { q: 'KhoPhim có phim tiên hiệp Trung Quốc không?', a: 'KhoPhim có đầy đủ phim tiên hiệp, tu tiên, cổ trang Trung Quốc vietsub HD. Từ các bộ phim kinh điển đến mới nhất 2026 đều có đủ.' },
    { q: 'Phim Trung Quốc hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim Trung Quốc được đánh giá cao nhất 2026 từ cổ trang, tiên hiệp đến hiện đại. Vào mục Phim Trung Quốc để khám phá.' },
  ],
  'au-my': [
    { q: 'Xem phim Âu Mỹ vietsub miễn phí ở đâu?', a: 'KhoPhim cung cấp phim Âu Mỹ, Hollywood vietsub HD miễn phí. Từ blockbuster Marvel, DC đến phim độc lập đều có đủ, không quảng cáo.' },
    { q: 'Phim Hollywood 2026 mới nhất có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật phim Hollywood 2026 nhanh nhất, bao gồm các bom tấn Marvel, DC, Disney và nhiều hãng phim lớn khác với vietsub HD.' },
    { q: 'KhoPhim có phim Marvel và DC không?', a: 'KhoPhim có đầy đủ phim Marvel Cinematic Universe và DC Extended Universe vietsub HD, từ các phim cũ đến mới nhất 2026.' },
    { q: 'Phim Âu Mỹ hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp các phim Âu Mỹ được đánh giá cao nhất 2026 từ action, sci-fi, drama đến comedy. Vào mục Phim Âu Mỹ để xem danh sách.' },
  ],
  'nhat-ban': [
    { q: 'Xem anime vietsub miễn phí ở đâu?', a: 'KhoPhim có kho anime vietsub HD khổng lồ, cập nhật anime mùa mới 2026 hàng tuần. Tất cả đều miễn phí, không quảng cáo.' },
    { q: 'Anime mùa mới 2026 có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật anime mùa mới 2026 nhanh nhất với vietsub đầy đủ. Từ shounen, shoujo, isekai đến slice of life đều có đủ.' },
    { q: 'KhoPhim có phim điện ảnh Nhật Bản không?', a: 'Ngoài anime, KhoPhim còn có phim điện ảnh Nhật Bản, j-drama vietsub HD. Từ phim của Studio Ghibli đến các tác phẩm điện ảnh nổi tiếng.' },
    { q: 'Anime hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp anime được đánh giá cao nhất 2026 từ nhiều thể loại. Vào mục Phim Nhật Bản để khám phá danh sách anime hot nhất.' },
  ],
  'thai-lan': [
    { q: 'Xem phim Thái Lan vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim Thái Lan vietsub HD đa dạng, từ tình cảm, hành động đến BL Thái. Tất cả miễn phí, không quảng cáo, cập nhật hàng ngày.' },
    { q: 'Phim BL Thái Lan 2026 có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật phim BL Thái Lan 2026 đầy đủ với vietsub HD. Từ các series nổi tiếng đến phim điện ảnh BL Thái đều có đủ.' },
    { q: 'Phim Thái Lan hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim Thái Lan được đánh giá cao nhất 2026 từ tình cảm, hành động, kinh dị đến BL. Vào mục Phim Thái Lan để xem danh sách.' },
    { q: 'KhoPhim có lakorn Thái Lan không?', a: 'KhoPhim có đầy đủ lakorn (phim truyền hình Thái Lan) vietsub HD, cập nhật liên tục từ các đài truyền hình lớn của Thái Lan.' },
  ],
  'viet-nam': [
    { q: 'Xem phim Việt Nam online miễn phí ở đâu?', a: 'KhoPhim có kho phim Việt Nam online miễn phí HD, từ phim chiếu rạp, phim bộ truyền hình đến phim hài. Không quảng cáo, cập nhật hàng ngày.' },
    { q: 'Phim Việt Nam 2026 mới nhất có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật phim Việt Nam 2026 nhanh nhất, bao gồm phim chiếu rạp, phim truyền hình và web drama Việt Nam.' },
    { q: 'KhoPhim có phim hài Việt Nam không?', a: 'KhoPhim có đầy đủ phim hài Việt Nam, từ phim chiếu rạp đến phim truyền hình hài. Cập nhật liên tục với chất lượng HD.' },
    { q: 'Phim Việt Nam hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim Việt Nam được đánh giá cao nhất 2026. Vào mục Phim Việt Nam để xem danh sách phim hay nhất.' },
  ],
};

const TYPE_FAQ: Record<string, Array<{ q: string; a: string }>> = {
  'phim-le': [
    { q: 'Xem phim lẻ vietsub miễn phí ở đâu?', a: 'KhoPhim (khophim.org) là nơi xem phim lẻ vietsub HD miễn phí tốt nhất. Hàng nghìn phim điện ảnh từ khắp nơi trên thế giới, không quảng cáo, không cần đăng ký.' },
    { q: 'Phim lẻ 2026 mới nhất có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật phim lẻ 2026 hàng ngày, bao gồm phim từ Hollywood, Hàn Quốc, Trung Quốc, Việt Nam và nhiều quốc gia khác với vietsub HD.' },
    { q: 'KhoPhim có phim lẻ Full HD không?', a: 'KhoPhim cung cấp phim lẻ với chất lượng HD và Full HD. Bạn có thể xem phim với chất lượng cao nhất trực tiếp trên trình duyệt mà không cần tải app.' },
    { q: 'Phim lẻ hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp các phim lẻ được đánh giá cao nhất 2026 từ nhiều thể loại: hành động, tình cảm, kinh dị, viễn tưởng. Vào mục Phim Lẻ để khám phá.' },
  ],
  'phim-bo': [
    { q: 'Xem phim bộ vietsub miễn phí ở đâu?', a: 'KhoPhim có kho phim bộ vietsub HD khổng lồ từ Hàn Quốc, Trung Quốc, Âu Mỹ, Việt Nam. Tất cả đều miễn phí, không quảng cáo, cập nhật hàng ngày.' },
    { q: 'Phim bộ 2026 đang chiếu có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật phim bộ đang chiếu 2026 hàng ngày với vietsub nhanh nhất. Từ drama Hàn, phim Trung đến series Âu Mỹ đều có đủ.' },
    { q: 'KhoPhim có phim bộ hoàn tất không?', a: 'KhoPhim có cả phim bộ đang chiếu lẫn phim bộ đã hoàn tất. Bạn có thể lọc theo trạng thái để tìm phim phù hợp.' },
    { q: 'Phim bộ hay nhất 2026 là gì?', a: 'KhoPhim tổng hợp phim bộ được đánh giá cao nhất 2026 từ Hàn Quốc, Trung Quốc, Âu Mỹ. Vào mục Phim Bộ để xem danh sách đầy đủ.' },
  ],
  'phim-chieu-rap': [
    { q: 'Xem phim chiếu rạp online miễn phí ở đâu?', a: 'KhoPhim (khophim.org) là trang xem phim chiếu rạp online miễn phí tốt nhất 2026. Phim chiếu rạp được cập nhật nhanh sau khi ra mắt, chất lượng HD Full HD vietsub, không quảng cáo.' },
    { q: 'Phim chiếu rạp hay nhất 2026 là gì?', a: 'KhoPhim cập nhật đầy đủ phim chiếu rạp hot nhất 2026 từ Marvel, DC, Disney đến các bom tấn Hàn Quốc và Việt. Vào mục Phim Chiếu Rạp để xem danh sách đầy đủ.' },
  ],
  'hoat-hinh': [
    { q: 'Xem hoạt hình và anime vietsub miễn phí ở đâu?', a: 'KhoPhim có kho hoạt hình và anime vietsub HD khổng lồ. Từ anime Nhật Bản, cartoon Âu Mỹ đến hoạt hình Trung Quốc đều có đủ, miễn phí hoàn toàn.' },
    { q: 'Anime mùa mới 2026 có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật anime mùa mới 2026 hàng tuần với vietsub nhanh nhất. Từ shounen, shoujo, isekai đến slice of life đều có đủ.' },
  ],
  'tv-shows': [
    { q: 'Xem TV shows vietsub miễn phí ở đâu?', a: 'KhoPhim có kho TV shows vietsub HD từ Netflix, HBO, Disney+, Amazon Prime và nhiều nền tảng khác. Tất cả đều miễn phí, không quảng cáo.' },
    { q: 'TV shows 2026 mới nhất có ở KhoPhim không?', a: 'Có! KhoPhim cập nhật TV shows 2026 hàng ngày với vietsub nhanh nhất. Từ series Netflix, HBO đến reality show đều có đủ.' },
  ],
  'phim-sap-chieu': [
    { q: 'Phim hay nhất sắp ra mắt 2026 là gì?', a: 'KhoPhim cập nhật liên tục danh sách phim sắp chiếu từ khắp nơi trên thế giới. Bạn có thể theo dõi trang Phim Sắp Chiếu để xem trước trailer và chuẩn bị cho các bộ phim hot sắp ra mắt.' },
    { q: 'Xem trailer phim mới nhất ở đâu?', a: 'Tại mục Phim Sắp Chiếu của KhoPhim, bạn có thể xem trailer chính thức của tất cả phim sắp ra mắt với chất lượng HD. Cập nhật hàng ngày.' },
  ],
};

const CATEGORY_META_UI: Record<string, {
  icon: string;
  gradient: string;
  accentColor: string;
  description: string;
  stats: { label: string; value: string }[];
}> = {
  'phim-le':        { icon: 'ri-film-line',         gradient: 'from-red-600/25 via-rose-500/10 to-transparent',    accentColor: 'text-red-400',    description: 'Phim điện ảnh từ khắp nơi trên thế giới — vietsub HD miễn phí',          stats: [{ label: 'Phim lẻ', value: '10K+' }, { label: 'Cập nhật', value: 'Hàng ngày' }, { label: 'Chất lượng', value: 'Full HD' }] },
  'phim-bo':        { icon: 'ri-tv-2-line',          gradient: 'from-orange-600/25 via-amber-500/10 to-transparent', accentColor: 'text-orange-400', description: 'Series & drama từ Hàn, Trung, Âu Mỹ — cập nhật tập mới nhanh nhất',       stats: [{ label: 'Phim bộ', value: '15K+' }, { label: 'Tập phim', value: '500K+' }, { label: 'Quốc gia', value: '20+' }] },
  'phim-chieu-rap': { icon: 'ri-movie-2-line',       gradient: 'from-yellow-600/25 via-amber-500/10 to-transparent', accentColor: 'text-yellow-400', description: 'Blockbuster Hollywood, Hàn, Việt — cập nhật nhanh sau khi ra rạp',         stats: [{ label: 'Phim rạp', value: '3K+' }, { label: 'Bom tấn', value: 'Marvel/DC' }, { label: 'Cập nhật', value: 'Sau ra rạp' }] },
  'hoat-hinh':      { icon: 'ri-gamepad-line',       gradient: 'from-emerald-600/25 via-teal-500/10 to-transparent', accentColor: 'text-emerald-400',description: 'Anime Nhật Bản & cartoon thế giới — mùa mới cập nhật hàng tuần',          stats: [{ label: 'Anime/Cartoon', value: '8K+' }, { label: 'Mùa mới', value: '2026' }, { label: 'Thể loại', value: '30+' }] },
  'tv-shows':       { icon: 'ri-live-line',           gradient: 'from-cyan-600/25 via-sky-500/10 to-transparent',    accentColor: 'text-cyan-400',   description: 'Series Netflix, HBO, Disney+ — vietsub HD không quảng cáo',               stats: [{ label: 'TV Shows', value: '5K+' }, { label: 'Nền tảng', value: 'Netflix/HBO' }, { label: 'Cập nhật', value: 'Hàng ngày' }] },
  'phim-sap-chieu': { icon: 'ri-time-line',           gradient: 'from-violet-600/25 via-purple-500/10 to-transparent',accentColor: 'text-violet-400', description: 'Trailer & thông tin phim sắp ra mắt — không bỏ lỡ bom tấn nào',          stats: [{ label: 'Sắp chiếu', value: '200+' }, { label: 'Trailer HD', value: 'Đầy đủ' }, { label: 'Cập nhật', value: 'Sớm nhất' }] },
  'han-quoc':       { icon: 'ri-heart-line',          gradient: 'from-pink-600/25 via-rose-500/10 to-transparent',   accentColor: 'text-pink-400',   description: 'Drama Hàn Quốc vietsub — romance, thriller, cổ trang mới nhất',          stats: [{ label: 'Drama Hàn', value: '12K+' }, { label: 'Đài TV', value: 'tvN/SBS/MBC' }, { label: 'Cập nhật', value: 'Sau phát sóng' }] },
  'trung-quoc':     { icon: 'ri-ancient-gate-line',   gradient: 'from-red-700/25 via-orange-500/10 to-transparent',  accentColor: 'text-red-400',    description: 'Phim Trung Quốc cổ trang, tiên hiệp, hiện đại — vietsub đầy đủ',        stats: [{ label: 'Phim Trung', value: '20K+' }, { label: 'Cổ trang', value: 'Tiên hiệp' }, { label: 'Nguồn', value: 'iQIYI/Youku' }] },
  'au-my':          { icon: 'ri-earth-line',           gradient: 'from-sky-600/25 via-blue-500/10 to-transparent',   accentColor: 'text-sky-400',    description: 'Bom tấn Hollywood, Marvel, DC — vietsub HD Full HD',                     stats: [{ label: 'Phim Âu Mỹ', value: '8K+' }, { label: 'Marvel/DC', value: 'Đầy đủ' }, { label: 'Chất lượng', value: '4K/HDR' }] },
  'nhat-ban':       { icon: 'ri-sword-line',           gradient: 'from-rose-600/25 via-pink-500/10 to-transparent',  accentColor: 'text-rose-400',   description: 'Anime & J-Drama Nhật Bản — mùa mới cập nhật hàng tuần',                  stats: [{ label: 'Anime', value: '6K+' }, { label: 'Mùa mới', value: '2026' }, { label: 'Studio', value: 'Ufotable/MAPPA' }] },
  'thai-lan':       { icon: 'ri-flower-line',          gradient: 'from-teal-600/25 via-emerald-500/10 to-transparent',accentColor: 'text-teal-400',   description: 'Lakorn & BL Thái Lan — tình cảm, hành động, kinh dị vietsub',            stats: [{ label: 'Phim Thái', value: '3K+' }, { label: 'BL Drama', value: 'GMMTV' }, { label: 'Cập nhật', value: 'Hàng ngày' }] },
  'viet-nam':       { icon: 'ri-flag-line',            gradient: 'from-red-600/25 via-yellow-500/10 to-transparent', accentColor: 'text-red-400',    description: 'Phim Việt Nam chiếu rạp & truyền hình — cập nhật mới nhất',              stats: [{ label: 'Phim Việt', value: '2K+' }, { label: 'Chiếu rạp', value: 'Mới nhất' }, { label: 'Đài TV', value: 'VTV/HTV' }] },
};

const DEFAULT_UI = {
  icon: 'ri-film-line',
  gradient: 'from-red-600/25 via-rose-500/10 to-transparent',
  accentColor: 'text-red-400',
  description: 'Kho phim online miễn phí HD — vietsub không quảng cáo',
  stats: [{ label: 'Phim', value: '50K+' }, { label: 'Cập nhật', value: 'Hàng ngày' }, { label: 'Chất lượng', value: 'Full HD' }],
};

const PAGE_SIZE = 36;

function getMovieKey(movie: Movie): string {
  return movie._id || movie.slug || `${movie.name}-${movie.year ?? ''}`;
}

function getModifiedTime(movie: Movie): number {
  return new Date(movie.modified?.time ?? 0).getTime() || 0;
}

export default function MovieListPage({ type, title, countryFilter }: MovieListPageProps) {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const [sortBy, setSortBy] = useState<'new' | 'hot' | 'updated'>('new');
  const sortField = sortBy === 'updated' ? 'modified.time' : 'year_stable';

  /* ── Gọi API đúng page — không còn pool system ── */
  const { movies: rawMovies, loading, totalPages: hookTotalPages } = useMoviesByType(
    type,
    page,
    2,
    sortField,
  );

  /* ── Dedup + lọc country + sort theo mode ── */
  const movies = useMemo(() => {
    // Lọc country nếu cần
    let list = countryFilter
      ? rawMovies.filter((m) => m.country?.some((c: { slug: string }) => c.slug === countryFilter))
      : [...rawMovies];

    // Dedup
    const seen = new Set<string>();
    list = list.filter((m) => {
      const key = getMovieKey(m);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (sortBy === 'hot') {
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
      return [...list].sort((a, b) => score(b) - score(a)).slice(0, PAGE_SIZE);
    }

    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'new') {
        const byYear = (b.year ?? 0) - (a.year ?? 0);
        if (byYear !== 0) return byYear;
      }
      return getModifiedTime(b) - getModifiedTime(a);
    });

    return sorted.slice(0, PAGE_SIZE);
  }, [rawMovies, sortBy, countryFilter]);

  const totalPages = Math.max(1, hookTotalPages || 1);
  const hasNextPage = page < totalPages;

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [page]);

  const countryMeta = countryFilter ? COUNTRY_META[countryFilter] : undefined;
  const typeMeta    = TYPE_META[type];
  const seoTitle    = countryMeta
    ? `${countryMeta.title} 2026 – Vietsub HD Miễn Phí | KhoPhim`
    : type === 'phim-le'        ? 'Phim Lẻ 2026 – Vietsub HD Miễn Phí | KhoPhim'
    : type === 'phim-bo'        ? 'Phim Bộ 2026 – Vietsub HD Miễn Phí | KhoPhim'
    : type === 'phim-chieu-rap' ? 'Phim Chiếu Rạp 2026 – Vietsub HD Miễn Phí | KhoPhim'
    : type === 'hoat-hinh'      ? 'Hoạt Hình & Anime 2026 – Vietsub HD Miễn Phí | KhoPhim'
    : type === 'tv-shows'       ? 'TV Shows 2026 – Vietsub HD Miễn Phí | KhoPhim'
    : type === 'phim-sap-chieu' ? 'Phim Sắp Chiếu 2026 – Trailer & Lịch Chiếu | KhoPhim'
    : `${title} 2026 – Vietsub HD Miễn Phí | KhoPhim`;
  const seoDesc     = countryMeta?.desc ?? typeMeta?.desc ?? `Xem ${title} vietsub HD miễn phí tại KhoPhim 2026. Kho phim lớn nhất Việt Nam, cập nhật hàng ngày, không quảng cáo, không cần đăng ký. Xem ngay!`;
  const seoKeywords = countryMeta?.keywords ?? typeMeta?.keywords ?? `${title} vietsub, xem phim online miễn phí, phim HD`;
  const TYPE_PATH: Record<string, string> = {
    'phim-le': '/phim-le', 'phim-bo': '/phim-bo', 'phim-sap-chieu': '/phim-sap-chieu',
    'tv-shows': '/tv-shows', 'hoat-hinh': '/hoat-hinh', 'phim-chieu-rap': '/phim-chieu-rap',
  };
  const basePath = countryMeta?.path ?? TYPE_PATH[type] ?? pathname;

  const canonicalUrl = page > 1
    ? `${SITE_URL}${basePath}?page=${page}`
    : `${SITE_URL}${basePath}`;

  const prevPage = page > 1
    ? (page > 2 ? `${SITE_URL}${basePath}?page=${page - 1}` : `${SITE_URL}${basePath}`)
    : undefined;
  const nextPage = hasNextPage ? `${SITE_URL}${basePath}?page=${page + 1}` : undefined;

  const listSchema = useMemo(() => {
    const schemas: object[] = [
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL }, { '@type': 'ListItem', position: 2, name: countryMeta?.title ?? title, item: `${SITE_URL}${basePath}` }] },
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${countryMeta?.title ?? title} – KhoPhim`, url: `${SITE_URL}${basePath}`, description: seoDesc, inLanguage: 'vi', isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL } },
    ];
    if (movies.length > 0) {
      schemas.push({ '@context': 'https://schema.org', '@type': 'ItemList', name: `${countryMeta?.title ?? title} – Danh Sách Phim`, url: `${SITE_URL}${basePath}`, numberOfItems: movies.length, itemListElement: movies.slice(0, 10).map((m, i) => ({ '@type': 'ListItem', position: (page - 1) * PAGE_SIZE + i + 1, url: `${SITE_URL}/phim/${m.slug}`, name: m.name, image: m.thumb_url ? `https://img.ophim.live/uploads/movies/${m.thumb_url}` : undefined })) });
    }
    const faqItems = countryFilter ? COUNTRY_FAQ[countryFilter] : TYPE_FAQ[type];
    if (faqItems && faqItems.length > 0) {
      schemas.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
    }
    return schemas;
  }, [countryMeta, title, basePath, seoDesc, movies, page, countryFilter, type]);

  const seoKey = countryFilter ?? type;
  const uiMeta = CATEGORY_META_UI[seoKey] ?? DEFAULT_UI;
  const displayTitle = countryMeta?.title ?? title;
  const { sectionRef: seoRef, visible: seoVisible } = useLazySection('300px');
  const showFeatured = page === 1 && sortBy === 'new' && movies.length >= 5;
  const featuredMovies = showFeatured ? movies.slice(0, 5) : [];
  const gridMovies = showFeatured ? movies.slice(5) : movies;

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title={seoTitle}
        description={seoDesc}
        keywords={seoKeywords}
        canonical={canonicalUrl}
        prev={prevPage}
        next={nextPage}
        schema={listSchema}
      />
      <Navbar />

      <main className="cinema-page-container pt-6 sm:pt-8 lg:pt-10">
        {/* ── Breadcrumb + Title ── */}
        <section className="cinema-hero-panel mb-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
        <div className="relative z-10 flex items-center gap-3 mb-4 flex-wrap">
          <nav className="flex items-center gap-1.5 text-xs text-white/35">
            <a href="/" className="hover:text-white/50 transition-colors">Trang chủ</a>
            <i className="ri-arrow-right-s-line text-white/15 text-sm" />
            <span className="text-white/50">{displayTitle}</span>
          </nav>
        </div>

        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] ${uiMeta.accentColor}`}>
              <i className={`${uiMeta.icon} text-xl`} />
            </div>
            <h1 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
              {displayTitle} 2026{page > 1 ? ` – Trang ${page}` : ''}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">{uiMeta.description}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            {uiMeta.stats.map((stat) => (
              <div key={stat.label} className="cinema-chip rounded-2xl px-3 py-3 text-center">
                <div className="text-sm font-black text-white sm:text-base">{stat.value}</div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase text-white/35 sm:text-[11px]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        </section>

        {/* ── Filter & Sort Bar ── */}
        <div className="cinema-toolbar-panel mb-7 flex flex-col items-stretch justify-between gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
          <div className="flex items-center gap-3">
            {!loading && movies.length > 0 ? (
              <span className="text-sm text-white/35 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                Trang <span className="text-white/60 font-semibold">{page}</span>
                <span className="text-white/15">·</span>
                <span className="text-white/50">{movies.length} phim</span>
              </span>
            ) : (
              <span className="text-sm text-white/20">Đang tải...</span>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/20 p-1 w-full sm:w-auto">
            {(['new', 'hot', 'updated'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortBy(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  sortBy === mode
                    ? 'bg-white/[0.12] text-white shadow-sm'
                    : 'text-white/30 hover:text-white/60'
                }`}
              >
                {mode === 'new' ? 'Mới nhất' : mode === 'hot' ? 'Hot nhất' : 'Mới cập nhật'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Featured Section (page 1 only) ── */}
        {showFeatured && (
          <FeaturedSection movies={featuredMovies} type={type} />
        )}

        {/* ── Movie Grid ── */}
        {loading ? (
          <div className="space-y-6 sm:space-y-8">
            {page === 1 && sortBy === 'new' && (
              <div>
                <div className="flex items-center gap-4 mb-5">
                  <div className="h-6 w-40 skeleton rounded-lg" />
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <div className="h-5 w-14 skeleton rounded-full" />
                </div>
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="lg:w-[58%] aspect-video skeleton rounded-2xl" />
                  <div className="lg:flex-1 flex flex-col gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <div className="w-28 md:w-32 aspect-[16/10] skeleton rounded-lg flex-shrink-0" />
                        <div className="flex-1 flex flex-col justify-center gap-2 py-1">
                          <div className="h-3.5 skeleton rounded w-3/4" />
                          <div className="h-2.5 skeleton rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="grid movie-grid-desktop">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[2/3] skeleton rounded-xl" />
                  <div className="mt-2.5 h-3 skeleton rounded w-4/5" />
                  <div className="mt-1.5 h-2.5 skeleton rounded w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ) : gridMovies.length === 0 ? (
          <div className="cinema-empty-state flex flex-col items-center justify-center py-24 text-center text-white/20 sm:py-32">
            <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
              <i className="ri-film-line text-3xl" />
            </div>
            <p className="text-base font-medium text-white/30">Không có phim nào</p>
            <p className="text-sm text-white/15 mt-1">Thử chọn danh mục khác</p>
          </div>
        ) : (
          <div className="grid movie-grid-desktop">
              {gridMovies.map((m, idx) => (
                <MovieCard key={m._id} movie={m} priority={idx < 2} />
              ))}
            </div>
        )}

        {/* ── Pagination ── */}
        {!loading && (movies.length > 0 || page > 1) && (
          <Pagination currentPage={page} totalPages={totalPages} basePath={basePath} hasNext={hasNextPage} />
        )}

        <div className="mt-10 sm:mt-16 pt-8 sm:pt-12 pb-4" ref={seoRef}>
          {seoVisible && <CategorySEOContent categoryKey={seoKey} />}
        </div>
      </main>
      <Footer />
    </div>
  );
}
