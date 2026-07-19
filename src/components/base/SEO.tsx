import { memo, useEffect, useMemo } from 'react';

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
  /** For movie pages: release year. */
  publishedYear?: number;
  /** For movie pages: genre. */
  genre?: string;
  /** Content update date, ISO string. */
  updatedAt?: string;
  /** Pagination: previous page URL. */
  prev?: string;
  /** Pagination: next page URL. */
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
  const rawFullTitle = title.includes('KhoPhim')
    ? title
    : `${title} | ${SITE_NAME_SHORT}`;

  const fullTitle = (() => {
    if (rawFullTitle.length <= 68) return rawFullTitle;
    const cut = rawFullTitle.slice(0, 65);
    const last = cut.lastIndexOf(' ');
    return (last > 42 ? cut.slice(0, last) : cut) + '...';
  })();

  const truncatedDescription = (() => {
    if (description.length <= 150) return description;
    const cut = description.slice(0, 147);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + '...';
  })();

  const canonicalUrl = (() => {
    if (!canonical) return undefined;
    if (canonical.startsWith('http')) {
      return canonical
        .replace(/^http:\/\//, 'https://')
        .replace(/^https:\/\/www\./, 'https://')
        .replace(/\/+$/, '') || canonical;
    }
    const cleanPath = canonical.replace(/\/+$/, '') || '/';
    return `${SITE_URL}${cleanPath}`;
  })();

  const finalOgImage = ogImage ?? `${SITE_URL}/og-image.jpg`;
  const schemas = useMemo(() => (schema ? (Array.isArray(schema) ? schema : [schema]) : []), [schema]);
  const siteSchemas = useMemo(() => [
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
      logo: `${SITE_URL}/brand/khophim-logo-v2.png`,
      sameAs: ['https://www.tiktok.com/@khophim.org'],
    },
  ], []);

  const today = new Date().toISOString().split('T')[0];
  const updatedDate = (updatedAt ?? today).split('T')[0];
  const robotsContent = noIndex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const ensureMeta = (attr: 'name' | 'property', key: string, content?: string) => {
      const selector = `meta[${attr}="${key}"]`;
      let tag = document.head.querySelector<HTMLMetaElement>(selector);
      if (!content) {
        tag?.remove();
        return;
      }
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    const ensureLink = (rel: string, href?: string) => {
      let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]:not([data-kp-seo-managed])`);
      if (!href) {
        tag?.remove();
        return;
      }
      if (!tag) {
        tag = document.createElement('link');
        tag.setAttribute('rel', rel);
        document.head.appendChild(tag);
      }
      tag.setAttribute('href', href);
    };

    document.title = fullTitle;
    document.head.querySelectorAll('[data-kp-seo-managed="true"]').forEach((node) => node.remove());

    ensureMeta('name', 'description', truncatedDescription);
    // Google does not use the keywords meta tag. Keeping it would encourage
    // duplicated keyword lists instead of useful, visible page content.
    ensureMeta('name', 'keywords', undefined);
    ensureMeta('name', 'robots', robotsContent);
    ensureMeta('name', 'googlebot', robotsContent);
    ensureMeta('name', 'last-modified', updatedDate);
    ensureMeta('name', 'author', SITE_NAME_SHORT);
    ensureMeta('name', 'copyright', `© ${new Date().getFullYear()} ${SITE_NAME_SHORT} (khophim.org)`);
    ensureMeta('name', 'language', 'vi');
    ensureMeta('name', 'content-language', 'vi-VN');
    ensureMeta('name', 'rating', 'general');
    ensureMeta('name', 'geo.region', 'VN');
    ensureMeta('name', 'geo.placename', 'Việt Nam');

    ensureLink('canonical', canonicalUrl);
    ensureLink('prev', prev);
    ensureLink('next', next);

    if (canonicalUrl) {
      for (const hrefLang of ['vi', 'vi-VN', 'x-default']) {
        const link = document.createElement('link');
        link.setAttribute('rel', 'alternate');
        link.setAttribute('hrefLang', hrefLang);
        link.setAttribute('href', canonicalUrl);
        link.dataset.kpSeoManaged = 'true';
        document.head.appendChild(link);
      }
    }

    ensureMeta('property', 'article:published_time', publishedYear ? `${publishedYear}-01-01T00:00:00+07:00` : undefined);
    ensureMeta('property', 'article:modified_time', `${updatedDate}T00:00:00+07:00`);
    ensureMeta('property', 'article:section', genre);
    ensureMeta('property', 'article:tag', genre);

    ensureMeta('property', 'og:title', fullTitle);
    ensureMeta('property', 'og:description', truncatedDescription);
    ensureMeta('property', 'og:type', ogType);
    ensureMeta('property', 'og:image', finalOgImage);
    ensureMeta('property', 'og:image:width', '1200');
    ensureMeta('property', 'og:image:height', '630');
    ensureMeta('property', 'og:image:alt', fullTitle);
    ensureMeta('property', 'og:site_name', SITE_NAME_SHORT);
    ensureMeta('property', 'og:locale', 'vi_VN');
    ensureMeta('property', 'og:url', canonicalUrl);

    ensureMeta('name', 'twitter:card', 'summary_large_image');
    ensureMeta('name', 'twitter:site', '@KhoPhimVN');
    ensureMeta('name', 'twitter:creator', '@KhoPhimVN');
    ensureMeta('name', 'twitter:title', fullTitle);
    ensureMeta('name', 'twitter:description', truncatedDescription);
    ensureMeta('name', 'twitter:image', finalOgImage);
    ensureMeta('name', 'twitter:url', canonicalUrl);

    for (const item of [...siteSchemas, ...schemas]) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify(item);
      script.dataset.kpSeoManaged = 'true';
      document.head.appendChild(script);
    }
  }, [
    canonicalUrl,
    finalOgImage,
    fullTitle,
    genre,
    keywords,
    next,
    ogType,
    prev,
    publishedYear,
    robotsContent,
    schemas,
    siteSchemas,
    truncatedDescription,
    updatedDate,
  ]);

  return null;
});

export default SEO;
export { SITE_URL, SITE_NAME, SITE_NAME_SHORT };
