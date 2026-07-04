const SITE_URL = 'https://khophim.org';
const IMG_BASE = 'https://img.ophim.live/uploads/movies/';
const SUPABASE_FUNCTION_BASE = 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1';
const SEO_PRERENDER_VERSION = '20260702-clean-prerender-seo-v1';

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://kit.fontawesome.com https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests; worker-src 'self' blob:; manifest-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), autoplay=(), payment=(), usb=()',
};

function canonicalRedirect(url, pathname) {
  return new Response(null, {
    status: 301,
    headers: {
      Location: `${SITE_URL}${pathname}${url.search}`,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'X-Robots-Tag': 'noindex, follow',
      'X-Canonical-Host': 'khophim.org',
      ...SECURITY_HEADERS,
    },
  });
}

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

const CLEAN_STATIC_META = {
  '/': {
    title: 'KhoPhim - Xem Phim Online Vietsub HD',
    description: 'KhoPhim là trang xem phim online Vietsub HD miễn phí, cập nhật phim lẻ, phim bộ, phim chiếu rạp, anime, phim Hàn, Trung, Âu Mỹ hằng ngày.',
    h1: 'KhoPhim - Xem phim online Vietsub HD',
  },
  '/phim-moi-nhat': {
    title: 'Phim Mới Nhất Vietsub HD | KhoPhim',
    description: 'Xem phim mới nhất Vietsub HD tại KhoPhim. Cập nhật phim lẻ, phim bộ, phim chiếu rạp và anime mới mỗi ngày.',
    h1: 'Phim mới nhất',
  },
  '/phim-moi-cap-nhat': {
    title: 'Phim Mới Cập Nhật Vietsub HD | KhoPhim',
    description: 'Danh sách phim mới cập nhật, tập mới, phim bộ đang chiếu và phim lẻ Vietsub HD được làm mới liên tục trên KhoPhim.',
    h1: 'Phim mới cập nhật',
  },
  '/phim-hot-2026': {
    title: 'Phim Hot 2026 - Bom Tấn Điện Ảnh Mới | KhoPhim',
    description: 'Danh sách phim hot 2026, bom tấn điện ảnh, phim chiếu rạp, phim hành động và anime được quan tâm nhất trên KhoPhim.',
    h1: 'Phim hot 2026',
  },
  '/phim-le': {
    title: 'Phim Lẻ Vietsub HD - Xem Phim Lẻ Hay | KhoPhim',
    description: 'Kho phim lẻ Vietsub HD trên KhoPhim: hành động, tình cảm, kinh dị, hài hước, viễn tưởng và phim chiếu rạp mới.',
    h1: 'Phim lẻ Vietsub HD',
  },
  '/phim-bo': {
    title: 'Phim Bộ Vietsub HD - Series Mới Nhất | KhoPhim',
    description: 'Xem phim bộ Vietsub HD, series Hàn Quốc, Trung Quốc, Âu Mỹ và Thái Lan cập nhật tập mới tại KhoPhim.',
    h1: 'Phim bộ Vietsub HD',
  },
  '/phim-chieu-rap': {
    title: 'Phim Chiếu Rạp Vietsub HD - Bom Tấn Mới | KhoPhim',
    description: 'Danh sách phim chiếu rạp, bom tấn Hollywood, phim Hàn, Trung và Việt Nam Vietsub HD trên KhoPhim.',
    h1: 'Phim chiếu rạp Vietsub HD',
  },
  '/hoat-hinh': {
    title: 'Anime Vietsub HD - Hoạt Hình Mới Nhất | KhoPhim',
    description: 'Xem anime Vietsub, hoạt hình Nhật Bản, Trung Quốc và phim gia đình HD cập nhật mới tại KhoPhim.',
    h1: 'Anime và hoạt hình Vietsub',
  },
  '/anime': {
    title: 'Anime Vietsub HD - Anime Mới Nhất 2026 | KhoPhim',
    description: 'Xem anime Vietsub HD, anime mùa mới, anime hành động, tình cảm, isekai và hoạt hình Nhật Bản cập nhật trên KhoPhim.',
    h1: 'Anime Vietsub HD',
  },
  '/my-nam': {
    title: 'Phim Mỹ Nam Vietsub HD - BL, Ngôn Tình, Thần Tượng | KhoPhim',
    description: 'Xem phim mỹ nam Vietsub HD, phim BL, ngôn tình, thần tượng và phim tình cảm có dàn diễn viên đẹp trên KhoPhim.',
    h1: 'Phim mỹ nam Vietsub HD',
  },
  '/phim-ma': {
    title: 'Phim Ma Kinh Dị Vietsub HD - Phim Kinh Dị Hay | KhoPhim',
    description: 'Xem phim ma, phim kinh dị, giật gân, tâm linh và thriller Vietsub HD cập nhật mới trên KhoPhim.',
    h1: 'Phim ma và kinh dị Vietsub HD',
  },
  '/vu-tru-dam-my': {
    title: 'Vũ Trụ Đam Mỹ / BL / GL Vietsub HD | KhoPhim',
    description: 'Không gian phim Đam Mỹ, BL, GL và Bách Hợp Vietsub HD trên KhoPhim, cập nhật phim mới và tập mới từ BLVietsub.',
    h1: 'Vũ Trụ Đam Mỹ / BL / GL Vietsub HD',
  },
  '/tv-shows': {
    title: 'TV Shows Vietsub HD - Show Truyền Hình Mới | KhoPhim',
    description: 'Xem TV shows Vietsub HD, reality show, series truyền hình và show giải trí cập nhật hằng ngày trên KhoPhim.',
    h1: 'TV Shows Vietsub HD',
  },
  '/phim-sap-chieu': {
    title: 'Phim Sắp Chiếu 2026 - Trailer Và Lịch Chiếu | KhoPhim',
    description: 'Theo dõi phim sắp chiếu 2026, trailer phim mới, lịch chiếu, nội dung và thông tin diễn viên trên KhoPhim.',
    h1: 'Phim sắp chiếu và trailer mới',
  },
  '/phim-han-quoc': {
    title: 'Phim Hàn Quốc Vietsub HD - Drama Hàn | KhoPhim',
    description: 'Xem phim Hàn Quốc Vietsub HD, drama tình cảm, hành động, hài hước và series mới cập nhật trên KhoPhim.',
    h1: 'Phim Hàn Quốc Vietsub HD',
  },
  '/phim-trung-quoc': {
    title: 'Phim Trung Quốc Vietsub HD - Cổ Trang, Tiên Hiệp | KhoPhim',
    description: 'Xem phim Trung Quốc Vietsub HD, cổ trang, tiên hiệp, ngôn tình, hành động và phim bộ mới tại KhoPhim.',
    h1: 'Phim Trung Quốc Vietsub HD',
  },
  '/phim-au-my': {
    title: 'Phim Âu Mỹ Vietsub HD - Hollywood Mới | KhoPhim',
    description: 'Xem phim Âu Mỹ Vietsub HD, Hollywood, hành động, viễn tưởng, kinh dị và phim chiếu rạp mới trên KhoPhim.',
    h1: 'Phim Âu Mỹ Vietsub HD',
  },
  '/phim-nhat-ban': {
    title: 'Phim Nhật Bản Anime Vietsub HD | KhoPhim',
    description: 'Xem phim Nhật Bản, anime Vietsub, live action và phim tình cảm Nhật Bản HD trên KhoPhim.',
    h1: 'Phim Nhật Bản và anime Vietsub',
  },
  '/phim-thai-lan': {
    title: 'Phim Thái Lan Vietsub HD - Lakorn, BL | KhoPhim',
    description: 'Xem phim Thái Lan Vietsub HD, lakorn, BL, tình cảm, hài hước và phim bộ Thái cập nhật trên KhoPhim.',
    h1: 'Phim Thái Lan Vietsub HD',
  },
  '/phim-viet-nam': {
    title: 'Phim Việt Nam HD - Phim Việt Mới Nhất | KhoPhim',
    description: 'Xem phim Việt Nam HD, phim chiếu rạp Việt, phim bộ Việt và phim gia đình mới cập nhật trên KhoPhim.',
    h1: 'Phim Việt Nam HD',
  },
  '/xem-phim-online': {
    title: 'Xem Phim Online Vietsub HD Miễn Phí | KhoPhim',
    description: 'Xem phim online miễn phí tại KhoPhim với phim lẻ, phim bộ, phim chiếu rạp, anime, TV shows Vietsub HD cập nhật mỗi ngày.',
    h1: 'Xem phim online Vietsub HD miễn phí',
  },
  '/phim-vietsub': {
    title: 'Phim Vietsub HD - Xem Phim Phụ Đề Việt | KhoPhim',
    description: 'Tổng hợp phim Vietsub HD có phụ đề tiếng Việt: phim lẻ, phim bộ, phim chiếu rạp, anime, phim Hàn, Trung, Âu Mỹ và Thái Lan.',
    h1: 'Phim Vietsub HD phụ đề Việt',
  },
  '/phim-thuyet-minh': {
    title: 'Phim Thuyết Minh HD - Xem Phim Lồng Tiếng Việt | KhoPhim',
    description: 'Xem phim thuyết minh, phim lồng tiếng Việt và phim Vietsub HD trên KhoPhim, cập nhật nhiều phim hay dễ xem cho mọi thiết bị.',
    h1: 'Phim thuyết minh và lồng tiếng Việt',
  },
  '/phim-long-tieng': {
    title: 'Phim Lồng Tiếng Việt HD | KhoPhim',
    description: 'Kho phim lồng tiếng Việt, phim thuyết minh và phim Vietsub HD dễ xem trên điện thoại, máy tính và TV.',
    h1: 'Phim lồng tiếng Việt HD',
  },
  '/phim-full-hd': {
    title: 'Phim Full HD - Xem Phim HD Nét | KhoPhim',
    description: 'Xem phim Full HD, phim HD Vietsub, phim chiếu rạp, phim bộ và anime chất lượng cao trên KhoPhim.',
    h1: 'Phim Full HD chất lượng cao',
  },
  '/phim-hay': {
    title: 'Phim Hay - Xem Phim Hay Chọn Lọc | KhoPhim',
    description: 'Khám phá phim hay, phim hot, phim mới cập nhật, phim lẻ, phim bộ và phim chiếu rạp đáng xem trên KhoPhim.',
    h1: 'Phim hay chọn lọc trên KhoPhim',
  },
  '/phim-2026': {
    title: 'Phim 2026 - Xem Phim Mới 2026 Vietsub HD | KhoPhim',
    description: 'Danh sách phim 2026 mới, phim hot 2026, phim chiếu rạp 2026, phim bộ 2026 và anime 2026 Vietsub HD trên KhoPhim.',
    h1: 'Phim 2026 mới cập nhật',
  },
  '/phim-2025': {
    title: 'Phim 2025 - Xem Lại Phim Hay 2025 | KhoPhim',
    description: 'Tổng hợp phim 2025 hay, phim lẻ 2025, phim bộ 2025, phim chiếu rạp 2025 và anime 2025 Vietsub HD.',
    h1: 'Phim 2025 hay và đáng xem',
  },
  '/phim-2024': {
    title: 'Phim 2024 - Xem Phim Hay 2024 Vietsub HD | KhoPhim',
    description: 'Xem lại phim 2024 hay, phim chiếu rạp 2024, phim bộ 2024 và anime 2024 Vietsub HD trên KhoPhim.',
    h1: 'Phim 2024 Vietsub HD',
  },
  '/phim-4k': {
    title: 'Phim 4K - Xem Phim Chất Lượng Cao | KhoPhim',
    description: 'Tìm phim 4K, phim Full HD, phim HD chất lượng cao, phim chiếu rạp và phim lẻ nét trên KhoPhim.',
    h1: 'Phim 4K và phim chất lượng cao',
  },
  '/phim-hoan-tat': {
    title: 'Phim Hoàn Tất - Xem Phim Full Trọn Bộ | KhoPhim',
    description: 'Xem phim hoàn tất, phim full, phim trọn bộ Vietsub HD, phim bộ đã đủ tập và phim lẻ xem ngay trên KhoPhim.',
    h1: 'Phim hoàn tất, phim full trọn bộ',
  },
  '/phim-dang-chieu': {
    title: 'Phim Đang Chiếu - Phim Đang Cập Nhật Tập Mới | KhoPhim',
    description: 'Theo dõi phim đang chiếu, phim đang cập nhật tập mới, phim bộ mới, anime mùa mới và phim hot trên KhoPhim.',
    h1: 'Phim đang chiếu và đang cập nhật',
  },
  '/phim-trailer': {
    title: 'Trailer Phim - Phim Sắp Chiếu Và Lịch Chiếu | KhoPhim',
    description: 'Xem trailer phim, lịch chiếu, thông tin phim sắp ra mắt, phim hot 2026 và nội dung phim mới trên KhoPhim.',
    h1: 'Trailer phim và phim sắp chiếu',
  },
  '/about': {
    title: 'Giới Thiệu KhoPhim - Trang Xem Phim Online Vietsub HD',
    description: 'Giới thiệu KhoPhim, trang xem phim online Vietsub HD cập nhật phim mới, tập mới và trải nghiệm xem phim nhanh trên mọi thiết bị.',
    h1: 'Giới thiệu KhoPhim',
  },
  '/policy': {
    title: 'Chính Sách Và Điều Khoản Sử Dụng | KhoPhim',
    description: 'Chính sách sử dụng, quyền riêng tư, điều khoản nội dung và thông tin liên hệ dành cho người dùng KhoPhim.',
    h1: 'Chính sách và điều khoản KhoPhim',
  },
  '/sitemap': {
    title: 'Sơ Đồ Trang Web KhoPhim - Danh Mục Phim Và Trang SEO',
    description: 'Sơ đồ trang web KhoPhim giúp người dùng và công cụ tìm kiếm khám phá nhanh phim mới, danh mục, thể loại và trang nội dung quan trọng.',
    h1: 'Sơ đồ trang web KhoPhim',
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
  /^\/vu-tru-dam-my(\/|$)/,
  /^\/tv-shows(\/|$)/,
  /^\/phim-sap-chieu(\/|$)/,
  /^\/phim-han-quoc(\/|$)/,
  /^\/phim-trung-quoc(\/|$)/,
  /^\/phim-au-my(\/|$)/,
  /^\/phim-nhat-ban(\/|$)/,
  /^\/phim-thai-lan(\/|$)/,
  /^\/phim-viet-nam(\/|$)/,
  /^\/xem-phim-online(\/|$)/,
  /^\/phim-vietsub(\/|$)/,
  /^\/phim-thuyet-minh(\/|$)/,
  /^\/phim-long-tieng(\/|$)/,
  /^\/phim-full-hd(\/|$)/,
  /^\/phim-hay(\/|$)/,
  /^\/phim-2026(\/|$)/,
  /^\/phim-2025(\/|$)/,
  /^\/phim-2024(\/|$)/,
  /^\/phim-4k(\/|$)/,
  /^\/phim-hoan-tat(\/|$)/,
  /^\/phim-dang-chieu(\/|$)/,
  /^\/phim-trailer(\/|$)/,
  /^\/the-loai\//,
  /^\/filter/,
  /^\/dien-vien/,
  /^\/about(\/|$)/,
  /^\/policy(\/|$)/,
  /^\/sitemap(\/|$)/,
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

function sentenceSnippet(value = '', maxLength = 150) {
  const text = stripHtml(value);
  if (!text) return '';
  const sliced = text.length > maxLength ? text.slice(0, maxLength) : text;
  const clean = (sliced.replace(/\s+\S*$/, '').trim() || sliced.trim()).replace(/[,\s]+$/, '');
  return /[.!?\u2026\u3002]$/.test(clean) ? clean : `${clean}.`;
}

function compactMeta(value = '', maxLength = 155) {
  const text = stripHtml(value);
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength - 3);
  const boundary = sliced.lastIndexOf(' ');
  return `${boundary > 90 ? sliced.slice(0, boundary) : sliced}...`;
}

function parseEpisodeCount(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : undefined;
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
    .replace(/Ä‘/g, 'd');
}

function removeVietnameseMarks(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .trim();
}

function keywordVariants(values) {
  const result = [];
  const seen = new Set();
  for (const raw of values) {
    const value = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    for (const item of [value, removeVietnameseMarks(value)]) {
      const clean = String(item || '').replace(/\s+/g, ' ').trim();
      const key = clean.toLowerCase();
      if (clean && !seen.has(key)) {
        seen.add(key);
        result.push(clean);
      }
    }
  }
  return result;
}

function isTrailerOnlyMovie(movie) {
  const ep = normalizeSearchText(movie.episode_current);
  return ep === 'trailer' || ep.includes('trailer') || Boolean(movie.trailer_url);
}

function isUpcomingMovie(movie) {
  const ep = normalizeSearchText(movie.episode_current);
  const status = normalizeSearchText(movie.seo_catalog_status || movie.status);
  const releaseAt = movie.release_at ? new Date(movie.release_at).getTime() : 0;
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

function titleCaseFromSlug(slug) {
  const text = String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
  return text || 'KhoPhim';
}

function dynamicStaticMeta(cleanPath) {
  if (cleanPath.startsWith('/the-loai/')) {
    const name = titleCaseFromSlug(cleanPath.split('/').pop());
    return {
      title: `Phim ${name} Vietsub HD | KhoPhim`,
      description: `Xem phim thể loại ${name} Vietsub HD, cập nhật phim mới, phim lẻ, phim bộ và phim chiếu rạp liên quan tại KhoPhim.`,
      h1: `Phim ${name} Vietsub HD`,
      pageType: 'CollectionPage',
    };
  }

  if (cleanPath === '/dien-vien') {
    return {
      title: 'Diễn Viên Phim - Hồ Sơ Và Phim Tham Gia | KhoPhim',
      description: 'Khám phá danh sách diễn viên, tiểu sử, hình ảnh và các phim Vietsub HD có diễn viên yêu thích trên KhoPhim.',
      h1: 'Diễn viên phim trên KhoPhim',
      pageType: 'CollectionPage',
    };
  }

  if (cleanPath.startsWith('/dien-vien/')) {
    const name = titleCaseFromSlug(cleanPath.split('/').pop());
    return {
      title: `${name} - Phim Và Thông Tin Diễn Viên | KhoPhim`,
      description: `Xem danh sách phim có ${name}, thông tin diễn viên, phim Vietsub HD mới và các tác phẩm nổi bật trên KhoPhim.`,
      h1: `${name} - phim và thông tin diễn viên`,
      pageType: 'ProfilePage',
    };
  }

  if (cleanPath === '/blog') {
    return {
      title: 'Blog Phim - Tin Tức, Lịch Chiếu Và Gợi Ý Phim | KhoPhim',
      description: 'Đọc tin tức phim, lịch chiếu, gợi ý phim hay, phim mới và các bài viết điện ảnh được cập nhật trên KhoPhim.',
      h1: 'Blog phim KhoPhim',
      pageType: 'Blog',
    };
  }

  if (cleanPath.startsWith('/blog/')) {
    const name = titleCaseFromSlug(cleanPath.split('/').pop());
    return {
      title: `${name} | Blog Phim KhoPhim`,
      description: `Bài viết ${name} trên KhoPhim: tin tức phim, lịch chiếu, gợi ý phim hay và thông tin điện ảnh mới.`,
      h1: name,
      pageType: 'BlogPosting',
    };
  }

  if (cleanPath === '/filter' || cleanPath.startsWith('/filter/')) {
    return {
      title: 'Lọc Phim Theo Thể Loại, Quốc Gia, Năm Và Chất Lượng | KhoPhim',
      description: 'Lọc phim nhanh theo thể loại, quốc gia, năm phát hành, chất lượng, phụ đề và trạng thái cập nhật trên KhoPhim.',
      h1: 'Lọc phim nhanh trên KhoPhim',
      pageType: 'CollectionPage',
    };
  }

  return null;
}

function renderHtml({ title, description, canonical, h1, body, schema, ogType = 'website', ogImage, keywords = '', robots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' }) {
  const finalImage = ogImage || `${SITE_URL}/og-image.jpg`;
  const baseSchema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'KhoPhim',
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
      name: 'KhoPhim',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
      sameAs: ['https://www.tiktok.com/@khophim.org'],
    },
  ];
  const schemas = Array.isArray(schema) ? [...baseSchema, ...schema] : [...baseSchema, schema].filter(Boolean);
  return `<!doctype html>
<html lang="vi-VN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta name="googlebot" content="${escapeHtml(robots)}">
  <meta name="language" content="vi">
  <meta name="content-language" content="vi-VN">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="vi" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="vi-VN" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="shortcut icon" href="/favicon.svg">
  <link rel="apple-touch-icon" href="/logo.svg">
  <link rel="manifest" href="/site.webmanifest">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(finalImage)}">
  <meta property="og:site_name" content="KhoPhim">
  <meta property="og:locale" content="vi_VN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(finalImage)}">
  <script type="application/ld+json">${JSON.stringify(schemas)}</script>
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
  const meta = CLEAN_STATIC_META[cleanPath] || dynamicStaticMeta(cleanPath);
  if (!meta) return null;

  const canonical = `${SITE_URL}${cleanPath === '/' ? '/' : cleanPath}`;
  const keywords = keywordVariants([
    meta.h1,
    `xem ${meta.h1}`,
    `xem phim ${meta.h1}`,
    'xem phim online',
    'xem phim Vietsub',
    'xem phim miễn phí',
    'phim HD',
    'KhoPhim',
  ]).join(', ');
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': cleanPath === '/' ? 'WebPage' : meta.pageType || 'CollectionPage',
      '@id': `${canonical}#webpage`,
      name: meta.title,
      headline: meta.h1,
      description: meta.description,
      url: canonical,
      inLanguage: 'vi-VN',
      keywords,
      isPartOf: {
        '@type': 'WebSite',
        name: 'KhoPhim',
        url: SITE_URL,
      },
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
      <a href="${SITE_URL}/phim-moi-nhat">Phim mới nhất</a>
      <a href="${SITE_URL}/phim-hot-2026">Phim hot 2026</a>
      <a href="${SITE_URL}/phim-le">Phim lẻ</a>
      <a href="${SITE_URL}/phim-bo">Phim bộ</a>
      <a href="${SITE_URL}/phim-chieu-rap">Phim chiếu rạp</a>
    </nav>`;
  return new Response(renderHtml({
    title: meta.title,
    description: meta.description,
    canonical,
    h1: meta.h1,
    body,
    schema,
    keywords,
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
  const seoUrl = new URL(`${SUPABASE_FUNCTION_BASE}/movie-seo-prerender-data`);
  seoUrl.searchParams.set('slug', slug);
  const detailUrl = new URL(`${SUPABASE_FUNCTION_BASE}/movie-detail-proxy`);
  detailUrl.searchParams.set('slug', slug);

  const attempts = [
    { url: seoUrl, timeoutMs: 4500 },
    { url: detailUrl, timeoutMs: 9000 },
    { url: detailUrl, timeoutMs: 14000 },
  ];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'KhoPhimBot/1.0 SEO-Prerender',
        },
        signal: AbortSignal.timeout(attempt.timeoutMs),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data && data.status && data.movie && data.movie.slug) return data.movie;
    } catch {
      // Fall through to the next source. Detail repair can be slow on first hit.
    }
  }
  return null;
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
  const totalEpisodeCount = parseEpisodeCount(movie.episode_total);
  const episodeTitleText = episodeText ? ` ${episodeText}` : '';
  const keywordParts = keywordVariants([
    `xem phim ${name}`,
    `xem ${name}`,
    `${name} Vietsub`,
    origin ? `xem phim ${origin}` : '',
    origin ? `${origin} Vietsub` : '',
    episodeText ? `${name} ${episodeText}` : '',
    episodeText ? `xem phim ${name} ${episodeText}` : '',
    ...genres.map((genre) => `phim ${genre}`),
    ...genres.map((genre) => `xem phim ${genre}`),
    ...countries.map((country) => `phim ${country}`),
    ...countries.map((country) => `xem phim ${country}`),
    'xem phim online',
    'xem phim miễn phí',
    'phim Vietsub HD',
    'KhoPhim',
  ]).join(', ');
  const title = isUpcoming
    ? `${name} - Trailer, Lịch Chiếu, Nội Dung | KhoPhim`
    : isTrailerOnly
      ? `${name} - Trailer Vietsub, Thông Tin Phim | KhoPhim`
      : `Xem ${name}${episodeTitleText} ${lang} ${quality}${year ? ` ${year}` : ''} | KhoPhim`;
  const description = compactMeta([
    isUpcoming
      ? `${name}${origin ? ` (${origin})` : ''} là phim sắp chiếu, được cập nhật trailer, lịch chiếu, nội dung và thông tin diễn viên trên KhoPhim.`
      : isTrailerOnly
        ? `Xem trailer ${name}${origin ? ` (${origin})` : ''}, thông tin phim, nội dung, thể loại và lịch cập nhật tập mới trên KhoPhim.`
        : `Xem phim ${name}${origin ? ` (${origin})` : ''} online ${lang} ${quality} miễn phí tại KhoPhim.`,
    releaseDateText ? `Dự kiến phát hành: ${releaseDateText}.` : '',
    episodeText ? `Trạng thái: ${episodeText}.` : '',
    sentenceSnippet(content, 150),
    genres.length ? `Thể loại: ${genres.join(', ')}.` : '',
    year ? `Năm phát hành: ${year}.` : '',
  ].filter(Boolean).join(' '), 155);
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
      keywords: keywordParts,
      datePublished: year ? `${year}-01-01` : undefined,
      dateModified: movie.updated_at || movie.modified?.time || undefined,
      numberOfEpisodes: totalEpisodeCount,
      episode: episodeText ? {
        '@type': 'Episode',
        name: episodeText,
        url: canonical,
      } : undefined,
      releasedEvent: movie.release_at ? {
        '@type': 'PublicationEvent',
        startDate: movie.release_at,
        name: `Lịch chiếu ${name}`,
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
    <p>${escapeHtml(isUpcoming ? 'Phim sắp chiếu' : isTrailerOnly ? 'Trailer và thông tin phim' : 'Xem phim online')}</p>
    ${releaseDateText ? `<p>Lịch chiếu dự kiến: ${escapeHtml(releaseDateText)}</p>` : ''}
    ${episodeText ? `<p>Trạng thái hiện tại: ${escapeHtml(episodeText)}</p>` : ''}
    <p>${escapeHtml(description)}</p>
    <nav>
      <a href="${escapeHtml(canonical)}">${escapeHtml(isUpcoming || isTrailerOnly ? `Xem trailer va thong tin ${name}` : `Xem phim ${name}`)}</a>
      <a href="${SITE_URL}/phim-moi-nhat">Phim mới nhất</a>
      <a href="${SITE_URL}/phim-sap-chieu">Phim sắp chiếu</a>
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
    keywords: keywordParts,
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

function renderMovieNotFound(pathname, slug) {
  const cleanPath = pathname.replace(/\/+$/, '') || `/phim/${slug}`;
  const canonical = `${SITE_URL}${cleanPath}`;
  const title = 'Không tìm thấy phim | KhoPhim';
  const description = 'URL phim này không còn tồn tại hoặc chưa có dữ liệu hợp lệ trên KhoPhim.';
  const body = `<p>Không tìm thấy phim phù hợp với URL này.</p>
    <nav>
      <a href="${SITE_URL}/phim-moi-nhat">Xem phim mới nhất</a>
      <a href="${SITE_URL}/search">Tìm kiếm phim</a>
      <a href="${SITE_URL}">Về trang chủ KhoPhim</a>
    </nav>`;

  return new Response(renderHtml({
    title,
    description,
    canonical,
    h1: 'Không tìm thấy phim',
    body,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
    },
    robots: 'noindex, follow',
  }), {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Prerendered': 'cloudflare-movie-not-found',
      'X-Robots-Tag': 'noindex, follow',
      ...SECURITY_HEADERS,
    },
  });
}

async function proxySitemap(pathname, request, context) {
  if (pathname === '/sitemap.xml' || isLegacySitemapAlias(pathname)) {
    const today = new Date().toISOString().slice(0, 10);
    const movieChunks = Array.from({ length: 8 }, (_, index) => {
      const page = index + 1;
      return `  <sitemap>
    <loc>${SITE_URL}/sitemap-movies-${page}.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`;
    }).join('\n');
    const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<!-- khophim.org Sitemap Index - Last updated: ${today} -->
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE_URL}/sitemap-static.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap-seo-landing.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap-movies-recent.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap-movies-upcoming.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
${movieChunks}
</sitemapindex>`;
    return new Response(request.method === 'HEAD' ? null : sitemapIndex, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600',
        'X-Sitemap-Proxy': 'cloudflare-pages-static-index',
        ...SECURITY_HEADERS,
      },
    });
  }

  const movieChunkMatch = /^\/sitemap-movies-(\d+)\.xml$/.exec(pathname);
  const sitemapVersion = '20260630-supabase-only-v1';
  let target = `${SUPABASE_FUNCTION_BASE}/sitemap-index?v=${sitemapVersion}`;
  if (pathname === '/sitemap-movies.xml' || pathname === '/sitemap-movies-dynamic') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?v=${sitemapVersion}`;
  } else if (pathname === '/sitemap-movies-recent.xml') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?recent=1&page_size=2000&v=${sitemapVersion}`;
  } else if (pathname === '/sitemap-movies-upcoming.xml') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?upcoming=1&page_size=5000&v=${sitemapVersion}`;
  } else if (movieChunkMatch) {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?page=${movieChunkMatch[1]}&page_size=5000&v=${sitemapVersion}`;
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
  const fresh = url.searchParams.get('fresh') === '1' || url.searchParams.get('fresh') === 'true';
  const cacheKey = new Request(targetUrl.toString(), { method: 'GET' });
  try {
    if (!fresh && request.method === 'GET' && typeof caches !== 'undefined') {
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
      signal: AbortSignal.timeout(110000),
    });
    if (!upstream.ok) throw new Error(`BLVietsub upstream ${upstream.status}`);

    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', fresh ? 'no-store' : (targetUrl.pathname.endsWith('.xml') ? 'public, max-age=300, s-maxage=600' : 'public, max-age=300, s-maxage=900'));
    headers.set('X-BLVietsub-Proxy', 'MISS');
    if (fresh) headers.set('X-BLVietsub-Proxy-Fresh', '1');
    headers.delete('Set-Cookie');

    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
    if (!fresh && request.method === 'GET' && typeof caches !== 'undefined') {
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

  if (/^\/assets\/.+\.js$/i.test(pathname) && !url.searchParams.has('__kp_asset')) {
    url.searchParams.set('__kp_asset', '20260704-js-cache-bust');
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      },
    });
  }

  if (url.hostname === 'www.khophim.org' || url.hostname === 'mhophim.com' || url.hostname === 'www.mhophim.com' || url.protocol === 'http:') {
    return canonicalRedirect(url, pathname);
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
      const cacheKey = new Request(`${SITE_URL}/__seo-prerender/${SEO_PRERENDER_VERSION}/phim/${encodeURIComponent(slug)}`, { method: 'GET' });
      const cachedMovieResponse = await getCachedPrerender(cacheKey, request);
      if (cachedMovieResponse) return cachedMovieResponse;
      const movie = await fetchSupabaseMovie(slug) || await fetchOphimMovie(slug);
      const movieResponse = movie
        ? renderMoviePrerender(pathname, movie, slug)
        : renderMovieNotFound(pathname, slug);
      putCachedPrerender(context, cacheKey, movieResponse, request);
      return movieResponse;
    }
    const staticResponse = renderStaticPrerender(pathname);
    if (staticResponse) return staticResponse;
  }

  const response = await context.next();
  return withHeaders(response, pathname);
}

