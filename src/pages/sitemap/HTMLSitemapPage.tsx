import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import SEO from '../../components/base/SEO';
import { fetchMoviesByType } from '../../services/movieApi';
import type { MovieItem } from '../../types/movie';

const SITE_URL = 'https://khophim.org';

const CATEGORIES = [
  { name: 'Phim Lẻ', slug: 'phim-le', desc: 'Phim điện ảnh, phim lẻ vietsub HD mới nhất' },
  { name: 'Phim Bộ', slug: 'phim-bo', desc: 'Phim bộ dài tập, series vietsub cập nhật liên tục' },
  { name: 'Phim Chiếu Rạp', slug: 'phim-chieu-rap', desc: 'Phim chiếu rạp, blockbuster vietsub HD' },
  { name: 'Hoạt Hình', slug: 'hoat-hinh', desc: 'Hoạt hình, anime vietsub mới nhất' },
  { name: 'TV Shows', slug: 'tv-shows', desc: 'TV Shows, series truyền hình vietsub' },
  { name: 'Phim Sắp Chiếu', slug: 'phim-sap-chieu', desc: 'Phim sắp ra mắt, trailer mới nhất' },
];

const COUNTRIES = [
  { name: 'Phim Hàn Quốc', slug: 'phim-han-quoc', desc: 'Kho phim Hàn Quốc vietsub lớn nhất' },
  { name: 'Phim Trung Quốc', slug: 'phim-trung-quoc', desc: 'Phim Trung Quốc cổ trang, tiên hiệp vietsub' },
  { name: 'Phim Âu Mỹ', slug: 'phim-au-my', desc: 'Phim Hollywood, phim Âu Mỹ vietsub HD' },
  { name: 'Phim Nhật Bản', slug: 'phim-nhat-ban', desc: 'Anime, phim Nhật Bản vietsub' },
  { name: 'Phim Thái Lan', slug: 'phim-thai-lan', desc: 'Phim Thái Lan, lakorn vietsub' },
  { name: 'Phim Việt Nam', slug: 'phim-viet-nam', desc: 'Phim Việt Nam chiếu rạp và phim bộ' },
];

const GENRES = [
  'hanh-dong', 'tinh-cam', 'kinh-di', 'hai-huoc', 'vien-tuong',
  'tam-ly', 'phieu-luu', 'co-trang', 'hinh-su', 'chien-tranh',
  'gia-dinh', 'bi-an', 'the-thao', 'am-nhac', 'kinh-dien',
];

const GENRE_NAMES: Record<string, string> = {
  'hanh-dong': 'Phim Hành Động',
  'tinh-cam': 'Phim Tình Cảm',
  'kinh-di': 'Phim Kinh Dị',
  'hai-huoc': 'Phim Hài Hước',
  'vien-tuong': 'Phim Viễn Tưởng',
  'tam-ly': 'Phim Tâm Lý',
  'phieu-luu': 'Phim Phiêu Lưu',
  'co-trang': 'Phim Cổ Trang',
  'hinh-su': 'Phim Hình Sự',
  'chien-tranh': 'Phim Chiến Tranh',
  'gia-dinh': 'Phim Gia Đình',
  'bi-an': 'Phim Bí Ẩn',
  'the-thao': 'Phim Thể Thao',
  'am-nhac': 'Phim Âm Nhạc',
  'kinh-dien': 'Phim Kinh Điển',
};

const SEO_PAGES = [
  { name: 'Xem phim online', path: '/xem-phim-online' },
  { name: 'Phim Vietsub', path: '/phim-vietsub' },
  { name: 'Phim thuyết minh', path: '/phim-thuyet-minh' },
  { name: 'Phim lồng tiếng', path: '/phim-long-tieng' },
  { name: 'Phim Full HD', path: '/phim-full-hd' },
  { name: 'Phim hay', path: '/phim-hay' },
  { name: 'Phim 2026', path: '/phim-2026' },
  { name: 'Phim 2025', path: '/phim-2025' },
  { name: 'Phim 2024', path: '/phim-2024' },
  { name: 'Phim 4K', path: '/phim-4k' },
  { name: 'Phim hoàn tất', path: '/phim-hoan-tat' },
  { name: 'Phim đang chiếu', path: '/phim-dang-chieu' },
  { name: 'Trailer phim', path: '/phim-trailer' },
];

const schema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Sitemap KhoPhim - Danh Sách Tất Cả Trang',
  description: 'Sitemap HTML đầy đủ của KhoPhim (khophim.org) - Tất cả danh mục, thể loại, quốc gia và phim.',
  url: `${SITE_URL}/sitemap`,
  numberOfItems: 0,
  itemListElement: [] as { '@type': string; position: number; name: string; url: string }[],
};

