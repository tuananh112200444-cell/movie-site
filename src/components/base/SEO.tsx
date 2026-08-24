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
  // index.html owns the single WebSite and Organization entities. Route
  // components only manage page-specific schema so navigation never creates
  // duplicate site entities. A stable JSON string also prevents an effect
  // rerun when a parent recreates an equivalent schema array during render.
  const schemaJson = useMemo(() => {
    const items = schema ? (Array.isArray(schema) ? schema : [schema]) : [];
    return items.length ? JSON.stringify(items) : '';
  }, [schema]);

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
      if (tag.getAttribute('content') !== content) tag.setAttribute('content', content);
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
      if (tag.getAttribute('href') !== href) tag.setAttribute('href', href);
    };

    const ensureAlternate = (hrefLang: string, href?: string) => {
      const selector = `link[data-kp-seo-managed="true"][rel="alternate"][hreflang="${hrefLang}"]`;
      let link = document.head.querySelector<HTMLLinkElement>(selector);
      if (!href) {
        link?.remove();
        return;
      }
      if (!link) {
        link = document.createElement('link');
        link.rel = 'alternate';
        link.hreflang = hrefLang;
        link.dataset.kpSeoManaged = 'true';
        document.head.appendChild(link);
      }
      if (link.href !== href) link.href = href;
    };

    if (document.title !== fullTitle) document.title = fullTitle;

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

    for (const hrefLang of ['vi', 'vi-VN', 'x-default']) ensureAlternate(hrefLang, canonicalUrl);

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

    let schemaScript = document.head.querySelector<HTMLScriptElement>('script[data-kp-seo-managed="true"][data-kp-route-schema="true"]');
    if (!schemaJson) {
      schemaScript?.remove();
    } else {
      if (!schemaScript) {
        schemaScript = document.createElement('script');
        schemaScript.type = 'application/ld+json';
        schemaScript.dataset.kpSeoManaged = 'true';
        schemaScript.dataset.kpRouteSchema = 'true';
        document.head.appendChild(schemaScript);
      }
      if (schemaScript.text !== schemaJson) schemaScript.text = schemaJson;
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
    schemaJson,
    truncatedDescription,
    updatedDate,
  ]);

  return null;
});

export default SEO;
export { SITE_URL, SITE_NAME, SITE_NAME_SHORT };
