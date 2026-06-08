import type { Context } from "https://edge.netlify.com";

const SITE_URL = 'https://khophim.org';
const IMG_BASE = 'https://img.ophim.live/uploads/movies/';

// Security headers — inject vào MỌI response (kể cả non-bot)
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://kit.fontawesome.com https://www.googletagmanager.com https://www.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Tất cả bot patterns — lowercase để match
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
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'applebot',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'facebookexternalhit',
  'rogerbot',
  'screaming frog',
  'sitebulb',
  'dotbot',
  'petalbot',
  'bytespider',
];

// Các path cần prerender cho bot
const PRERENDER_PATHS = [
  /^\/$/,
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
  /^\/phim\//,
  /^\/filter/,
  /^\/about(\/|$)/,
  /^\/policy(\/|$)/,
  /^\/dien-vien/,
  /^\/blog(\/|$)/,
];

// Các path KHÔNG được index — thêm X-Robots-Tag: noindex, nofollow vào header
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

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p));
}

function shouldPrerender(pathname: string): boolean {
  return PRERENDER_PATHS.some((pattern) => pattern.test(pathname));
}

function isNoIndexPath(pathname: string): boolean {
  return NOINDEX_PATHS.some((pattern) => pattern.test(pathname));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value = ''): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getImageUrl(path = ''): string {
  if (!path) return `${SITE_URL}/og-image.jpg`;
  if (path.startsWith('http')) return path;
  return `${IMG_BASE}${path}`;
}

type StaticPageMeta = {
  title: string;
  description: string;
  h1: string;
  links: Array<{ href: string; label: string }>;
};

