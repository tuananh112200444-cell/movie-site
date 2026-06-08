import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import SEO, { SITE_URL } from '@/components/base/SEO';
import { ACTORS } from '@/mocks/actors';

const NATIONALITIES = ['Tất Cả', 'Hàn Quốc', 'Trung Quốc', 'Nhật Bản', 'Âu Mỹ', 'Việt Nam'];

const GENRE_FILTERS = ['Tất Cả', 'Tình Cảm', 'Hành Động', 'Huyền Bí', 'Tâm Lý', 'Hài Hước', 'Lịch Sử'];

export default function ActorListPage() {
  const [filterNation, setFilterNation] = useState('Tất Cả');
  const [filterGenre, setFilterGenre] = useState('Tất Cả');
  const [searchQ, setSearchQ] = useState('');

  const filtered = useMemo(() => {
    return ACTORS.filter((a) => {
      const matchNation = filterNation === 'Tất Cả' || a.nationality === filterNation;
      const matchGenre = filterGenre === 'Tất Cả' || a.genres.includes(filterGenre);
      const matchSearch = !searchQ.trim() || a.name.toLowerCase().includes(searchQ.toLowerCase()) || a.nameEn.toLowerCase().includes(searchQ.toLowerCase());
      return matchNation && matchGenre && matchSearch;
    });
  }, [filterNation, filterGenre, searchQ]);

  const schema = useMemo(() => [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Diễn Viên Nổi Tiếng', item: `${SITE_URL}/dien-vien` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Diễn Viên Nổi Tiếng – KhoPhim',
      url: `${SITE_URL}/dien-vien`,
      description: 'Danh sách diễn viên nổi tiếng Hàn Quốc, Trung Quốc, Âu Mỹ. Xem phim của các diễn viên yêu thích vietsub HD miễn phí tại KhoPhim.',
      inLanguage: 'vi',
      isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
    },
  ], []);

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <SEO
        title="Diễn Viên Nổi Tiếng – Xem Phim Vietsub | KhoPhim"
        description="Danh sách diễn viên nổi tiếng Hàn Quốc, Trung Quốc, Âu Mỹ tại KhoPhim. Xem phim Lee Min Ho, Song Hye Kyo, Hyun Bin, IU vietsub HD miễn phí. Cập nhật 2026."
        keywords="diễn viên nổi tiếng, diễn viên hàn quốc, lee min ho, song hye kyo, hyun bin, iu, kim soo hyun, park seo jun, gong yoo, phim diễn viên vietsub"
        canonical="/dien-vien"
        schema={schema}
      />
      <Navbar />

      {/* ── Hero Banner ── */}
      <div className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/15 via-[#080a10]/70 to-[#080a10]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,rgba(220,38,38,0.07),transparent_60%)]" />

        {/* Decorative actor silhouettes */}
        <div className="absolute top-0 right-0 w-96 h-full overflow-hidden opacity-[0.04] pointer-events-none">
          <div className="absolute top-4 right-8 w-32 h-40 bg-white rounded-2xl" />
          <div className="absolute top-4 right-44 w-24 h-32 bg-white rounded-2xl" />
          <div className="absolute top-4 right-80 w-20 h-28 bg-white rounded-2xl" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-4 pt-10 pb-8">
          <nav className="flex items-center gap-1.5 mb-5 text-xs">
            <Link to="/" className="text-white/30 hover:text-white/60 transition-colors">Trang chủ</Link>
            <i className="ri-arrow-right-s-line text-white/20" />
            <span className="text-white/55">Diễn Viên</span>
          </nav>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 flex items-center justify-center bg-red-500/15 border border-red-500/25 rounded-xl">
                  <i className="ri-user-star-line text-red-400 text-lg" />
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white">Diễn Viên Nổi Tiếng</h1>
              </div>
              <p className="text-white/40 text-sm max-w-xl">
                Khám phá phim của các diễn viên nổi tiếng Hàn Quốc, Trung Quốc, Âu Mỹ — vietsub HD miễn phí tại KhoPhim
              </p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 flex-shrink-0">
              <div className="text-center">
                <div className="text-2xl font-black text-red-400">{ACTORS.length}+</div>
                <div className="text-[11px] text-white/30 uppercase tracking-wider">Diễn viên</div>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center">
                <div className="text-2xl font-black text-red-400">50K+</div>
                <div className="text-[11px] text-white/30 uppercase tracking-wider">Bộ phim</div>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center">
                <div className="text-2xl font-black text-red-400">HD</div>
                <div className="text-[11px] text-white/30 uppercase tracking-wider">Chất lượng</div>
              </div>
            </div>
          </div>

          <div className="mt-6 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 pb-16">

        {/* ── Filter Bar ── */}
        <div className="mb-6 space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <i className="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 text-sm" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Tìm diễn viên..."
              className="w-full bg-[#1a1d27] border border-white/[0.08] text-white placeholder-white/25 text-sm rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-red-500/40 transition-all"
            />
          </div>

          {/* Nationality filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-white/25 uppercase tracking-wider w-16 flex-shrink-0">Quốc gia</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {NATIONALITIES.map((n) => (
                <button
                  key={n}
                  onClick={() => setFilterNation(n)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap font-medium ${
                    filterNation === n
                      ? 'bg-red-500 text-white'
                      : 'bg-white/[0.05] text-white/45 hover:text-white hover:bg-white/[0.09] border border-white/[0.06]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Genre filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-white/25 uppercase tracking-wider w-16 flex-shrink-0">Thể loại</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {GENRE_FILTERS.map((g) => (
                <button
                  key={g}
                  onClick={() => setFilterGenre(g)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    filterGenre === g
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/[0.05] text-white/45 hover:text-white hover:bg-white/[0.09] border border-white/[0.06]'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Result count */}
          <div className="flex items-center gap-2 pt-1">
            <div className="w-1 h-4 bg-red-500 rounded-full" />
            <span className="text-sm text-white/40">
              Tìm thấy <span className="text-white font-semibold">{filtered.length}</span> diễn viên
            </span>
          </div>
        </div>

        {/* ── Actor Grid ── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/25">
            <i className="ri-user-search-line text-5xl mb-3" />
            <p className="text-base">Không tìm thấy diễn viên nào</p>
            <button
              onClick={() => { setFilterNation('Tất Cả'); setFilterGenre('Tất Cả'); setSearchQ(''); }}
              className="mt-4 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 md:gap-5">
            {filtered.map((actor, idx) => (
              <ActorCard key={actor.slug} actor={actor} rank={idx + 1} />
            ))}
          </div>
        )}

        {/* ── SEO Section ── */}
        <section className="mt-14 bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-5 bg-red-500 rounded-full flex-shrink-0" />
            <h2 className="text-base font-bold text-white">Xem Phim Diễn Viên Nổi Tiếng Vietsub HD Tại KhoPhim</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-sm text-white/50 leading-relaxed space-y-3">
              <p>
                <strong className="text-white/75">KhoPhim</strong> tổng hợp phim của các{' '}
                <strong className="text-white/75">diễn viên nổi tiếng</strong> Hàn Quốc, Trung Quốc, Âu Mỹ
                với vietsub HD miễn phí. Từ{' '}
                <strong className="text-white/75">Lee Min Ho, Song Hye Kyo, Hyun Bin</strong> đến{' '}
                <strong className="text-white/75">IU, Kim Soo Hyun, Park Seo Jun</strong> — tất cả đều có đầy đủ.
              </p>
              <p>
                Mỗi trang diễn viên tại KhoPhim cung cấp thông tin tiểu sử đầy đủ, danh sách phim cập nhật
                mới nhất, và các bộ phim nổi tiếng nhất. Tất cả đều có thể xem trực tuyến miễn phí với
                chất lượng HD, không quảng cáo, không cần đăng ký.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: 'ri-user-star-line', label: `${ACTORS.length}+ Diễn viên`, sub: 'Hàn, Trung, Âu Mỹ' },
                { icon: 'ri-film-line', label: '50K+ Bộ phim', sub: 'Cập nhật hàng ngày' },
                { icon: 'ri-hd-line', label: 'Full HD', sub: 'Chất lượng cao' },
                { icon: 'ri-shield-check-line', label: 'Miễn phí', sub: 'Không quảng cáo' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-red-500/10 rounded-lg flex-shrink-0">
                    <i className={`${item.icon} text-red-400 text-sm`} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white/70">{item.label}</div>
                    <div className="text-[10px] text-white/30">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

/* ── Actor Card ── */
function ActorCard({ actor, rank }: { actor: typeof ACTORS[0]; rank: number }) {
  return (
    <Link
      to={`/dien-vien/${actor.slug}`}
      className="group bg-[#0d0f1a] border border-white/[0.07] rounded-2xl overflow-hidden hover:border-red-500/25 transition-all duration-300 cursor-pointer"
    >
      {/* Cover */}
      <div className="relative h-28 overflow-hidden">
        <img
          src={actor.coverImage}
          alt={`${actor.name} - KhoPhim`}
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f1a] via-[#0d0f1a]/50 to-transparent" />

        {/* Rank badge */}
        {rank <= 3 && (
          <div className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black border ${
            rank === 1 ? 'bg-amber-500/90 text-white border-amber-400' :
            rank === 2 ? 'bg-slate-400/80 text-white border-slate-300' :
            'bg-orange-700/80 text-white border-orange-600'
          }`}>
            {rank}
          </div>
        )}
      </div>

      {/* Avatar + info */}
      <div className="px-4 pb-4 -mt-10 relative">
        <div className="relative w-16 h-20 rounded-xl overflow-hidden border-2 border-[#0d0f1a] mb-3">
          <img
            src={actor.image}
            alt={actor.name}
            className="w-full h-full object-cover object-top"
            loading="lazy"
          />
        </div>

        <h3 className="text-sm font-bold text-white group-hover:text-red-300 transition-colors leading-tight mb-0.5">
          {actor.name}
        </h3>
        <p className="text-[11px] text-white/35 italic mb-2">{actor.nameEn}</p>

        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <span className="text-[10px] text-white/35 bg-white/[0.05] px-2 py-0.5 rounded-full">
            {actor.nationality}
          </span>
          {actor.agency && (
            <span className="text-[10px] text-white/25 hidden sm:inline">{actor.agency}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {actor.genres.slice(0, 2).map((g) => (
            <span key={g} className="text-[9px] text-red-400/60 bg-red-500/[0.08] border border-red-500/15 px-1.5 py-0.5 rounded-full">
              {g}
            </span>
          ))}
        </div>

        {/* Known for */}
        <div className="text-[10px] text-white/30 line-clamp-1">
          <i className="ri-film-line text-[9px] mr-1" />
          {actor.knownFor[0]}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-white/25">{actor.knownFor.length} phim nổi bật</span>
          <span className="flex items-center gap-1 text-[11px] text-red-400/60 group-hover:text-red-400 transition-colors">
            Xem phim <i className="ri-arrow-right-s-line text-xs" />
          </span>
        </div>
      </div>
    </Link>
  );
}
