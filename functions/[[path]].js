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
  '/anime': {
    title: 'Anime Vietsub HD - Anime Moi Nhat 2026 | KhoPhim',
    description: 'Xem anime vietsub HD, anime mua moi, anime hanh dong, tinh cam, isekai va hoat hinh Nhat Ban cap nhat tren KhoPhim.',
    h1: 'Anime vietsub HD',
  },
  '/my-nam': {
    title: 'Phim My Nam Vietsub HD - BL, Ngon Tinh, Than Tuong | KhoPhim',
    description: 'Xem phim my nam vietsub HD, phim BL, ngon tinh, than tuong va phim tinh cam co dan dien vien dep tren KhoPhim.',
    h1: 'Phim my nam vietsub HD',
  },
  '/phim-ma': {
    title: 'Phim Ma Kinh Di Vietsub HD - Phim Kinh Di Hay | KhoPhim',
    description: 'Xem phim ma, phim kinh di, giat gan, tam linh va thriller vietsub HD cap nhat moi tren KhoPhim.',
    h1: 'Phim ma va kinh di vietsub HD',
  },
  '/tv-shows': {
    title: 'TV Shows Vietsub HD - Show Truyen Hinh Moi | KhoPhim',
    description: 'Xem TV shows vietsub HD, reality show, series truyen hinh va show giai tri cap nhat hang ngay tren KhoPhim.',
    h1: 'TV Shows vietsub HD',
  },
  '/phim-sap-chieu': {
    title: 'Phim Sap Chieu 2026 - Trailer Va Lich Chieu | KhoPhim',
    description: 'Theo doi phim sap chieu 2026, trailer phim moi, lich chieu, noi dung va thong tin dien vien tren KhoPhim.',
    h1: 'Phim sap chieu va trailer moi',
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
  /^\/anime(\/|$)/,
  /^\/my-nam(\/|$)/,
  /^\/phim-ma(\/|$)/,
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

function isAllowedBlvietsubProxyUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'blvietsub.com') return false;
    return parsed.pathname === '/ophim-sitemap.xml'
      || /^\/phim\/[^/]+\/?$/i.test(parsed.pathname)
      || /^\/xem-phim\/[^/]+\/tap-\d+-sv-\d+\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function withHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
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

function normalizeLower(value) {
  return String(value || '').toLowerCase().trim();
}

function normalizeSearchText(value) {
  return normalizeLower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/đ/g, 'd');
}

function isTrailerOnlyMovie(movie) {
  const ep = normalizeSearchText(movie.episode_current);
  return ep === 'trailer' || ep.includes('trailer') || Boolean(movie.trailer_url);
}

function isUpcomingMovie(movie) {
  const ep = normalizeSearchText(movie.episode_current);
  const status = normalizeSearchText(movie.seo_catalog_status || movie.status);
  const releaseAt = movie.release_at ? new Date(movie.release_at).getTime() : 0;
  if (status === 'upcoming' || ep.includes('sap chieu') || releaseAt > Date.now()) return true;
  return status === 'upcoming' || ep.includes('sap chieu') || ep.includes('sắp chiếu') || releaseAt > Date.now();
}

function formatVietnamDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
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
  const isTrailerOnly = isTrailerOnlyMovie(movie);
  const isUpcoming = isUpcomingMovie(movie);
  const releaseDateText = formatVietnamDate(movie.release_at);
  const episodeText = String(movie.episode_current || '').trim();
  const title = isUpcoming
    ? `${name} - Trailer, Lich Chieu, Noi Dung | KhoPhim`
    : isTrailerOnly
      ? `${name} - Trailer Vietsub, Thong Tin Phim | KhoPhim`
      : `Xem Phim ${name} Vietsub HD | KhoPhim`;
  const description = [
    isUpcoming
      ? `${name}${origin ? ` (${origin})` : ''} la phim sap chieu dang duoc cap nhat trailer, lich chieu, noi dung va thong tin dien vien tren KhoPhim.`
      : isTrailerOnly
        ? `Xem trailer ${name}${origin ? ` (${origin})` : ''}, thong tin phim, noi dung, the loai va lich cap nhat tap moi tren KhoPhim.`
        : `Xem phim ${name}${origin ? ` (${origin})` : ''} online ${lang} ${quality} mien phi tai KhoPhim.`,
    releaseDateText ? `Du kien phat hanh: ${releaseDateText}.` : '',
    episodeText ? `Trang thai: ${episodeText}.` : '',
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
      dateModified: movie.updated_at || movie.modified?.time || undefined,
      releasedEvent: movie.release_at ? {
        '@type': 'PublicationEvent',
        startDate: movie.release_at,
        name: `Lich chieu ${name}`,
      } : undefined,
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
      isFamilyFriendly: true,
    },
  ];
  const body = `${origin ? `<p>${escapeHtml(origin)}</p>` : ''}
    <img src="${escapeHtml(poster)}" alt="${escapeHtml(name)}">
    <p>${escapeHtml(isUpcoming ? 'Phim sap chieu' : isTrailerOnly ? 'Trailer va thong tin phim' : 'Xem phim online')}</p>
    ${releaseDateText ? `<p>Lich chieu du kien: ${escapeHtml(releaseDateText)}</p>` : ''}
    ${episodeText ? `<p>Trang thai hien tai: ${escapeHtml(episodeText)}</p>` : ''}
    <p>${escapeHtml(description)}</p>
    <nav>
      <a href="${escapeHtml(canonical)}">${escapeHtml(isUpcoming || isTrailerOnly ? `Xem trailer va thong tin ${name}` : `Xem phim ${name}`)}</a>
      <a href="${SITE_URL}/phim-moi-nhat">Phim moi nhat</a>
      <a href="${SITE_URL}/phim-sap-chieu">Phim sap chieu</a>
      ${genres.slice(0, 2).map((genre) => `<span>${escapeHtml(genre)}</span>`).join('')}
    </nav>`;
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