const STATIC_PAGE_META: Record<string, StaticPageMeta> = {
  '/': {
    title: 'KhoPhim - Xem Phim Online Vietsub HD 2026',
    description: 'KhoPhim (khophim.org) la KhoPhim xem phim online vietsub HD, phim le, phim bo, phim chieu rap, anime, phim Han, Trung, Au My cap nhat hang ngay.',
    h1: 'KhoPhim - Xem phim online vietsub HD',
    links: [
      { href: '/phim-moi-nhat', label: 'Phim moi nhat' },
      { href: '/phim-le', label: 'Phim le vietsub' },
      { href: '/phim-bo', label: 'Phim bo vietsub' },
      { href: '/phim-chieu-rap', label: 'Phim chieu rap' },
      { href: '/hoat-hinh', label: 'Anime va hoat hinh' },
      { href: '/phim-han-quoc', label: 'Phim Han Quoc' },
      { href: '/phim-trung-quoc', label: 'Phim Trung Quoc' },
      { href: '/phim-au-my', label: 'Phim Au My' },
      { href: '/blog', label: 'Blog review phim' },
    ],
  },
  '/phim-moi-cap-nhat': {
    title: 'Phim Moi Cap Nhat - Xem Phim Online HD | KhoPhim',
    description: 'Danh sach phim moi cap nhat tai KhoPhim, gom phim le, phim bo, anime va phim chieu rap vietsub HD.',
    h1: 'Phim moi cap nhat tren KhoPhim',
    links: [
      { href: '/phim-le', label: 'Phim le moi' },
      { href: '/phim-bo', label: 'Phim bo moi' },
      { href: '/hoat-hinh', label: 'Hoat hinh moi' },
    ],
  },
  '/phim-moi-nhat': {
    title: 'Phim Moi Nhat 2026 Vietsub HD | KhoPhim',
    description: 'Xem phim moi nhat 2026 vietsub HD tai KhoPhim. Cap nhat phim le, phim bo, phim chieu rap va anime moi.',
    h1: 'Phim moi nhat 2026',
    links: [
      { href: '/phim-hot-2026', label: 'Phim hot 2026' },
      { href: '/phim-chieu-rap', label: 'Phim chieu rap' },
      { href: '/tv-shows', label: 'TV Shows' },
    ],
  },
  '/phim-hot-2026': {
    title: 'Phim Hot 2026 - Bom Tan Dien Anh Moi | KhoPhim',
    description: 'Danh sach phim hot 2026, bom tan dien anh, phim chieu rap, phim hanh dong va anime duoc quan tam nhat tren KhoPhim.',
    h1: 'Phim hot 2026 tren KhoPhim',
    links: [
      { href: '/phim-moi-nhat', label: 'Phim moi nhat 2026' },
      { href: '/phim-chieu-rap', label: 'Phim chieu rap 2026' },
      { href: '/phim-au-my', label: 'Bom tan Hollywood' },
    ],
  },
  '/phim-le': {
    title: 'Phim Le Vietsub HD - Xem Phim Le Hay | KhoPhim',
    description: 'Kho phim le vietsub HD tren KhoPhim: hanh dong, tinh cam, kinh di, hai huoc, vien tuong, chieu rap moi.',
    h1: 'Phim le vietsub HD',
    links: [
      { href: '/the-loai/hanh-dong', label: 'Phim hanh dong' },
      { href: '/the-loai/kinh-di', label: 'Phim kinh di' },
      { href: '/the-loai/tinh-cam', label: 'Phim tinh cam' },
    ],
  },
  '/phim-bo': {
    title: 'Phim Bo Vietsub HD - Series Moi Nhat | KhoPhim',
    description: 'Xem phim bo vietsub HD, series Han Quoc, Trung Quoc, Au My va Thai Lan cap nhat tap moi tai KhoPhim.',
    h1: 'Phim bo vietsub HD',
    links: [
      { href: '/phim-han-quoc', label: 'Phim bo Han Quoc' },
      { href: '/phim-trung-quoc', label: 'Phim bo Trung Quoc' },
      { href: '/phim-thai-lan', label: 'Phim bo Thai Lan' },
    ],
  },
  '/phim-chieu-rap': {
    title: 'Phim Chieu Rap Vietsub HD - Bom Tan Moi | KhoPhim',
    description: 'Danh sach phim chieu rap, bom tan Hollywood, phim Han, Trung va Viet Nam vietsub HD tren KhoPhim.',
    h1: 'Phim chieu rap vietsub HD',
    links: [
      { href: '/phim-au-my', label: 'Bom tan Au My' },
      { href: '/phim-hot-2026', label: 'Phim hot 2026' },
      { href: '/phim-viet-nam', label: 'Phim Viet Nam' },
    ],
  },
  '/hoat-hinh': {
    title: 'Anime Vietsub HD - Hoat Hinh Moi Nhat | KhoPhim',
    description: 'Xem anime vietsub, hoat hinh Nhat Ban, Trung Quoc va phim gia dinh HD cap nhat moi tai KhoPhim.',
    h1: 'Anime va hoat hinh vietsub',
    links: [
      { href: '/phim-nhat-ban', label: 'Phim Nhat Ban' },
      { href: '/the-loai/hoat-hinh', label: 'The loai hoat hinh' },
      { href: '/the-loai/gia-dinh', label: 'Phim gia dinh' },
    ],
  },
  '/phim-han-quoc': {
    title: 'Phim Han Quoc Vietsub HD - Drama Han | KhoPhim',
    description: 'Xem phim Han Quoc vietsub HD, drama tinh cam, hanh dong, hai huoc va series moi cap nhat tren KhoPhim.',
    h1: 'Phim Han Quoc vietsub HD',
    links: [
      { href: '/phim-bo', label: 'Drama Han Quoc' },
      { href: '/the-loai/tinh-cam', label: 'Phim tinh cam Han' },
      { href: '/dien-vien', label: 'Dien vien Han Quoc' },
    ],
  },
  '/phim-trung-quoc': {
    title: 'Phim Trung Quoc Vietsub HD - Co Trang, Tien Hiep | KhoPhim',
    description: 'Xem phim Trung Quoc vietsub HD, co trang, tien hiep, ngon tinh, hanh dong va phim bo moi tai KhoPhim.',
    h1: 'Phim Trung Quoc vietsub HD',
    links: [
      { href: '/the-loai/co-trang', label: 'Phim co trang' },
      { href: '/the-loai/vo-thuat', label: 'Phim vo thuat' },
      { href: '/phim-bo', label: 'Phim bo Trung Quoc' },
    ],
  },
  '/phim-au-my': {
    title: 'Phim Au My Vietsub HD - Hollywood Moi | KhoPhim',
    description: 'Xem phim Au My vietsub HD, Hollywood, hanh dong, vien tuong, kinh di va phim chieu rap moi tren KhoPhim.',
    h1: 'Phim Au My vietsub HD',
    links: [
      { href: '/the-loai/hanh-dong', label: 'Phim hanh dong Au My' },
      { href: '/the-loai/vien-tuong', label: 'Phim vien tuong' },
      { href: '/phim-chieu-rap', label: 'Phim chieu rap Hollywood' },
    ],
  },
  '/phim-nhat-ban': {
    title: 'Phim Nhat Ban Anime Vietsub HD | KhoPhim',
    description: 'Xem phim Nhat Ban, anime vietsub, live action va phim tinh cam Nhat Ban HD tren KhoPhim.',
    h1: 'Phim Nhat Ban va anime vietsub',
    links: [
      { href: '/hoat-hinh', label: 'Anime vietsub' },
      { href: '/the-loai/hoat-hinh', label: 'Hoat hinh Nhat Ban' },
      { href: '/the-loai/tinh-cam', label: 'Phim tinh cam Nhat' },
    ],
  },
  '/phim-thai-lan': {
    title: 'Phim Thai Lan Vietsub HD - Lakorn, BL | KhoPhim',
    description: 'Xem phim Thai Lan vietsub HD, lakorn, BL, tinh cam, hai huoc va phim bo Thai cap nhat tren KhoPhim.',
    h1: 'Phim Thai Lan vietsub HD',
    links: [
      { href: '/phim-bo', label: 'Phim bo Thai Lan' },
      { href: '/the-loai/tinh-cam', label: 'Lakorn tinh cam' },
      { href: '/my-nam', label: 'Phim my nam' },
    ],
  },
  '/phim-viet-nam': {
    title: 'Phim Viet Nam HD - Phim Viet Moi Nhat | KhoPhim',
    description: 'Xem phim Viet Nam HD, phim chieu rap Viet, phim bo Viet va phim gia dinh moi cap nhat tren KhoPhim.',
    h1: 'Phim Viet Nam HD',
    links: [
      { href: '/phim-chieu-rap', label: 'Phim chieu rap Viet Nam' },
      { href: '/the-loai/gia-dinh', label: 'Phim gia dinh Viet' },
      { href: '/the-loai/hai-huoc', label: 'Phim hai Viet Nam' },
    ],
  },
  '/blog': {
    title: 'KhoPhim Blog - Review Phim va Tin Tuc Dien Anh',
    description: 'Blog KhoPhim tong hop review phim, top phim hay, lich phim chieu rap, tin tuc dien anh va goi y phim dang xem.',
    h1: 'KhoPhim Blog review phim',
    links: [
      { href: '/blog/phim-hot-thang-5-2026-xem-tai-khophim', label: 'Phim hot thang 5 2026' },
      { href: '/phim-hot-2026', label: 'Phim hot 2026' },
      { href: '/phim-moi-nhat', label: 'Phim moi nhat' },
    ],
  },
};

