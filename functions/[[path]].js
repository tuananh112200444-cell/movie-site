const SITE_URL = 'https://khophim.org';
const IMG_BASE = 'https://img.ophim.live/uploads/movies/';
const SUPABASE_FUNCTION_BASE = 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1';

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://kit.fontawesome.com https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests; worker-src 'self' blob:; manifest-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), autoplay=(), payment=(), usb=()',
};

const BOT_PATTERNS = [
  'googlebot',
  'google-inspectiontool',
  'google-inspection-tool',
  'apis-google',
  'mediapartners-google',
  'adsbot-google',
  'chrome-lighthouse',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'sogou',
  'exabot',
  'facebot',
  'ia_archiver',
  'applebot',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'rogerbot',
  'screaming frog',
  'sitebulb',
  'dotbot',
  'petalbot',
  'bytespider',
];

const STATIC_META = {
  '/': {
    title: 'KhoPhim - Xem Phim Online Vietsub HD',
    description: 'KhoPhim xem phim online vietsub HD, phim le, phim bo, phim chieu rap, anime, phim Han, Trung, Au My cap nhat hang ngay.',
    h1: 'KhoPhim - Xem phim online vietsub HD',
  },
  '/phim-moi-nhat': {
    title: 'Phim Moi Nhat Vietsub HD | KhoPhim',
    description: 'Xem phim moi nhat vietsub HD tai KhoPhim. Cap nhat phim le, phim bo, phim chieu rap va anime moi.',
    h1: 'Phim moi nhat',
  },
  '/phim-hot-2026': {
    title: 'Phim Hot 2026 - Bom Tan Dien Anh Moi | KhoPhim',
    description: 'Danh sach phim hot 2026, bom tan dien anh, phim chieu rap, phim hanh dong va anime duoc quan tam nhat tren KhoPhim.',
    h1: 'Phim hot 2026',
  },
  '/phim-le': {
    title: 'Phim Le Vietsub HD - Xem Phim Le Hay | KhoPhim',
    description: 'Kho phim le vietsub HD tren KhoPhim: hanh dong, tinh cam, kinh di, hai huoc, vien tuong, chieu rap moi.',
    h1: 'Phim le vietsub HD',
  },
  '/phim-bo': {
    title: 'Phim Bo Vietsub HD - Series Moi Nhat | KhoPhim',
    description: 'Xem phim bo vietsub HD, series Han Quoc, Trung Quoc, Au My va Thai Lan cap nhat tap moi tai KhoPhim.',
    h1: 'Phim bo vietsub HD',
  },
  '/phim-chieu-rap': {
    title: 'Phim Chieu Rap Vietsub HD - Bom Tan Moi | KhoPhim',
    description: 'Danh sach phim chieu rap, bom tan Hollywood, phim Han, Trung va Viet Nam vietsub HD tren KhoPhim.',
    h1: 'Phim chieu rap vietsub HD',
  },
  '/hoat-hinh': {
    title: 'Anime Vietsub HD - Hoat Hinh Moi Nhat | KhoPhim',
    description: 'Xem anime vietsub, hoat hinh Nhat Ban, Trung Quoc va phim gia dinh HD cap nhat moi tai KhoPhim.',
    h1: 'Anime va hoat hinh vietsub',
  },
  '/phim-han-quoc': {
    title: 'Phim Han Quoc Vietsub HD - Drama Han | KhoPhim',
    description: 'Xem phim Han Quoc vietsub HD, drama tinh cam, hanh dong, hai huoc va series moi cap nhat tren KhoPhim.',
    h1: 'Phim Han Quoc vietsub HD',
  },
  '/phim-trung-quoc': {
    title: 'Phim Trung Quoc Vietsub HD - Co Trang, Tien Hiep | KhoPhim',
    description: 'Xem phim Trung Quoc vietsub HD, co trang, tien hiep, ngon tinh, hanh dong va phim bo moi tai KhoPhim.',
    h1: 'Phim Trung Quoc vietsub HD',
  },
  '/phim-au-my': {
    title: 'Phim Au My Vietsub HD - Hollywood Moi | KhoPhim',
    description: 'Xem phim Au My vietsub HD, Hollywood, hanh dong, vien tuong, kinh di va phim chieu rap moi tren KhoPhim.',
    h1: 'Phim Au My vietsub HD',
  },
  '/phim-nhat-ban': {
    title: 'Phim Nhat Ban Anime Vietsub HD | KhoPhim',
    description: 'Xem phim Nhat Ban, anime vietsub, live action va phim tinh cam Nhat Ban HD tren KhoPhim.',
    h1: 'Phim Nhat Ban va anime vietsub',
  },
  '/phim-thai-lan': {
    title: 'Phim Thai Lan Vietsub HD - Lakorn, BL | KhoPhim',
    description: 'Xem phim Thai Lan vietsub HD, lakorn, BL, tinh cam, hai huoc va phim bo Thai cap nhat tren KhoPhim.',
    h1: 'Phim Thai Lan vietsub HD',
  },
  '/phim-viet-nam': {
    title: 'Phim Viet Nam HD - Phim Viet Moi Nhat | KhoPhim',
    description: 'Xem phim Viet Nam HD, phim chieu rap Viet, phim bo Viet va phim gia dinh moi cap nhat tren KhoPhim.',
    h1: 'Phim Viet Nam HD',
  },
};