export default function HTMLSitemapPage() {
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetchMoviesByType('phim-le', 1),
      fetchMoviesByType('phim-bo', 1),
    ]).then((results) => {
      const allMovies: MovieItem[] = [];
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.items) {
          allMovies.push(...r.value.items.slice(0, 20));
        }
      });
      setMovies(allMovies);
      setLoading(false);
    });
  }, []);

  // Build schema
  let position = 1;
  const addItem = (name: string, url: string) => {
    schema.itemListElement.push({
      '@type': 'ListItem',
      position: position++,
      name,
      url: `${SITE_URL}${url}`,
    });
  };

  CATEGORIES.forEach((c) => addItem(c.name, `/${c.slug}`));
  COUNTRIES.forEach((c) => addItem(c.name, `/${c.slug}`));
  GENRES.forEach((g) => addItem(GENRE_NAMES[g] || g, `/the-loai/${g}`));
  SEO_PAGES.forEach((p) => addItem(p.name, p.path));
  // Phim chi tiết /phim/ không thêm vào schema — trang này noindex
  schema.numberOfItems = schema.itemListElement.length;

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title="Sitemap - Tất Cả Trang | KhoPhim"
        description="Sitemap đầy đủ của KhoPhim (khophim.org). Tất cả danh mục phim, thể loại, quốc gia, và phim mới nhất."
        canonical="/sitemap"
        schema={schema}
      />
      <Navbar />

      <main className="pt-24 pb-16 max-w-[1760px] mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Sitemap <span className="text-red-500">KhoPhim</span>
          </h1>
          <p className="text-white/50 text-sm max-w-xl mx-auto">
            Danh sách đầy đủ tất cả trang trên KhoPhim. Giúp bạn và Google dễ dàng khám phá mọi nội dung.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Categories */}
          <section className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <i className="ri-film-line text-red-500" />
              Danh Mục Phim
            </h3>
            <ul className="space-y-2">
              {CATEGORIES.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    to={`/${cat.slug}`}
                    className="group flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.05] transition-colors"
                  >
                    <div>
                      <span className="text-white/80 text-sm group-hover:text-red-400 transition-colors">{cat.name}</span>
                      <p className="text-white/30 text-xs mt-0.5">{cat.desc}</p>
                    </div>
                    <i className="ri-arrow-right-line text-white/20 group-hover:text-red-400 transition-colors" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Countries */}
          <section className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <i className="ri-global-line text-red-500" />
              Phim Theo Quốc Gia
            </h3>
            <ul className="space-y-2">
              {COUNTRIES.map((c) => (
                <li key={c.slug}>
                  <Link
                    to={`/${c.slug}`}
                    className="group flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.05] transition-colors"
                  >
                    <div>
                      <span className="text-white/80 text-sm group-hover:text-red-400 transition-colors">{c.name}</span>
                      <p className="text-white/30 text-xs mt-0.5">{c.desc}</p>
                    </div>
                    <i className="ri-arrow-right-line text-white/20 group-hover:text-red-400 transition-colors" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Genres */}
          <section className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <i className="ri-price-tag-3-line text-red-500" />
              Thể Loại Phim
            </h3>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <Link
                  key={g}
                  to={`/the-loai/${g}`}
                  className="text-sm text-white/70 bg-white/[0.05] hover:bg-red-500/20 hover:text-red-400 border border-white/[0.08] hover:border-red-500/30 px-3 py-1.5 rounded-lg transition-all"
                >
                  {GENRE_NAMES[g] || g}
                </Link>
              ))}
            </div>
          </section>

          {/* SEO Landing Pages */}
          <section className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <i className="ri-pages-line text-red-500" />
              Trang SEO
            </h3>
            <ul className="space-y-2">
              {SEO_PAGES.map((p) => (
                <li key={p.path}>
                  <Link
                    to={p.path}
                    className="group flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="text-white/80 text-sm group-hover:text-red-400 transition-colors">{p.name}</span>
                    <i className="ri-arrow-right-line text-white/20 group-hover:text-red-400 transition-colors" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Recent Movies — disabled: trang chi tiết phim /phim/ được đặt noindex */}
          {/*
          <section className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 md:col-span-2 lg:col-span-2">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <i className="ri-movie-2-line text-red-500" />
              Phim Mới Cập Nhật
            </h3>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 skeleton rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {movies.map((m) => (
                  <Link
                    key={m._id}
                    to={`/phim/${encodeURIComponent(m.slug)}`}
                    className="text-sm text-white/60 hover:text-red-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] px-3 py-2 rounded-lg transition-all truncate"
                    title={m.name}
                  >
                    {m.name}
                  </Link>
                ))}
              </div>
            )}
          </section>
          */}
        </div>

        {/* Bottom SEO text */}
        <div className="mt-10 bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
          <h3 className="text-base font-bold mb-3">Về Sitemap KhoPhim</h3>
          <p className="text-white/40 text-sm leading-relaxed">
            Sitemap này liệt kê tất cả các trang quan trọng trên KhoPhim (khophim.org) để Google 
            và các công cụ tìm kiếm khác dễ dàng khám phá và lập chỉ mục. Bao gồm các danh mục 
            phim lẻ, phim bộ, phim chiếu rạp, phim theo quốc gia (Hàn Quốc, Trung Quốc, Âu Mỹ, 
            Nhật Bản, Thái Lan, Việt Nam), thể loại phim đa dạng, và các trang phim mới cập nhật 
            hàng ngày. Truy cập <Link to="/" className="text-red-400 hover:underline">trang chủ KhoPhim</Link> để xem phim online miễn phí vietsub HD.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