function getStaticMeta(pathname: string): StaticPageMeta | null {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (STATIC_PAGE_META[cleanPath]) return STATIC_PAGE_META[cleanPath];
  if (cleanPath.startsWith('/the-loai/')) {
    const name = cleanPath.split('/').pop()?.replace(/-/g, ' ') || 'phim';
    return {
      title: `The Loai ${name} Vietsub HD | KhoPhim`,
      description: `Xem phim the loai ${name} vietsub HD tai KhoPhim. Danh sach phim moi cap nhat, de xem tren dien thoai va may tinh.`,
      h1: `Phim ${name} vietsub HD`,
      links: [
        { href: '/phim-moi-nhat', label: 'Phim moi nhat' },
        { href: '/phim-le', label: 'Phim le' },
        { href: '/phim-bo', label: 'Phim bo' },
      ],
    };
  }
  if (cleanPath.startsWith('/dien-vien')) {
    return {
      title: 'Dien Vien Noi Tieng - Xem Phim Vietsub | KhoPhim',
      description: 'Danh sach dien vien noi tieng va cac bo phim vietsub HD dang chu y tren KhoPhim.',
      h1: 'Dien vien noi tieng',
      links: [
        { href: '/phim-han-quoc', label: 'Dien vien Han Quoc' },
        { href: '/phim-trung-quoc', label: 'Dien vien Trung Quoc' },
        { href: '/phim-au-my', label: 'Dien vien Au My' },
      ],
    };
  }
  if (cleanPath === '/about') {
    return {
      title: 'Gioi Thieu KhoPhim - Xem Phim Online',
      description: 'Gioi thieu KhoPhim, kho phim online vietsub HD voi cac danh muc phim le, phim bo, phim chieu rap va anime.',
      h1: 'Gioi thieu KhoPhim',
      links: [
        { href: '/', label: 'Trang chu' },
        { href: '/policy', label: 'Chinh sach' },
        { href: '/sitemap', label: 'Sitemap' },
      ],
    };
  }
  if (cleanPath === '/policy') {
    return {
      title: 'Chinh Sach Bao Mat va Dieu Khoan | KhoPhim',
      description: 'Chinh sach bao mat, dieu khoan su dung va thong tin DMCA cua KhoPhim.',
      h1: 'Chinh sach va dieu khoan KhoPhim',
      links: [
        { href: '/', label: 'Trang chu' },
        { href: '/about', label: 'Gioi thieu' },
        { href: '/sitemap', label: 'Sitemap' },
      ],
    };
  }
  return null;
}

