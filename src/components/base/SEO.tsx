import { memo } from 'react';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://khophim.org';
const SITE_NAME = 'KhoPhim';
const SITE_NAME_SHORT = 'KhoPhim';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'video.movie' | 'video.tv_show' | 'article';
  noIndex?: boolean;
  schema?: object | object[];
  /** Dành cho trang phim: năm phát hành */
  publishedYear?: number;
  /** Dành cho trang phim: thể loại */
  genre?: string;
  /** Ngày cập nhật nội dung (ISO string) */
  updatedAt?: string;
  /** Pagination: URL trang trước */
  prev?: string;
  /** Pagination: URL trang sau */
  next?: string;
}

const SEO = memo(function SEO({
  title,
  description,
  keywords,
  canonical,
  ogImage,
  ogType = 'website',
  noIndex = false,
  schema,
  publishedYear,
  genre,
  updatedAt,
  prev,
  next,
}: SEOProps) {
  // Build full title — NEVER exceed 55 chars (safe for ~561px)
  const rawFullTitle = title.includes('KhoPhim')
    ? title
    : `${title} | ${SITE_NAME_SHORT}`;

  const fullTitle = (() => {
    if (rawFullTitle.length <= 68) return rawFullTitle;
    const cut = rawFullTitle.slice(0, 65);
    const last = cut.lastIndexOf(' ');
    return (last > 42 ? cut.slice(0, last) : cut) + '...';
  })();

  // Truncate description — max 150 chars (~985px safe)
  const truncatedDescription = (() => {
    if (description.length <= 150) return description;
    const cut = description.slice(0, 147);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + '...';
  })();

  // Build canonical URL — ALWAYS use the canonical prop when provided.
  // Render canonical EVEN for noindex pages to avoid "Canonicalised" warnings
  const canonicalUrl = (() => {
    if (!canonical) return undefined;
    if (canonical.startsWith('http')) {
      // Normalize: remove www, ensure https, strip trailing slash
      return canonical
        .replace(/^http:\/\//, 'https://')
        .replace(/^https:\/\/www\./, 'https://')
        .replace(/\/+$/, '') || canonical;
    }
    const cleanPath = canonical.replace(/\/+$/, '') || '/';
    return `${SITE_URL}${cleanPath}`;
  })();

  const finalOgImage = ogImage ?? `${SITE_URL}/og-image.jpg`;
  const schemas = schema ? (Array.isArray(schema) ? schema : [schema]) : [];
  const siteSchemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME_SHORT,
      alternateName: ['Kho Phim', 'khophim.org'],
      url: SITE_URL,
      inLanguage: 'vi-VN',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME_SHORT,
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      sameAs: ['https://www.tiktok.com/@khophim.org'],
    },
  ];
  const today = new Date().toISOString().split('T')[0];
  const updatedDate = (updatedAt ?? today).split('T')[0];
  const robotsContent = noIndex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={truncatedDescription} />
      {keywords && <meta name="keywords" content={keywords} />}
      {/* Always output canonical when explicitly provided — avoids "Canonicalised" warnings */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Pagination links */}
      {prev && <link rel="prev" href={prev} />}
      {next && <link rel="next" href={next} />}

      {/* hreflang — only for pages with explicit canonical */}
      {canonicalUrl && (
        <>
          <link rel="alternate" hrefLang="vi" href={canonicalUrl} />
          <link rel="alternate" hrefLang="vi-VN" href={canonicalUrl} />
          <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
        </>
      )}

      <meta name="robots" content={robotsContent} />
      <meta name="googlebot" content={robotsContent} />
      <meta name="last-modified" content={updatedDate} />
      <meta name="author" content={SITE_NAME_SHORT} />
      <meta name="copyright" content={`© ${new Date().getFullYear()} ${SITE_NAME_SHORT} (khophim.org)`} />
      <meta name="language" content="vi" />
      <meta name="content-language" content="vi-VN" />
      <meta name="rating" content="general" />

      {/* Geo tags — Việt Nam */}
      <meta name="geo.region" content="VN" />
      <meta name="geo.placename" content="Việt Nam" />

      {/* Article tags — E-E-A-T signals */}
      {publishedYear && (
        <meta property="article:published_time" content={`${publishedYear}-01-01T00:00:00+07:00`} />
      )}
      <meta property="article:modified_time" content={`${updatedDate}T00:00:00+07:00`} />
      {genre && <meta property="article:section" content={genre} />}
      {genre && (
        <meta property="article:tag" content={genre} />
      )}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={truncatedDescription} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={finalOgImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={fullTitle} />
      <meta property="og:site_name" content={SITE_NAME_SHORT} />
      <meta property="og:locale" content="vi_VN" />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      {/* Twitter / X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@KhoPhimVN" />
      <meta name="twitter:creator" content="@KhoPhimVN" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={truncatedDescription} />
      <meta name="twitter:image" content={finalOgImage} />
      {canonicalUrl && <meta name="twitter:url" content={canonicalUrl} />}

      {/* Schema.org JSON-LD */}
      {[...siteSchemas, ...schemas].map((s, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(s) }}
        />
      ))}
    </>
  );
});

export default SEO;
export { SITE_URL, SITE_NAME, SITE_NAME_SHORT };
