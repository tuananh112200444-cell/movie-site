import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/feature/Navbar';
import Footer from '../../components/feature/Footer';
import SEO from '../../components/base/SEO';
import AdsterraNativeBanner from '../../components/feature/AdsterraNativeBanner';
import AdsterraResponsiveBanner from '../../components/feature/AdsterraResponsiveBanner';
import TrendingSection from '../home/components/TrendingSection';
import { fetchTrendingMovies } from '../../services/movieApi';
import { movieDetailUrl } from '../../utils/slugEncoder';
import type { Movie } from '../../types/movie';

const SITE_URL = 'https://khophim.org';

export default function HotMovies2026Page() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchTrendingMovies()
      .then((response) => {
        if (active) setMovies((response.items ?? []) as Movie[]);
      })
      .catch(() => {
        if (active) setMovies([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const schema = useMemo(() => ([
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Phim thịnh hành và mới cập nhật năm 2026',
      url: `${SITE_URL}/phim-hot-2026`,
      description: 'Danh sách phim thịnh hành được cập nhật tự động từ dữ liệu phim mới, độ phổ biến và trạng thái tập trên KhoPhim.',
      inLanguage: 'vi-VN',
      dateModified: new Date().toISOString(),
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: movies.length,
        itemListElement: movies.slice(0, 20).map((movie, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: movie.name,
          url: `${SITE_URL}${movieDetailUrl(movie.slug)}`,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Phim thịnh hành 2026', item: `${SITE_URL}/phim-hot-2026` },
      ],
    },
  ]), [movies]);

  return (
    <div className="angular-catalog-page min-h-screen kp-cinema-page text-white">
      <SEO
        title="Phim Thịnh Hành 2026, Mới Cập Nhật | KhoPhim"
        description="Khám phá phim thịnh hành 2026 trên KhoPhim. Danh sách tự động cập nhật theo độ phổ biến, thời điểm cập nhật và trạng thái tập mới."
        keywords="phim thịnh hành 2026, phim hot 2026, phim mới cập nhật, phim đang hot, phim Vietsub"
        canonical="/phim-hot-2026"
        schema={schema}
      />
      <Navbar />

      <main className="mx-auto max-w-[1760px] px-4 pb-16 pt-8 lg:px-6">
        <nav className="mb-5 flex items-center gap-2 text-xs text-white/40">
          <Link to="/" className="hover:text-white">Trang chủ</Link>
          <i className="ri-arrow-right-s-line" />
          <span>Phim thịnh hành 2026</span>
        </nav>

        <header className="mb-8 max-w-4xl border-b border-white/[0.08] pb-7">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-red-400">
            Cập nhật tự động
          </p>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">
            Phim thịnh hành và mới cập nhật năm 2026
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
            Danh sách được làm mới từ dữ liệu phim thực tế của KhoPhim, ưu tiên phim vừa cập nhật,
            phim có độ phổ biến cao và phim đã có tập xem. Đây không phải bảng xếp hạng quảng cáo
            hay danh sách viết tay.
          </p>
        </header>

        <AdsterraResponsiveBanner />

        <TrendingSection movies={movies} loading={loading} />

        {!loading && movies.length > 0 && <AdsterraNativeBanner />}

        {!loading && movies.length === 0 && (
          <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 text-center">
            <p className="text-sm text-white/55">Dữ liệu thịnh hành đang được cập nhật.</p>
            <Link to="/phim-moi-cap-nhat" className="mt-3 inline-block text-sm font-semibold text-red-400 hover:text-red-300">
              Xem phim mới cập nhật
            </Link>
          </section>
        )}

        <section className="mt-8 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
          <h2 className="text-lg font-bold">Khám phá thêm</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ['/phim-moi-cap-nhat', 'Phim mới cập nhật'],
              ['/phim-dang-chieu', 'Phim đang chiếu'],
              ['/phim-chieu-rap', 'Phim chiếu rạp'],
              ['/phim-vietsub', 'Phim Vietsub'],
              ['/anime', 'Anime'],
            ].map(([href, label]) => (
              <Link key={href} to={href} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/65 hover:border-red-500/40 hover:text-red-300">
                {label}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