function renderStaticPrerender(pathname: string, meta: StaticPageMeta): Response {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const canonical = `${SITE_URL}${cleanPath === '/' ? '/' : cleanPath}`;
  const baseLinks = [
    { href: '/', label: 'KhoPhim' },
    { href: '/phim-moi-nhat', label: 'Phim moi nhat' },
    { href: '/phim-le', label: 'Phim le' },
    { href: '/phim-bo', label: 'Phim bo' },
    { href: '/phim-chieu-rap', label: 'Phim chieu rap' },
    { href: '/hoat-hinh', label: 'Anime' },
  ];
  const links = [...meta.links, ...baseLinks]
    .filter((link, index, arr) => arr.findIndex((item) => item.href === link.href) === index);
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'KhoPhim',
      alternateName: ['KhoPhim', 'Kho Phim', 'khophim', 'khophim.org', 'KhoPhim'],
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
      name: 'KhoPhim',
      alternateName: ['KhoPhim', 'Kho Phim', 'khophim.org'],
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': cleanPath === '/' ? 'WebPage' : 'CollectionPage',
      '@id': `${canonical}#webpage`,
      name: meta.title,
      headline: meta.h1,
      description: meta.description,
      url: canonical,
      inLanguage: 'vi-VN',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      publisher: { '@id': `${SITE_URL}/#organization` },
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
  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" hrefLang="vi-VN" href="${escapeHtml(canonical)}">
  <link rel="alternate" hrefLang="x-default" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(meta.title)}">
  <meta property="og:description" content="${escapeHtml(meta.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${SITE_URL}/og-image.jpg">
  <meta property="og:site_name" content="KhoPhim">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <main>
    <h1>${escapeHtml(meta.h1)}</h1>
    <p>${escapeHtml(meta.description)}</p>
    <nav aria-label="Danh muc chinh">
      ${links.map((link) => `<a href="${escapeHtml(`${SITE_URL}${link.href}`)}">${escapeHtml(link.label)}</a>`).join('\n      ')}
    </nav>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600',
      'X-Prerendered': 'edge-static',
      'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      'Link': `<${canonical}>; rel="canonical"`,
      ...SECURITY_HEADERS,
    },
  });
}