const PRERENDER_PATHS = [
  /^\/$/,
  /^\/phim\//,
  /^\/phim-moi-cap-nhat(\/|$)/,
  /^\/phim-moi-nhat(\/|$)/,
  /^\/phim-hot-2026(\/|$)/,
  /^\/phim-le(\/|$)/,
  /^\/phim-bo(\/|$)/,
  /^\/phim-chieu-rap(\/|$)/,
  /^\/hoat-hinh(\/|$)/,
  /^\/tv-shows(\/|$)/,
  /^\/phim-sap-chieu(\/|$)/,
  /^\/phim-han-quoc(\/|$)/,
  /^\/phim-trung-quoc(\/|$)/,
  /^\/phim-au-my(\/|$)/,
  /^\/phim-nhat-ban(\/|$)/,
  /^\/phim-thai-lan(\/|$)/,
  /^\/phim-viet-nam(\/|$)/,
  /^\/the-loai\//,
  /^\/filter/,
  /^\/dien-vien/,
  /^\/about(\/|$)/,
  /^\/policy(\/|$)/,
  /^\/blog(\/|$)/,
];

const NOINDEX_PATHS = [
  /^\/admin/,
  /^\/admin-ping/,
  /^\/admin-seo/,
  /^\/admin-reviews/,
  /^\/search/,
  /^\/yeu-thich/,
  /^\/login/,
  /^\/dang-ky/,
  /^\/register/,
  /^\/forgot-password/,
  /^\/reset-password/,
];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isBot(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

function shouldPrerender(pathname) {
  return PRERENDER_PATHS.some((pattern) => pattern.test(pathname));
}

function isNoIndexPath(pathname) {
  return NOINDEX_PATHS.some((pattern) => pattern.test(pathname));
}

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot|map|json|txt|xml|m3u8|ts)$/i.test(pathname);
}

function withHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (isNoIndexPath(pathname)) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getCanonicalPath(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

function getImageUrl(path = '') {
  if (!path) return `${SITE_URL}/og-image.jpg`;
  if (String(path).startsWith('http')) return String(path);
  return `${IMG_BASE}${path}`;
}

function taxonomyNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === 'object' ? String(item.name || '') : ''))
    .filter(Boolean);
}

function titleFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Phim dang cap nhat';
}

function renderHtml({ title, description, canonical, h1, body, schema, ogType = 'website', ogImage }) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(ogImage || `${SITE_URL}/og-image.jpg`)}">
  <meta property="og:site_name" content="KhoPhim">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <main>
    <h1>${escapeHtml(h1)}</h1>
    ${body}
  </main>