async function proxySitemap(pathname, request, context) {
  const movieChunkMatch = /^\/sitemap-movies-(\d+)\.xml$/.exec(pathname);
  let target = `${SUPABASE_FUNCTION_BASE}/sitemap-index?v=20260620-seo-upcoming-v2`;
  if (pathname === '/sitemap-movies.xml' || pathname === '/sitemap-movies-dynamic') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml`;
  } else if (pathname === '/sitemap-movies-recent.xml') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?recent=1&page_size=2000`;
  } else if (pathname === '/sitemap-movies-upcoming.xml') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?upcoming=1&page_size=5000`;
  } else if (movieChunkMatch) {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?page=${movieChunkMatch[1]}&page_size=10000`;
  }
  const cacheKey = new Request(target, { method: 'GET' });

  try {
    if ((request.method === 'GET' || request.method === 'HEAD') && typeof caches !== 'undefined') {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-Sitemap-Proxy', 'cloudflare-pages');
        headers.set('X-Sitemap-Cache', 'HIT');
        const cachedCount = Number(headers.get('X-Movie-Count') || '0');
        if (movieChunkMatch && cachedCount === 0) {
          headers.set('Cache-Control', 'no-store');
          return new Response(null, {
            status: 404,
            headers,
          });
        }
        return new Response(request.method === 'HEAD' ? null : cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
    }

    const response = await fetch(target, {
      headers: { 'Accept': 'application/xml', 'User-Agent': request.headers.get('user-agent') || 'KhoPhimBot/1.0' },
      cf: { cacheTtl: 1800, cacheEverything: true },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Sitemap upstream ${response.status}`);
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/xml; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=1800, s-maxage=3600');
    headers.set('X-Sitemap-Proxy', 'cloudflare-pages');
    headers.set('X-Sitemap-Cache', 'MISS');
    headers.delete('Set-Cookie');
    const movieCount = Number(headers.get('X-Movie-Count') || '0');
    if (movieChunkMatch && movieCount === 0) {
      headers.set('Cache-Control', 'no-store');
      return new Response(request.method === 'HEAD' ? null : '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
        status: 404,
        headers,
      });
    }
    const sitemapResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    if (request.method === 'GET' && typeof caches !== 'undefined') {
      contextWaitUntil(context, caches.default.put(cacheKey, sitemapResponse.clone()));
    }
    return sitemapResponse;
  } catch (error) {
    const message = escapeHtml(error instanceof Error ? error.message : 'Sitemap upstream failed');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${message}</error>`, {
      status: 503,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Sitemap-Proxy': 'cloudflare-pages-error',
        ...SECURITY_HEADERS,
      },
    });
  }
}