async function fetchOphimMovie(slug: string): Promise<Record<string, unknown> | null> {
  const urls = [
    `https://ophim1.com/phim/${encodeURIComponent(slug)}`,
    `https://ophim.tv/phim/${encodeURIComponent(slug)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      const movie = data.movie as Record<string, unknown> | undefined;
      if (movie?.slug) return movie;
    } catch {
      // Try next mirror.
    }
  }
  return null;
}

function taxonomyNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === 'object' && item ? String((item as Record<string, unknown>).name ?? '') : '')
    .filter(Boolean);
}

function renderMoviePrerender(pathname: string, movie: Record<string, unknown>, slug: string): Response {
  const name = String(movie.name || slug);
  const origin = String(movie.origin_name || '');
  const content = stripHtml(String(movie.content || ''));
  const year = Number(movie.year || 0);
  const quality = String(movie.quality || 'HD');
  const lang = String(movie.lang || 'Vietsub');
  const poster = getImageUrl(String(movie.poster_url || movie.thumb_url || ''));
  const canonical = `${SITE_URL}${pathname}`;
  const genres = taxonomyNames(movie.category);
  const countries = taxonomyNames(movie.country);
  const title = `Xem Phim ${name} Vietsub HD | KhoPhim`;
  const description = [
    `Xem phim ${name}${origin ? ` (${origin})` : ''} online ${lang} ${quality} miễn phí tại KhoPhim.`,
    content.slice(0, 140),
    genres.length ? `Thể loại: ${genres.join(', ')}.` : '',
    year ? `Năm phát hành: ${year}.` : '',
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
  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="video.movie">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(poster)}">
  <meta property="og:site_name" content="KhoPhim">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <main>
    <h1>${escapeHtml(name)}</h1>
    ${origin ? `<p>${escapeHtml(origin)}</p>` : ''}
    <img src="${escapeHtml(poster)}" alt="${escapeHtml(name)}">
    <p>${escapeHtml(description)}</p>
    <a href="${escapeHtml(canonical)}">Xem phim ${escapeHtml(name)}</a>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600',
      'X-Prerendered': 'edge-movie',
      'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      'Link': `<${canonical}>; rel="canonical"`,
      ...SECURITY_HEADERS,
    },
  });
}

/** Inject security + robots headers vào response object */
function injectHeaders(response: Response, pathname: string): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }
  // Double protection: X-Robots-Tag cho trang noindex
  // (Googlebot có thể đọc header này mà không cần render HTML)
  if (isNoIndexPath(pathname)) {
    newHeaders.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default async function handler(request: Request, context: Context) {
  const userAgent = request.headers.get('user-agent') ?? '';
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Bỏ qua file tĩnh (js, css, images...)
  if (pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map|json|txt|xml)$/i)) {
    return context.next();
  }

  // Không phải bot → serve SPA bình thường nhưng vẫn inject security + robots headers
  if (!isBot(userAgent) || !shouldPrerender(pathname)) {
    const response = await context.next();
    return injectHeaders(response, pathname);
  }

  const movieMatch = /^\/phim\/([^/?#]+)/.exec(pathname);
  if (movieMatch) {
    const slug = decodeURIComponent(movieMatch[1]);
    const movie = await fetchOphimMovie(slug);
    if (movie) return renderMoviePrerender(pathname, movie, slug);
  }

  /*
  try {
    const prerenderUrl = `${PRERENDER_URL}?path=${encodeURIComponent(pathname)}`;
    const response = await fetch(prerenderUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(12000),
    });

    // Handle redirect từ prerender
    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get('Location') ?? '';
      return new Response(null, {
        status: response.status,
        headers: {
          'Location': location,
          'Cache-Control': 'public, max-age=86400',
          ...SECURITY_HEADERS,
        },
      });
    }

    if (response.ok) {
      const html = await response.text();
      const extraHeaders: Record<string, string> = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=900, s-maxage=3600',
        'X-Prerendered': 'true',
        'X-Prerender-Path': pathname,
        'Link': `<https://khophim.org${pathname}>; rel="canonical"`,
        ...SECURITY_HEADERS,
      };
      // Nếu là trang noindex → thêm X-Robots-Tag vào header
      if (isNoIndexPath(pathname)) {
        extraHeaders['X-Robots-Tag'] = 'noindex, nofollow';
      } else {
        extraHeaders['X-Robots-Tag'] = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
      }
      return new Response(html, {
        status: 200,
        headers: extraHeaders,
      });
    }
  } catch {
    // Nếu prerender lỗi/timeout → fallback về SPA bình thường
  }
  */

  const staticMeta = getStaticMeta(pathname);
  if (staticMeta) return renderStaticPrerender(pathname, staticMeta);

  // Fallback: serve SPA + inject security + robots headers
  const fallback = await context.next();
  return injectHeaders(fallback, pathname);
}

export const config = {
  path: '/*',
};