</body>
</html>`;
}

function renderStaticPrerender(pathname) {
  const cleanPath = getCanonicalPath(pathname);
  const meta = STATIC_META[cleanPath] || (
    cleanPath.startsWith('/the-loai/')
      ? {
          title: `The Loai ${cleanPath.split('/').pop().replace(/-/g, ' ')} Vietsub HD | KhoPhim`,
          description: `Xem phim the loai ${cleanPath.split('/').pop().replace(/-/g, ' ')} vietsub HD tai KhoPhim.`,
          h1: `Phim ${cleanPath.split('/').pop().replace(/-/g, ' ')} vietsub HD`,
        }
      : null
  );
  if (!meta) return null;

  const canonical = `${SITE_URL}${cleanPath === '/' ? '/' : cleanPath}`;
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': cleanPath === '/' ? 'WebPage' : 'CollectionPage',
      '@id': `${canonical}#webpage`,
      name: meta.title,
      headline: meta.h1,
      description: meta.description,
      url: canonical,
      inLanguage: 'vi-VN',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: `${SITE_URL}/` },
        ...(cleanPath === '/' ? [] : [{ '@type': 'ListItem', position: 2, name: meta.h1, item: canonical }]),
      ],
    },
  ];
  const body = `<p>${escapeHtml(meta.description)}</p>
    <nav>
      <a href="${SITE_URL}/phim-moi-nhat">Phim moi nhat</a>
      <a href="${SITE_URL}/phim-hot-2026">Phim hot 2026</a>
      <a href="${SITE_URL}/phim-le">Phim le</a>
      <a href="${SITE_URL}/phim-bo">Phim bo</a>
      <a href="${SITE_URL}/phim-chieu-rap">Phim chieu rap</a>
    </nav>`;
  return new Response(renderHtml({
    title: meta.title,
    description: meta.description,
    canonical,
    h1: meta.h1,
    body,
    schema,
  }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600',
      'X-Prerendered': 'cloudflare-static',
      'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      ...SECURITY_HEADERS,
    },
  });
}

async function fetchOphimMovie(slug) {
  const urls = [
    `https://ophim1.com/phim/${encodeURIComponent(slug)}`,
    `https://ophim.tv/phim/${encodeURIComponent(slug)}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'KhoPhimBot/1.0' },
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data && data.movie && data.movie.slug) return data.movie;
    } catch {
      // Try next mirror.
    }
  }
  return null;
}

async function fetchSupabaseMovie(slug) {
  try {
    const url = new URL(`${SUPABASE_FUNCTION_BASE}/movie-detail-proxy`);
    url.searchParams.set('slug', slug);
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'KhoPhimBot/1.0 SEO-Prerender',
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || !data.status || !data.movie || !data.movie.slug) return null;
    return data.movie;
  } catch {
    return null;
  }
}

function renderMoviePrerender(pathname, movie, slug) {
  const name = String(movie.name || slug);
  const origin = String(movie.origin_name || '');
  const content = stripHtml(movie.content || '');
  const year = Number(movie.year || 0);
  const quality = String(movie.quality || 'HD');
  const lang = String(movie.lang || 'Vietsub');
  const poster = getImageUrl(movie.poster_url || movie.thumb_url || '');
  const cleanPath = pathname.replace(/\/+$/, '') || `/phim/${slug}`;
  const canonical = `${SITE_URL}${cleanPath}`;
  const genres = taxonomyNames(movie.category);
  const countries = taxonomyNames(movie.country);
  const title = `Xem Phim ${name} Vietsub HD | KhoPhim`;
  const description = [
    `Xem phim ${name}${origin ? ` (${origin})` : ''} online ${lang} ${quality} mien phi tai KhoPhim.`,
    content.slice(0, 140),
    genres.length ? `The loai: ${genres.join(', ')}.` : '',
    year ? `Nam phat hanh: ${year}.` : '',
  ].filter(Boolean).join(' ').slice(0, 300);
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name, item: canonical },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': String(movie.type || '') === 'series' ? 'TVSeries' : 'Movie',
      '@id': `${canonical}#movie`,
      name,
      alternateName: origin || undefined,
      url: canonical,
      image: poster,
      thumbnailUrl: poster,
      description,
      datePublished: year ? `${year}-01-01` : undefined,
      genre: genres,
      countryOfOrigin: countries.map((country) => ({ '@type': 'Country', name: country })),
      inLanguage: lang,
      potentialAction: { '@type': 'WatchAction', target: canonical },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      '@id': `${canonical}#video`,
      name: `Xem phim ${name} ${lang} ${quality}`,
      description,
      thumbnailUrl: poster,
      uploadDate: year ? `${year}-01-01T00:00:00+07:00` : new Date().toISOString(),
      embedUrl: canonical,
      url: canonical,
      inLanguage: lang,
    },
  ];
  const body = `${origin ? `<p>${escapeHtml(origin)}</p>` : ''}
    <img src="${escapeHtml(poster)}" alt="${escapeHtml(name)}">
    <p>${escapeHtml(description)}</p>
    <a href="${escapeHtml(canonical)}">Xem phim ${escapeHtml(name)}</a>`;
  return new Response(renderHtml({
    title,
    description,
    canonical,
    h1: name,
    body,
    schema,
    ogType: 'video.movie',
    ogImage: poster,
  }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600',
      'X-Prerendered': 'cloudflare-movie',
      'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      ...SECURITY_HEADERS,
    },
  });
}

