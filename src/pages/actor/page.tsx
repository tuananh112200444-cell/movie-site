import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import SEO, { SITE_URL } from '@/components/base/SEO';
import { getActorBySlug } from '@/mocks/actors';
import ActorHero from './components/ActorHero';
import ActorBio from './components/ActorBio';
import ActorMovies from './components/ActorMovies';
import ActorFAQ from './components/ActorFAQ';
import ActorSEOContent from './components/ActorSEOContent';
import { buildFAQ } from './components/ActorFAQ';

export default function ActorPage() {
  const { slug } = useParams<{ slug: string }>();
  const actor = slug ? getActorBySlug(slug) : undefined;

  const schema = useMemo(() => {
    if (!actor) return [];
    const faqs = buildFAQ(actor);

    return [
      // Person schema
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: actor.name,
        alternateName: actor.nameEn,
        birthDate: actor.born,
        birthPlace: {
          '@type': 'Place',
          name: actor.birthplace,
        },
        nationality: {
          '@type': 'Country',
          name: actor.nationality,
        },
        description: actor.bio,
        image: actor.image,
        url: `${SITE_URL}/dien-vien/${actor.slug}`,
        sameAs: actor.socialLinks.map((s) => s.url),
        jobTitle: 'Diễn viên',
        knowsAbout: actor.genres,
        award: actor.awards,
        ...(actor.height ? { height: { '@type': 'QuantitativeValue', value: actor.height } } : {}),
        ...(actor.agency ? { memberOf: { '@type': 'Organization', name: actor.agency } } : {}),
        worksFor: { '@type': 'Organization', name: actor.agency ?? 'KhoPhim' },
      },
      // BreadcrumbList schema
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Diễn Viên', item: `${SITE_URL}/dien-vien` },
          { '@type': 'ListItem', position: 3, name: actor.name, item: `${SITE_URL}/dien-vien/${actor.slug}` },
        ],
      },
      // CollectionPage schema
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `Phim ${actor.name} Vietsub HD – KhoPhim`,
        url: `${SITE_URL}/dien-vien/${actor.slug}`,
        description: `Xem toàn bộ phim của ${actor.name} vietsub HD miễn phí tại KhoPhim. ${actor.knownFor.join(', ')} và nhiều phim hay khác.`,
        inLanguage: 'vi',
        about: {
          '@type': 'Person',
          name: actor.name,
        },
        isPartOf: { '@type': 'WebSite', name: 'KhoPhim', url: SITE_URL },
      },
      // FAQPage schema
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ];
  }, [actor]);

  // 404 nếu không tìm thấy diễn viên
  if (!actor) {
    return (
      <div className="min-h-screen bg-[#080a10] text-white">
        <SEO
          title="Diễn Viên Không Tìm Thấy – KhoPhim"
          description="Trang diễn viên không tồn tại. Khám phá danh sách diễn viên nổi tiếng tại KhoPhim."
          noIndex
        />
        <Navbar />
        <main className="max-w-[1400px] mx-auto px-4 pt-32 pb-20 flex flex-col items-center justify-center min-h-[60vh]">
          <i className="ri-user-unfollow-line text-6xl text-white/20 mb-4" />
          <h1 className="text-2xl font-bold text-white/60 mb-2">Không tìm thấy diễn viên</h1>
          <p className="text-white/35 text-sm mb-6">Diễn viên này chưa có trong cơ sở dữ liệu của KhoPhim.</p>
          <Link
            to="/dien-vien"
            className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            Xem Danh Sách Diễn Viên
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const seoTitle = `${actor.name} – Phim Vietsub HD | KhoPhim`;
  const seoDesc = `Xem toàn bộ phim của ${actor.name} vietsub HD miễn phí tại KhoPhim. ${actor.knownFor.slice(0, 3).join(', ')} và nhiều phim hay khác. Cập nhật mới nhất ${new Date().getFullYear()}.`;
  const seoKeywords = actor.searchKeywords.join(', ');

  return (
    <div className="min-h-screen bg-[#080a10] text-white">
      <SEO
        title={seoTitle}
        description={seoDesc}
        keywords={seoKeywords}
        canonical={`/dien-vien/${actor.slug}`}
        ogImage={actor.image}
        ogType="article"
        schema={schema}
      />
      <Navbar />

      <main>
        {/* Hero section */}
        <div className="pt-14 lg:pt-16">
          <ActorHero actor={actor} />
        </div>

        {/* Main content */}
        <div className="max-w-[1400px] mx-auto px-4 py-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-white/35 mb-8" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-white transition-colors cursor-pointer">Trang Chủ</Link>
            <i className="ri-arrow-right-s-line" />
            <Link to="/dien-vien" className="hover:text-white transition-colors cursor-pointer">Diễn Viên</Link>
            <i className="ri-arrow-right-s-line" />
            <span className="text-white/60">{actor.name}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
            {/* Sidebar */}
            <aside className="space-y-4">
              <ActorBio actor={actor} />

              {/* Quick stats */}
              <div className="bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-5">
                <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-red-500 rounded-full flex-shrink-0" />
                  Thông Tin Nhanh
                </h2>
                <dl className="space-y-3">
                  {[
                    { label: 'Tên đầy đủ', value: actor.nameEn },
                    { label: 'Ngày sinh', value: actor.born },
                    { label: 'Nơi sinh', value: actor.birthplace },
                    { label: 'Quốc tịch', value: actor.nationality },
                    ...(actor.height ? [{ label: 'Chiều cao', value: actor.height }] : []),
                    ...(actor.agency ? [{ label: 'Công ty', value: actor.agency }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-xs text-white/35 flex-shrink-0">{label}</dt>
                      <dd className="text-xs text-white/65 text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Search keywords hint */}
              <div className="bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-5">
                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-red-500 rounded-full flex-shrink-0" />
                  Từ Khóa Tìm Kiếm
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {actor.searchKeywords.map((kw) => (
                    <span key={kw} className="text-[10px] text-white/45 bg-white/[0.05] border border-white/[0.07] px-2 py-1 rounded-lg">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </aside>

            {/* Main */}
            <div className="min-w-0">
              <ActorMovies actorName={actor.name} apiKeyword={actor.apiSearchKeyword} knownFor={actor.knownFor} />
              <ActorFAQ actor={actor} />
              <ActorSEOContent actor={actor} />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