async function proxyBlvietsub(request, context) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url') || '';
  if (!isAllowedBlvietsubProxyUrl(target)) {
    return new Response('Bad Request', {
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      },
    });
  }

  const targetUrl = new URL(target);
  const cacheKey = new Request(targetUrl.toString(), { method: 'GET' });
  try {
    if (request.method === 'GET' && typeof caches !== 'undefined') {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-BLVietsub-Proxy', 'HIT');
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 KhoPhim-Sync/1.0',
        'Accept': targetUrl.pathname.endsWith('.xml') ? 'application/xml,text/xml,*/*;q=0.8' : 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Referer': 'https://blvietsub.com/',
      },
      cf: { cacheTtl: targetUrl.pathname.endsWith('.xml') ? 900 : 3600, cacheEverything: true },
      signal: AbortSignal.timeout(25000),
    });
    if (!upstream.ok) throw new Error(`BLVietsub upstream ${upstream.status}`);

    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', targetUrl.pathname.endsWith('.xml') ? 'public, max-age=900, s-maxage=1800' : 'public, max-age=3600, s-maxage=86400');
    headers.set('X-BLVietsub-Proxy', 'MISS');
    headers.delete('Set-Cookie');

    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
    if (request.method === 'GET' && typeof caches !== 'undefined') {
      contextWaitUntil(context, caches.default.put(cacheKey, response.clone()));
    }
    return response;
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'BLVietsub proxy failed', {
      status: 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      },
    });
  }
}

function contextWaitUntil(context, promise) {
  try {
    if (context && typeof context.waitUntil === 'function') {
      context.waitUntil(promise);
      return;
    }
  } catch {
    // Fall through to a regular awaited promise below.
  }
  return promise.catch(() => undefined);
}

async function getCachedPrerender(cacheKey, request) {
  if ((request.method !== 'GET' && request.method !== 'HEAD') || typeof caches === 'undefined') return null;
  const cached = await caches.default.match(cacheKey);
  if (!cached) return null;
  const headers = new Headers(cached.headers);
  headers.set('X-Prerender-Cache', 'HIT');
  return new Response(request.method === 'HEAD' ? null : cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
}

function putCachedPrerender(context, cacheKey, response, request) {
  if (request.method !== 'GET' || typeof caches === 'undefined' || response.status !== 200) return;
  const cachedResponse = response.clone();
  contextWaitUntil(context, caches.default.put(cacheKey, cachedResponse));
}

function isLegacySitemapAlias(pathname) {
  return (
    pathname === '/xml' ||
    pathname === '/sitemap_index.xml' ||
    pathname === '/post-sitemap.xml' ||
    pathname === '/page-sitemap.xml' ||
    pathname === '/category-sitemap.xml' ||
    pathname === '/movie-sitemap.xml'
  );
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (url.hostname === 'www.khophim.org' || url.hostname === 'mhophim.com' || url.hostname === 'www.mhophim.com' || url.protocol === 'http:') {
    return Response.redirect(`${SITE_URL}${pathname}${url.search}`, 301);
  }

  if (
    pathname === '/sitemap.xml' ||
    isLegacySitemapAlias(pathname) ||
    pathname === '/sitemap-movies.xml' ||
    pathname === '/sitemap-movies-dynamic' ||
    pathname === '/sitemap-movies-recent.xml' ||
    pathname === '/sitemap-movies-upcoming.xml' ||
    /^\/sitemap-movies-\d+\.xml$/.test(pathname)
  ) {
    const sitemapResponse = await proxySitemap(pathname, request, context);
    if (sitemapResponse) return sitemapResponse;
  }

  if (pathname === '/internal/blvietsub-proxy') {
    return proxyBlvietsub(request, context);
  }

  if (isStaticAsset(pathname)) {
    return context.next();
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (isBot(userAgent) && shouldPrerender(pathname)) {
    const movieMatch = /^\/phim\/([^/?#]+)/.exec(pathname);
    if (movieMatch) {
      const slug = decodeURIComponent(movieMatch[1]);
      const cacheKey = new Request(`${SITE_URL}/__seo-prerender/phim/${encodeURIComponent(slug)}`, { method: 'GET' });
      const cachedMovieResponse = await getCachedPrerender(cacheKey, request);
      if (cachedMovieResponse) return cachedMovieResponse;
      const movie = await fetchSupabaseMovie(slug) || await fetchOphimMovie(slug);
      const movieResponse = movie
        ? renderMoviePrerender(pathname, movie, slug)
        : renderMoviePrerender(pathname, {
        name: titleFromSlug(slug),
        slug,
        content: 'Thong tin phim dang duoc cap nhat tai KhoPhim. Trang nay duoc tao de theo doi lich chieu, noi dung va nguon phim khi co san.',
        quality: 'HD',
        lang: 'Vietsub',
      }, slug);
      putCachedPrerender(context, cacheKey, movieResponse, request);
      return movieResponse;
    }
    const staticResponse = renderStaticPrerender(pathname);
    if (staticResponse) return staticResponse;
  }

  const response = await context.next();
  return withHeaders(response, pathname);
}