async function proxySitemap(pathname, request) {
  const target =
    pathname === '/sitemap-movies.xml' || pathname === '/sitemap-movies-dynamic'
      ? `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml`
      : `${SUPABASE_FUNCTION_BASE}/sitemap-index`;

  try {
    const response = await fetch(target, {
      headers: { 'Accept': 'application/xml', 'User-Agent': request.headers.get('user-agent') || 'KhoPhimBot/1.0' },
      cf: { cacheTtl: 1800, cacheEverything: true },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`Sitemap upstream ${response.status}`);
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/xml; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=1800, s-maxage=3600');
    headers.set('X-Sitemap-Proxy', 'cloudflare-pages');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (url.hostname === 'www.khophim.org' || url.hostname === 'mhophim.com' || url.hostname === 'www.mhophim.com' || url.protocol === 'http:') {
    return Response.redirect(`${SITE_URL}${pathname}${url.search}`, 301);
  }

  if (pathname === '/sitemap.xml' || pathname === '/sitemap-movies.xml' || pathname === '/sitemap-movies-dynamic') {
    const sitemapResponse = await proxySitemap(pathname, request);
    if (sitemapResponse) return sitemapResponse;
  }

  if (isStaticAsset(pathname)) {
    return context.next();
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (isBot(userAgent) && shouldPrerender(pathname)) {
    const movieMatch = /^\/phim\/([^/?#]+)/.exec(pathname);
    if (movieMatch) {
      const slug = decodeURIComponent(movieMatch[1]);
      const movie = await fetchSupabaseMovie(slug) || await fetchOphimMovie(slug);
      if (movie) return renderMoviePrerender(pathname, movie, slug);
      return renderMoviePrerender(pathname, {
        name: titleFromSlug(slug),
        slug,
        content: 'Thong tin phim dang duoc cap nhat tai KhoPhim. Trang nay duoc tao de theo doi lich chieu, noi dung va nguon phim khi co san.',
        quality: 'HD',
        lang: 'Vietsub',
      }, slug);
    }
    const staticResponse = renderStaticPrerender(pathname);
    if (staticResponse) return staticResponse;
  }

  const response = await context.next();
  return withHeaders(response, pathname);
}
