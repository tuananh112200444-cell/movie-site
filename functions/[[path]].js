const SITE_URL = 'https://khophim.org';
const MHOPHIM_URL = 'https://mhophim.com';
const IMG_BASE = 'https://img.ophim.live/uploads/movies/';
const SUPABASE_FUNCTION_BASE = 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1';
const SUPABASE_REST_BASE = 'https://dzpddbthdeqbkrcjlzap.supabase.co/rest/v1';
// This is Supabase's public browser key (RLS still applies), not a service key.
const SUPABASE_PUBLIC_KEY = 'sb_publishable_Mqk6aVxJjetKY8St_20QWA_Wc2zxBd0';
const SEO_PRERENDER_VERSION = '20260723-ongoing-freshness-v4';

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

function hostRedirect(targetUrl, canonicalHost) {
  return new Response(null, {
    status: 301,
    headers: {
      Location: targetUrl,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'X-Robots-Tag': 'noindex, follow',
      'X-Canonical-Host': canonicalHost,
      ...SECURITY_HEADERS,
    },
  });
}

async function serveAsset(context, pathname, status = 200) {
  const assetUrl = new URL(context.request.url);
  assetUrl.pathname = pathname;
  assetUrl.search = '';
  const assetRequest = new Request(assetUrl.toString(), context.request);
  const response = context.env?.ASSETS?.fetch
    ? await context.env.ASSETS.fetch(assetRequest)
    : await context.next(assetRequest);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', pathname.endsWith('.xml') ? 'public, max-age=3600' : 'public, max-age=300, s-maxage=600');
  headers.set('X-Robots-Tag', status === 404 ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status,
    statusText: status === 404 ? 'Not Found' : response.statusText,
    headers,
  });
}

async function handleMhophimRequest(context, url, pathname) {
  if (url.hostname === 'www.mhophim.com' || url.protocol === 'http:') {
    return hostRedirect(`${MHOPHIM_URL}${pathname}${url.search}`, 'mhophim.com');
  }

  if (/^\/mhophim-assets\//i.test(pathname)) {
    return serveAsset(context, pathname);
  }

  if (/^\/(?:phim|xem-phim)\//i.test(pathname) || /^\/(?:search|filter)(?:\/|$)/i.test(pathname)) {
    return hostRedirect(`${SITE_URL}${pathname}${url.search}`, 'khophim.org');
  }

  if (pathname === '/robots.txt') return serveAsset(context, '/mhophim/robots.txt');
  if (pathname === '/sitemap.xml') return serveAsset(context, '/mhophim/sitemap.xml');
  if (pathname === '/' || pathname === '') return serveAsset(context, '/mhophim/index.html');

  const editorialMatch = /^\/(top|lich-chieu|huong-dan|review)\/([^/?#]+)\/?$/i.exec(pathname);
  if (editorialMatch) {
    return serveAsset(context, `/mhophim/${editorialMatch[1]}/${editorialMatch[2]}/index.html`);
  }

  return serveAsset(context, '/mhophim/404.html', 404);
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
];

const BLOCKED_CRAWLER_PATTERNS = [
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'rogerbot',
  'screaming frog',
  'sitebulb',
  'dotbot',
  'petalbot',
  'bytespider',
  'ccbot',
  'dataforseobot',
  'barkrowler',
  'megaindex',
  'serpstatbot',
  'seokicks',
];

const CLEAN_STATIC_META = {
  '/': {
    title: 'Xem Phim Online Vietsub HD Miễn Phí | KhoPhim',
    description: 'KhoPhim là trang xem phim online Vietsub HD miễn phí, cập nhật phim lẻ, phim bộ, phim chiếu rạp, phim Việt Nam, Hàn, Trung, Âu Mỹ và anime mỗi ngày.',
    h1: 'Xem phim online Vietsub HD miễn phí',
  },
  '/xem-phim': {
    title: 'Xem Phim Online Hay Vietsub HD | KhoPhim',
    description: 'Xem phim online trên KhoPhim với phim mới, phim hay, phim lẻ, phim bộ, phim chiếu rạp, phim Việt Nam, Hàn, Trung, Âu Mỹ và anime Vietsub HD.',
    h1: 'Xem phim online hay Vietsub HD',
  },
  '/xem-phim-mien-phi': {
    title: 'Xem Phim Miễn Phí Vietsub HD | KhoPhim',
    description: 'Xem phim miễn phí Vietsub HD tại KhoPhim, cập nhật phim mới, phim lẻ, phim bộ, phim chiếu rạp, anime và phim theo quốc gia dễ tìm.',
    h1: 'Xem phim miễn phí Vietsub HD',
  },
  '/xem-phim-hd': {
    title: 'Xem Phim HD Online Vietsub Chất Lượng Cao | KhoPhim',
    description: 'Xem phim HD online tại KhoPhim với phim Full HD, phim chiếu rạp, phim lẻ, phim bộ, anime và phim Vietsub chất lượng cao.',
    h1: 'Xem phim HD online Vietsub',
  },
  '/xem-phim-vietsub': {
    title: 'Xem Phim Vietsub Online HD | KhoPhim',
    description: 'Xem phim Vietsub online HD trên KhoPhim: phim Hàn, Trung, Âu Mỹ, Thái Lan, anime, phim lẻ và phim bộ có phụ đề tiếng Việt.',
    h1: 'Xem phim Vietsub online HD',
  },
  '/web-xem-phim': {
    title: 'Web Xem Phim Online Vietsub HD | KhoPhim',
    description: 'KhoPhim là web xem phim online Vietsub HD dành cho người Việt, dễ tìm phim mới, phim hot, phim chiếu rạp và phim theo thể loại.',
    h1: 'Web xem phim online Vietsub HD',
  },
  '/kho-phim-online': {
    title: 'Kho Phim Online Vietsub HD Mới Nhất | KhoPhim',
    description: 'Kho phim online Vietsub HD với nhiều nhóm phim mới, phim hay, phim lẻ, phim bộ, phim chiếu rạp, anime và phim theo quốc gia.',
    h1: 'Kho phim online Vietsub HD',
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
    title: 'Xem Phim Chiếu Rạp Online Vietsub HD | KhoPhim',
    description: 'Xem phim chiếu rạp online Vietsub HD tại KhoPhim: bom tấn Hollywood, phim rạp Hàn, Trung, Việt Nam, hành động, kinh dị và hoạt hình mới cập nhật.',
    h1: 'Xem phim chiếu rạp online Vietsub HD',
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
    title: 'Xem Phim Việt Nam HD - Phim Việt Mới | KhoPhim',
    description: 'Xem phim Việt Nam HD trên KhoPhim: phim chiếu rạp Việt, phim bộ VTV, HTV, web drama, phim hài, tình cảm và gia đình mới cập nhật.',
    h1: 'Xem phim Việt Nam HD',
  },
  '/xem-phim-online': {
    title: 'Xem Phim Online Miễn Phí Vietsub HD | KhoPhim',
    description: 'Xem phim online miễn phí Vietsub HD tại KhoPhim: phim mới, phim hay, phim lẻ, phim bộ, phim chiếu rạp, phim Việt Nam, Hàn, Trung và anime.',
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
  /^\/xem-phim(\/|$)/,
  /^\/xem-phim-mien-phi(\/|$)/,
  /^\/xem-phim-hd(\/|$)/,
  /^\/xem-phim-vietsub(\/|$)/,
  /^\/web-xem-phim(\/|$)/,
  /^\/kho-phim-online(\/|$)/,
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

function isBlockedCrawler(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  return BLOCKED_CRAWLER_PATTERNS.some((pattern) => ua.includes(pattern));
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

async function serveSpaIndex(context, request, pathname) {
  const indexUrl = new URL(request.url);
  indexUrl.pathname = '/';
  indexUrl.search = '?__spa_fallback=1';

  if (context.env && context.env.ASSETS && typeof context.env.ASSETS.fetch === 'function') {
    const response = await context.env.ASSETS.fetch(new Request(indexUrl.toString(), {
      method: request.method,
      headers: request.headers,
    }));
    return withHeaders(response, pathname);
  }

  const response = await context.next();
  return withHeaders(response, pathname);
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
  const contentType = headers.get('Content-Type') || '';
  // Pages assets may carry index.html's historical no-store header into SPA
  // fallbacks. Override only HTML documents; hashed assets keep their own
  // immutable policy and APIs keep their explicit cache semantics.
  if (/text\/html/i.test(contentType)) {
    const edgeTtl = /^\/xem-phim\//.test(pathname) ? 30 : 60;
    const staleTtl = /^\/xem-phim\//.test(pathname) ? 120 : 300;
    headers.set('Cache-Control', `public, max-age=0, must-revalidate, s-maxage=${edgeTtl}, stale-while-revalidate=${staleTtl}`);
  } else if (!headers.has('Cache-Control')) {
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

function encodeCanonicalPath(pathname) {
  const cleanPath = getCanonicalPath(String(pathname || '/'));
  return cleanPath
    .split('/')
    .map((segment) => (segment ? encodeURIComponent(segment) : ''))
    .join('/') || '/';
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

function taxonomyItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || '').trim();
      const slug = String(item.slug || '').trim();
      return name ? { name, slug } : null;
    })
    .filter(Boolean);
}

function personNames(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return keywordVariants(value.map((item) => String(item || '').trim())).slice(0, limit);
}

function normalizedText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function shouldPreferOphimMovieName(primaryMovie, requestedSlug) {
  const name = String(primaryMovie?.name || '').trim();
  const origin = String(primaryMovie?.origin_name || primaryMovie?.title_en || '').trim();
  if (!name) return true;
  if (origin && normalizedText(name) === normalizedText(origin)) return true;
  const requestedTitle = normalizedText(String(requestedSlug || '').replace(/-/g, ' '));
  const nameText = normalizedText(name);
  return requestedTitle.length >= 4 && nameText && !requestedTitle.includes(nameText) && !nameText.includes(requestedTitle);
}

function mergeMovieForPrerender(primaryMovie, ophimMovie) {
  if (!primaryMovie) return ophimMovie || null;
  if (!ophimMovie) return primaryMovie;
  return {
    ...primaryMovie,
    ...Object.fromEntries(Object.entries(ophimMovie).filter(([, value]) => value !== undefined && value !== null && value !== '')),
    slug: primaryMovie.slug || ophimMovie.slug,
    tmdb_id: primaryMovie.tmdb_id || ophimMovie.tmdb_id,
    imdb_id: primaryMovie.imdb_id || ophimMovie.imdb_id,
    modified: primaryMovie.modified || ophimMovie.modified,
  };
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
  return !hasPlayableMovieEvidence(movie) && (ep === 'trailer' || ep.includes('trailer') || Boolean(movie.trailer_url));
}

function isUpcomingMovie(movie) {
  const ep = normalizeSearchText(movie.episode_current);
  const status = normalizeSearchText(movie.seo_catalog_status || movie.status);
  const releaseAt = movie.release_at ? new Date(movie.release_at).getTime() : 0;
  return status === 'upcoming' || ep.includes('sap chieu') || ep.includes('sắp chiếu') || releaseAt > Date.now();
}

function getTrailerEmbedUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\//i.test(raw)) return '';
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
    }
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) {
      const id = url.searchParams.get('v') || (/^\/(?:embed|shorts)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? '');
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
    }
    return raw;
  } catch {
    return '';
  }
}

function hasPlayableMovieEvidence(movie) {
  if (movie.seo_has_playable_episode === true) return true;
  if (movie.seo_has_playable_episode === false) return false;
  const episode = normalizeSearchText(movie.episode_current || movie.current_episode);
  if (!episode || episode.includes('trailer') || episode.includes('sap chieu') || episode.includes('dang cap nhat')) return false;
  return episode === 'full' || episode.includes('hoan tat') || /\d/.test(episode);
}

function formatVietnamDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function currentVietnamDate() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatVietnamDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getMovieModifiedAt(movie) {
  const value = movie.updated_at || movie.modified?.time || movie.modified_time || movie.date_modified || '';
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isFreshMovieUpdate(movie) {
  const timestamp = getMovieModifiedAt(movie);
  if (!timestamp) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000;
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
      logo: `${SITE_URL}/brand/khophim-logo-v2.png`,
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
  <link rel="icon" type="image/png" sizes="48x48" href="/brand/khophim-favicon-v2-48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/brand/khophim-favicon-v2-96.png">
  <link rel="shortcut icon" href="/brand/khophim-favicon-v2-48.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/brand/khophim-apple-touch-v2.png">
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

const STATIC_TOPIC_CONTENT = {
  '/': {
    intro: [
      'KhoPhim tập trung vào nhu cầu xem phim online hằng ngày của khán giả Việt Nam: tìm nhanh, vào phim nhanh, xem trên điện thoại hoặc máy tính mà không cần cài ứng dụng.',
      'Trang chủ là điểm vào chính cho các cụm từ khóa rộng như xem phim, xem phim online, xem phim miễn phí, xem phim Vietsub HD và phim mới cập nhật.',
    ],
    highlights: [
      'Phim mới cập nhật, phim lẻ, phim bộ, phim chiếu rạp và anime được liên kết trực tiếp từ trang chủ.',
      'Các trang danh mục có canonical riêng để Google không nhầm lẫn giữa trang chủ và trang chuyên đề.',
      'Nội dung ưu tiên tiếng Việt có dấu, đồng thời hỗ trợ các biến thể không dấu thường gặp khi người dùng tìm kiếm.',
    ],
    faq: [
      ['Xem phim online miễn phí ở đâu?', 'Bạn có thể xem phim online miễn phí tại KhoPhim với nhiều nhóm nội dung như phim lẻ, phim bộ, phim chiếu rạp, anime, phim Hàn Quốc, phim Trung Quốc và phim Việt Nam.'],
      ['KhoPhim phù hợp với từ khóa xem phim nào?', 'KhoPhim được tối ưu cho các truy vấn rộng như xem phim, xem phim online, xem phim Vietsub, xem phim HD, phim mới cập nhật và các truy vấn theo quốc gia hoặc thể loại.'],
    ],
  },
  '/xem-phim': {
    intro: [
      'Trang xem phim là cửa vào rộng nhất cho người dùng chỉ gõ nhu cầu chung như xem phim, xem phim hay, xem phim mới hoặc xem phim online nhưng chưa xác định thể loại.',
      'Landing này không thay thế trang chủ; nó đóng vai trò gom ý định tìm kiếm rộng rồi dẫn người xem sang phim mới nhất, phim lẻ, phim bộ, phim chiếu rạp và tìm kiếm phim.',
    ],
    highlights: [
      'Tập trung vào cụm từ khóa rộng nhất: xem phim, xem phim online, xem phim hay và xem phim mới.',
      'Liên kết mạnh sang các danh mục có ý định rõ hơn để giảm loãng chủ đề.',
      'Canonical riêng tại /xem-phim để Google có URL đúng cho truy vấn ngắn, còn trang chủ vẫn là hub thương hiệu.',
    ],
    faq: [
      ['Tìm từ khóa xem phim thì nên vào trang nào?', 'Trang /xem-phim là landing rộng cho nhu cầu xem phim chung, sau đó người xem có thể đi tiếp sang phim mới nhất, phim lẻ, phim bộ hoặc phim chiếu rạp.'],
      ['Trang /xem-phim có cạnh tranh với trang chủ không?', 'Không, trang chủ là hub thương hiệu và cập nhật tổng hợp, còn /xem-phim là landing cho truy vấn ngắn có ý định xem phim rõ ràng.'],
    ],
  },
  '/xem-phim-mien-phi': {
    intro: [
      'Trang xem phim miễn phí tập trung vào nhóm người dùng tìm phim dễ vào, không cần đăng ký phức tạp và có thể chuyển nhanh sang phim mới hoặc danh mục phù hợp.',
      'Nội dung được viết theo ý định người xem Việt thường tìm: xem phim miễn phí, phim miễn phí Vietsub HD, xem phim online miễn phí và phim mới miễn phí.',
    ],
    highlights: [
      'Tối ưu cụm xem phim miễn phí, xem phim mien phi, phim miễn phí và phim online miễn phí.',
      'Dẫn người xem sang phim mới, phim lẻ, phim bộ, phim Vietsub và phim HD.',
      'Không trùng với /xem-phim-online vì trang này nhấn vào yếu tố miễn phí, còn /xem-phim-online nhấn vào trải nghiệm online tổng quát.',
    ],
    faq: [
      ['Xem phim miễn phí ở đâu?', 'KhoPhim có trang /xem-phim-mien-phi dành cho nhu cầu xem phim miễn phí Vietsub HD và điều hướng đến các danh mục phim chính.'],
      ['Trang này khác /xem-phim-online thế nào?', '/xem-phim-mien-phi tập trung ý định miễn phí, còn /xem-phim-online là landing rộng cho trải nghiệm xem phim online.'],
    ],
  },
  '/xem-phim-hd': {
    intro: [
      'Trang xem phim HD phục vụ người dùng ưu tiên chất lượng hình ảnh, poster rõ, thông tin phim đầy đủ và các danh mục phim có chất lượng xem tốt.',
      'Đây là cụm theo chất lượng trải nghiệm, liên kết chặt với phim Full HD, phim chiếu rạp, phim lẻ và phim 4K.',
    ],
    highlights: [
      'Tối ưu cho xem phim HD, phim HD online, phim Full HD và phim chất lượng cao.',
      'Liên kết sang phim Full HD, phim chiếu rạp, phim lẻ và phim mới nhất.',
      'Giữ lời mô tả vừa phải, tránh cam kết sai chất lượng khi nguồn phim phụ thuộc host bên ngoài.',
    ],
    faq: [
      ['Xem phim HD online ở đâu?', 'KhoPhim có trang /xem-phim-hd dành cho người xem ưu tiên phim HD, Full HD, phim chiếu rạp và phim chất lượng cao.'],
      ['Phim HD có giống phim Full HD không?', 'Phim HD là cụm rộng về chất lượng xem, còn phim Full HD là một nhóm cụ thể hơn và được liên kết riêng tại /phim-full-hd.'],
    ],
  },
  '/xem-phim-vietsub': {
    intro: [
      'Trang xem phim Vietsub tập trung vào người xem muốn giữ âm thanh gốc và đọc phụ đề tiếng Việt, đặc biệt với phim Hàn, Trung, Thái, Âu Mỹ và anime.',
      'Cụm này khác /phim-vietsub ở góc nhìn hành động tìm kiếm: người dùng muốn xem ngay phim có phụ đề Việt.',
    ],
    highlights: [
      'Tối ưu xem phim Vietsub, xem phim phụ đề Việt, phim Vietsub online và phim Vietsub HD.',
      'Liên kết sang phim Vietsub, anime, phim Hàn Quốc, phim Trung Quốc và phim Âu Mỹ.',
      'Hỗ trợ cả truy vấn có dấu và không dấu để phù hợp cách người Việt tìm kiếm.',
    ],
    faq: [
      ['Xem phim Vietsub là gì?', 'Xem phim Vietsub là xem phim có phụ đề tiếng Việt, thường giữ âm thanh gốc của phim.'],
      ['KhoPhim có trang riêng cho xem phim Vietsub không?', 'Có, /xem-phim-vietsub tập trung vào ý định xem phim có phụ đề Việt, còn /phim-vietsub là danh mục nội dung liên quan rộng hơn.'],
    ],
  },
  '/web-xem-phim': {
    intro: [
      'Trang web xem phim phục vụ nhóm truy vấn người dùng không nhớ tên thương hiệu nhưng đang tìm một website để xem phim online Vietsub HD.',
      'Landing này giúp Google hiểu KhoPhim là một web xem phim có cấu trúc, có trang chủ, danh mục, tìm kiếm, sitemap và các cụm nội dung chuyên đề.',
    ],
    highlights: [
      'Tối ưu cho web xem phim, website xem phim, trang xem phim online và web phim Vietsub.',
      'Dẫn người xem sang trang chủ, xem phim online, tìm kiếm phim và các danh mục chính.',
      'Tăng tín hiệu thương hiệu cho KhoPhim mà không tạo bản sao nội dung của trang chủ.',
    ],
    faq: [
      ['Web xem phim nào dễ tìm phim?', 'KhoPhim có trang /web-xem-phim để giới thiệu cấu trúc web xem phim và dẫn người xem sang các danh mục phù hợp.'],
      ['Trang này có phải trang chủ không?', 'Không, trang này giải thích vai trò web xem phim; trang chủ vẫn là nơi cập nhật và điều hướng chính của KhoPhim.'],
    ],
  },
  '/kho-phim-online': {
    intro: [
      'Trang kho phim online nhấn vào quy mô thư viện nội dung: nhiều nhóm phim, nhiều quốc gia, nhiều thể loại và các trang lọc/tìm kiếm để người xem khám phá nhanh.',
      'Đây là cụm phù hợp với người tìm “kho phim”, “kho phim online”, “kho phim Vietsub” hoặc “kho phim HD”.',
    ],
    highlights: [
      'Tối ưu cho kho phim online, kho phim HD, kho phim Vietsub và kho phim mới.',
      'Liên kết đến sitemap, phim mới nhất, phim lẻ, phim bộ, phim chiếu rạp và tìm kiếm phim.',
      'Giúp Google hiểu KhoPhim là hệ thống nội dung rộng, không chỉ một landing đơn lẻ.',
    ],
    faq: [
      ['Kho phim online là gì?', 'Đó là hệ thống gom nhiều nhóm phim, danh mục, quốc gia và thể loại để người xem tìm phim nhanh hơn.'],
      ['KhoPhim có những nhóm nội dung nào?', 'KhoPhim có phim mới, phim lẻ, phim bộ, phim chiếu rạp, phim Vietsub, anime, phim theo quốc gia và thể loại.'],
    ],
  },
  '/xem-phim-online': {
    intro: [
      'Trang xem phim online gom các nhu cầu tìm kiếm phổ biến nhất: xem phim miễn phí, xem phim Vietsub HD, xem phim mới, xem phim hay, xem phim không cần đăng ký và xem trên nhiều thiết bị.',
      'URL này được dùng như landing page chuyên biệt cho nhóm từ khóa rộng, trong khi từng danh mục như phim chiếu rạp, phim Việt Nam hay phim Hàn Quốc vẫn có trang riêng để tránh loãng chủ đề.',
    ],
    highlights: [
      'Hướng người xem đến phim mới nhất, phim hot, phim lẻ, phim bộ và phim chiếu rạp.',
      'Có liên kết nội bộ đến các cụm nội dung quan trọng để tăng topical authority cho toàn site.',
      'Nội dung server-side giúp Googlebot đọc được chủ đề ngay cả trước khi JavaScript chạy.',
    ],
    faq: [
      ['Xem phim online trên KhoPhim có cần tài khoản không?', 'Không, người xem có thể truy cập các danh mục phim và tìm phim trực tiếp trên trình duyệt.'],
      ['Trang này khác gì trang chủ?', 'Trang này tập trung vào ý định tìm kiếm xem phim online, còn trang chủ là cửa vào tổng hợp cho toàn bộ hệ thống KhoPhim.'],
    ],
  },
  '/phim-chieu-rap': {
    intro: [
      'Trang phim chiếu rạp phục vụ nhóm tìm kiếm có ý định rõ hơn: xem phim chiếu rạp online, phim rạp Vietsub HD, phim chiếu rạp mới, bom tấn Hollywood, phim rạp Việt Nam và phim hành động kinh dị mới.',
      'Nội dung được tách riêng khỏi trang chủ để Google hiểu đây là trang đích chính cho cụm từ khóa phim chiếu rạp, không phải chỉ là một mục nhỏ trong kho phim.',
    ],
    highlights: [
      'Tập trung vào phim rạp mới, bom tấn, phim Việt chiếu rạp và phim điện ảnh quốc tế.',
      'Liên kết chéo đến phim lẻ, phim Việt Nam, phim Âu Mỹ và phim hot 2026.',
      'Canonical riêng tại /phim-chieu-rap để giữ tín hiệu SEO không bị đổ về trang chủ.',
    ],
    faq: [
      ['Xem phim chiếu rạp online ở đâu?', 'KhoPhim có trang phim chiếu rạp riêng tại /phim-chieu-rap, tập trung vào phim rạp mới, bom tấn và phim điện ảnh Vietsub HD.'],
      ['Phim chiếu rạp có bị lẫn với phim bộ không?', 'Không, trang này ưu tiên phim điện ảnh và các phim rạp, còn phim bộ được tách sang trang /phim-bo.'],
    ],
  },
  '/phim-viet-nam': {
    intro: [
      'Trang phim Việt Nam tập trung cho các truy vấn như xem phim Việt Nam, phim Việt Nam HD, phim chiếu rạp Việt, phim bộ Việt, phim VTV, HTV, web drama Việt và phim hài Việt Nam.',
      'Đây là một cụm nội dung quan trọng vì người dùng Việt thường tìm theo quốc gia, tên diễn viên, tên phim truyền hình hoặc nhóm phim chiếu rạp Việt mới.',
    ],
    highlights: [
      'Tách riêng khỏi trang phim chiếu rạp để giữ chủ đề phim Việt Nam rõ ràng.',
      'Liên kết sang phim chiếu rạp, phim bộ, phim lẻ và các quốc gia lân cận như Hàn Quốc, Thái Lan.',
      'Tối ưu cả cụm có dấu và không dấu: phim Việt Nam, phim Viet Nam, xem phim Viet Nam.',
    ],
    faq: [
      ['Xem phim Việt Nam online ở đâu?', 'KhoPhim có trang /phim-viet-nam dành riêng cho phim Việt Nam HD, bao gồm phim chiếu rạp Việt, phim bộ truyền hình, phim hài và web drama.'],
      ['Trang phim Việt Nam có cạnh tranh với phim chiếu rạp không?', 'Không, phim Việt Nam là cụm theo quốc gia, còn phim chiếu rạp là cụm theo loại phát hành. Hai trang liên kết với nhau nhưng canonical riêng.'],
    ],
  },
  '/phim-moi-nhat': {
    intro: [
      'Trang phim mới nhất là nơi gom các phim vừa được cập nhật, phim mới ra tập, phim mới thêm nguồn xem và phim vừa có thông tin phát hành.',
      'Đây là cụm nội dung bắt nhu cầu thời gian thực: người xem không nhớ tên phim cụ thể nhưng muốn biết hôm nay có phim gì mới để xem.',
    ],
    highlights: [
      'Ưu tiên truy vấn phim mới, phim mới cập nhật, phim hôm nay và phim vừa ra tập.',
      'Liên kết sang phim đang chiếu, phim hot 2026, phim bộ và anime để giữ dòng khám phá tự nhiên.',
      'Giúp Google hiểu KhoPhim có nhịp cập nhật nội dung thường xuyên, không chỉ là kho lưu trữ tĩnh.',
    ],
    faq: [
      ['Phim mới nhất trên KhoPhim là gì?', 'Đây là trang dành cho phim vừa cập nhật, phim mới ra tập, phim mới thêm thông tin và các nội dung đang được người xem quan tâm.'],
      ['Trang này khác phim hot 2026 không?', 'Phim mới nhất ưu tiên thời điểm cập nhật, còn phim hot 2026 ưu tiên mức độ quan tâm và xu hướng trong năm.'],
    ],
  },
  '/phim-hot-2026': {
    intro: [
      'Trang phim hot 2026 tập trung vào các phim đang được tìm kiếm nhiều trong năm 2026, bao gồm phim chiếu rạp, phim bộ, anime và các phim theo xu hướng mạng xã hội.',
      'Cụm này giúp KhoPhim bắt tín hiệu trend theo năm, trong khi các trang danh mục vẫn giữ vai trò phân loại theo quốc gia và thể loại.',
    ],
    highlights: [
      'Tối ưu cho phim hot 2026, phim mới 2026, phim hay 2026 và phim đang nổi.',
      'Liên kết đến phim mới nhất, phim chiếu rạp, phim sắp chiếu và trailer để theo sát vòng đời tìm kiếm.',
      'Nội dung server-side giúp Google đọc được chủ đề trend trước khi app tải dữ liệu động.',
    ],
    faq: [
      ['Phim hot 2026 là gì?', 'Đây là nhóm phim trong năm 2026 đang có nhu cầu tìm kiếm cao, được người xem quan tâm hoặc vừa có thông tin mới.'],
      ['Có nên tách phim hot 2026 khỏi trang chủ không?', 'Có, vì truy vấn theo năm có ý định riêng và cần landing page riêng để không làm loãng trang chủ.'],
    ],
  },
  '/phim-le': {
    intro: [
      'Trang phim lẻ tập trung các truy vấn xem phim lẻ, phim điện ảnh, phim lẻ Vietsub HD, phim lẻ hay và phim lẻ mới cập nhật.',
      'Nhóm phim lẻ cần tách khỏi phim bộ vì ý định xem khác nhau: người xem thường muốn chọn một phim hoàn chỉnh để xem ngay.',
    ],
    highlights: [
      'Liên kết tới phim chiếu rạp, phim Âu Mỹ, phim Việt Nam và phim hot 2026.',
      'Canonical riêng giúp nhóm phim lẻ không bị trộn với phim bộ.',
      'Phù hợp cho các truy vấn phim lẻ hay, phim lẻ mới, phim lẻ Vietsub và phim điện ảnh HD.',
    ],
    faq: [
      ['Xem phim lẻ hay ở đâu?', 'KhoPhim có trang /phim-le dành cho phim lẻ Vietsub HD, phim điện ảnh và phim mới cập nhật.'],
      ['Phim lẻ khác phim chiếu rạp thế nào?', 'Phim chiếu rạp là nhóm theo hình thức phát hành, còn phim lẻ là nhóm theo định dạng xem một phim hoàn chỉnh. Hai nhóm có liên kết nhưng không trùng canonical.'],
    ],
  },
  '/phim-bo': {
    intro: [
      'Trang phim bộ phục vụ nhu cầu xem series, drama Hàn Quốc, phim Trung Quốc, phim Thái Lan, phim bộ Việt Nam và các phim đang cập nhật tập mới.',
      'Người tìm phim bộ thường quan tâm trạng thái đủ tập, tập mới, lịch ra tập và quốc gia sản xuất, nên trang này cần nội dung riêng rõ hơn trang phim lẻ.',
    ],
    highlights: [
      'Tách rõ khỏi phim lẻ và phim chiếu rạp.',
      'Liên kết với phim Hàn Quốc, phim Trung Quốc, phim Thái Lan, phim đang chiếu và phim hoàn tất.',
      'Phù hợp truy vấn phim bộ Vietsub, phim bộ hay, phim trọn bộ và phim đang ra tập.',
    ],
    faq: [
      ['Xem phim bộ Vietsub ở đâu?', 'KhoPhim có trang /phim-bo dành cho phim bộ Vietsub HD, phim full trọn bộ và phim đang cập nhật tập mới.'],
      ['Phim bộ đủ tập nằm ở đâu?', 'Người xem có thể đi từ trang phim bộ sang trang phim hoàn tất để tìm các series đã đủ tập.'],
    ],
  },
  '/phim-han-quoc': {
    intro: [
      'Trang phim Hàn Quốc tập trung vào drama Hàn, phim tình cảm, phim học đường, phim hành động, phim lãng mạn và series Hàn đang ra tập.',
      'Đây là cụm quốc gia có nhu cầu tìm kiếm lớn, cần landing riêng để Google không trộn với phim bộ chung hoặc trang chủ.',
    ],
    highlights: [
      'Tối ưu cho phim Hàn Quốc Vietsub, drama Hàn, phim Hàn mới và phim Hàn đang chiếu.',
      'Liên kết sang phim bộ, phim tình cảm, phim đang chiếu và phim hot 2026.',
      'Hỗ trợ cả biến thể có dấu và không dấu như phim Han Quoc, phim han vietsub.',
    ],
    faq: [
      ['Xem phim Hàn Quốc Vietsub ở đâu?', 'KhoPhim có trang /phim-han-quoc dành cho drama Hàn, phim bộ Hàn, phim lẻ Hàn và phim Hàn mới cập nhật.'],
      ['Trang phim Hàn có bị trùng phim bộ không?', 'Không, phim Hàn Quốc là cụm theo quốc gia, còn phim bộ là cụm theo định dạng. Hai trang liên kết nhau nhưng phục vụ truy vấn khác nhau.'],
    ],
  },
  '/phim-trung-quoc': {
    intro: [
      'Trang phim Trung Quốc tập trung vào cổ trang, tiên hiệp, ngôn tình, kiếm hiệp, hiện đại và phim bộ Trung Quốc Vietsub HD.',
      'Cụm này có nhiều truy vấn dài theo thể loại, diễn viên và tên phim, nên cần landing riêng để gom topical authority.',
    ],
    highlights: [
      'Tối ưu cho phim Trung Quốc Vietsub, phim cổ trang, tiên hiệp, ngôn tình và phim Trung mới.',
      'Liên kết sang phim bộ, phim cổ trang, phim đang chiếu và phim hot 2026.',
      'Tách rõ khỏi phim Hàn Quốc, phim Thái Lan và trang xem phim online tổng quát.',
    ],
    faq: [
      ['Xem phim Trung Quốc cổ trang ở đâu?', 'KhoPhim có trang /phim-trung-quoc và các trang thể loại liên quan để người xem tìm phim cổ trang, tiên hiệp, kiếm hiệp và ngôn tình.'],
      ['Có tối ưu cho từ khóa không dấu không?', 'Có, hệ thống metadata hỗ trợ các biến thể như phim Trung Quoc, phim co trang và phim tien hiep.'],
    ],
  },
  '/phim-au-my': {
    intro: [
      'Trang phim Âu Mỹ tập trung vào Hollywood, phim hành động, viễn tưởng, kinh dị, tội phạm, siêu anh hùng và phim chiếu rạp quốc tế.',
      'Nhóm này thường gắn với truy vấn phim lẻ, bom tấn và phim chất lượng cao, nên được liên kết mạnh với phim chiếu rạp và phim Full HD.',
    ],
    highlights: [
      'Tối ưu cho phim Âu Mỹ Vietsub, phim Hollywood, phim hành động Âu Mỹ và phim bom tấn.',
      'Liên kết sang phim chiếu rạp, phim lẻ, phim Full HD và phim 4K.',
      'Giữ canonical riêng để không cạnh tranh với trang phim chiếu rạp.',
    ],
    faq: [
      ['Xem phim Âu Mỹ Vietsub ở đâu?', 'KhoPhim có trang /phim-au-my dành cho phim Hollywood, phim hành động, viễn tưởng, kinh dị và phim Âu Mỹ mới.'],
      ['Phim Âu Mỹ có trùng phim chiếu rạp không?', 'Một số phim có liên quan, nhưng phim Âu Mỹ là cụm theo quốc gia/khu vực còn phim chiếu rạp là cụm theo hình thức phát hành.'],
    ],
  },
  '/anime': {
    intro: [
      'Trang anime tập trung vào anime Vietsub, hoạt hình Nhật Bản, anime mùa mới, anime đang ra tập và các series được cộng đồng quan tâm.',
      'Anime cần landing riêng vì người xem thường tìm theo mùa, tập mới, tên Nhật, tên Anh hoặc thể loại như hành động, học đường, fantasy.',
    ],
    highlights: [
      'Tối ưu cho anime Vietsub, xem anime online, anime mới và anime đang chiếu.',
      'Liên kết sang phim Nhật Bản, hoạt hình, phim đang chiếu và phim hot 2026.',
      'Tách khỏi hoạt hình tổng quát để giữ chủ đề anime rõ hơn cho Google.',
    ],
    faq: [
      ['Xem anime Vietsub ở đâu?', 'KhoPhim có trang /anime dành riêng cho anime Vietsub, anime mùa mới và các series đang cập nhật.'],
      ['Anime có khác hoạt hình không?', 'Anime là cụm riêng tập trung vào hoạt hình Nhật Bản và văn hóa anime, còn hoạt hình có thể rộng hơn.'],
    ],
  },
  '/phim-thai-lan': {
    intro: [
      'Trang phim Thái Lan tập trung vào lakorn, BL Thái, phim tình cảm, học đường, hài hước và series Thái đang được người xem Việt quan tâm.',
      'Đây là cụm có nhiều truy vấn theo diễn viên, cặp đôi và mạng xã hội, nên cần liên kết riêng với Vũ Trụ Đam Mỹ và phim bộ.',
    ],
    highlights: [
      'Tối ưu cho phim Thái Lan Vietsub, phim Thai Lan, lakorn và BL Thái.',
      'Liên kết sang phim bộ, Vũ Trụ Đam Mỹ, phim tình cảm và phim đang chiếu.',
      'Giữ vai trò quốc gia riêng để không trộn với phim Hàn hoặc phim Trung.'],
    faq: [
      ['Xem phim Thái Lan Vietsub ở đâu?', 'KhoPhim có trang /phim-thai-lan dành cho lakorn, BL Thái, phim tình cảm và series Thái mới.'],
      ['Phim BL Thái nên nằm ở đâu?', 'Phim BL Thái có thể xuất hiện ở cả phim Thái Lan và Vũ Trụ Đam Mỹ, nhưng mỗi trang có canonical và mục đích tìm kiếm riêng.'],
    ],
  },
  '/phim-vietsub': {
    intro: [
      'Trang phim Vietsub gom các truy vấn người xem quan tâm phụ đề tiếng Việt: phim Vietsub HD, xem phim phụ đề Việt, phim mới Vietsub và anime Vietsub.',
      'Đây là cụm theo trải nghiệm xem, khác với cụm quốc gia hoặc thể loại, nên cần trang riêng để bắt nhu cầu rất phổ biến tại Việt Nam.',
    ],
    highlights: [
      'Liên kết tới phim Hàn Quốc, Trung Quốc, Âu Mỹ, anime và Vũ Trụ Đam Mỹ.',
      'Tối ưu cả phim Vietsub, phim vietsub, phụ đề Việt và phu de Viet.',
      'Giữ nội dung tự nhiên để tránh nhồi từ khóa phụ đề quá mức.',
    ],
    faq: [
      ['Phim Vietsub là gì?', 'Phim Vietsub là phim có phụ đề tiếng Việt, phù hợp với người xem muốn giữ âm thanh gốc và đọc phụ đề.'],
      ['KhoPhim có trang riêng cho phim Vietsub không?', 'Có, trang /phim-vietsub gom các nhóm phim có phụ đề Việt và liên kết đến các danh mục liên quan.'],
    ],
  },
  '/phim-hay': {
    intro: [
      'Trang phim hay phục vụ người xem chưa biết chọn phim gì, muốn khám phá các phim đáng xem theo xu hướng, thể loại, quốc gia hoặc cảm xúc.',
      'Cụm này là lớp gợi ý trên domain chính, giúp kéo người xem từ nhu cầu rộng sang các danh mục cụ thể hơn.',
    ],
    highlights: [
      'Tối ưu cho phim hay, xem phim hay, phim đáng xem, phim hot và phim mới.',
      'Liên kết tới phim hot 2026, phim mới nhất, phim chiếu rạp và các quốc gia lớn.',
      'Dùng ngôn ngữ tư vấn thay vì chỉ liệt kê từ khóa, giúp trang tự nhiên hơn với Google.'],
    faq: [
      ['Nên xem phim hay ở đâu?', 'KhoPhim có trang /phim-hay để gợi ý các nhóm phim đáng xem và điều hướng sang phim hot, phim mới, phim lẻ hoặc phim bộ.'],
      ['Trang phim hay có trùng trang chủ không?', 'Không, trang chủ là cửa vào tổng hợp, còn phim hay là landing gợi ý cho người chưa có tên phim cụ thể.'],
    ],
  },
  '/phim-dang-chieu': {
    intro: [
      'Trang phim đang chiếu tập trung các phim đang cập nhật tập mới, phim bộ đang phát sóng, anime mùa mới và các nội dung có lịch ra tập.',
      'Người dùng nhóm này thường quay lại nhiều lần, nên đây là trang quan trọng cho cả SEO và giữ chân người xem.',
    ],
    highlights: [
      'Tối ưu cho phim đang chiếu, phim đang cập nhật, phim tập mới và lịch ra tập.',
      'Liên kết sang phim mới cập nhật, phim bộ, anime và Vũ Trụ Đam Mỹ.',
      'Tách khỏi phim hoàn tất để người xem hiểu phim nào còn đang ra tập.',
    ],
    faq: [
      ['Phim đang chiếu là gì?', 'Đây là nhóm phim chưa hoàn tất hoặc đang được cập nhật tập mới theo lịch phát hành.'],
      ['Theo dõi tập mới ở đâu?', 'Người xem có thể dùng /phim-dang-chieu hoặc /phim-moi-cap-nhat để theo dõi các phim vừa có tập mới.'],
    ],
  },
  '/phim-sap-chieu': {
    intro: [
      'Trang phim sắp chiếu tập trung trailer, lịch chiếu, thông tin phim chưa phát hành và các phim có nhu cầu tìm kiếm trước ngày ra mắt.',
      'Cụm này giúp KhoPhim bắt trend sớm trước khi phim có tập hoặc bản xem chính thức.',
    ],
    highlights: [
      'Tối ưu cho phim sắp chiếu, trailer phim, lịch chiếu phim và phim mới ra mắt.',
      'Liên kết tới phim trailer, phim hot 2026, phim chiếu rạp và phim mới nhất.',
      'Tách rõ phim chưa phát hành khỏi phim đã có tập để giảm nhầm lẫn cho người xem.',
    ],
    faq: [
      ['Phim sắp chiếu có xem được ngay không?', 'Một số phim sắp chiếu chỉ có trailer hoặc thông tin lịch chiếu, khi có nguồn xem phù hợp hệ thống sẽ điều hướng sang trang phim tương ứng.'],
      ['Tại sao cần trang phim sắp chiếu?', 'Vì nhiều phim có lượng tìm kiếm trước ngày phát hành, trang này giúp KhoPhim bắt xu hướng sớm và dẫn người xem đúng chỗ.'],
    ],
  },
  '/vu-tru-dam-my': {
    intro: [
      'Vũ Trụ Đam Mỹ là cụm nội dung riêng cho BL, GL, bách hợp, phim đam mỹ Thái, Hàn, Trung, Nhật và các series đang được cộng đồng quan tâm.',
      'Trang này cần tách riêng vì ý định tìm kiếm rất khác với phim bộ tổng quát: người xem thường tìm theo cặp đôi, quốc gia, tập mới và nguồn BL.',
    ],
    highlights: [
      'Tối ưu cho phim đam mỹ, BL Vietsub, GL, bách hợp và phim BL Thái.',
      'Liên kết sang phim Thái Lan, phim bộ, phim đang chiếu và tìm kiếm phim.',
      'Giữ cụm ngách riêng để tăng topical authority mà không làm loãng trang chủ.',
    ],
    faq: [
      ['Vũ Trụ Đam Mỹ trên KhoPhim là gì?', 'Đây là khu vực dành cho phim đam mỹ, BL, GL và bách hợp Vietsub HD, bao gồm phim mới và tập mới.'],
      ['Trang này có ảnh hưởng SEO phim bộ không?', 'Không, đây là cụm ngách riêng. Nó liên kết với phim bộ nhưng có chủ đề và canonical riêng.'],
    ],
  },
};

function getTopicContent(cleanPath) {
  if (STATIC_TOPIC_CONTENT[cleanPath]) return STATIC_TOPIC_CONTENT[cleanPath];
  return {
    intro: ['Trang này là một phần trong cụm nội dung xem phim online của KhoPhim, được tối ưu để người xem và Google hiểu rõ chủ đề, danh mục và liên kết nội bộ liên quan.'],
    highlights: ['Có canonical riêng.', 'Liên kết về các danh mục phim chính.', 'Hỗ trợ truy vấn tiếng Việt có dấu và không dấu.'],
    faq: [['Trang này dùng để làm gì?', 'Trang giúp người xem khám phá đúng nhóm phim cần tìm và giúp công cụ tìm kiếm hiểu cấu trúc nội dung của KhoPhim.']],
  };
}

function getKeywordCluster(cleanPath, meta) {
  const base = [
    'xem phim',
    'xem phim online',
    'xem phim miễn phí',
    'xem phim HD',
    'xem phim Vietsub',
    'phim mới nhất',
    'phim hay',
    'phim hot 2026',
    'phim lẻ',
    'phim bộ',
    'phim chiếu rạp',
    'phim Việt Nam',
    'phim Hàn Quốc',
    'phim Trung Quốc',
    'phim Âu Mỹ',
    'anime Vietsub',
    'web xem phim',
    'kho phim online',
  ];

  const byPath = {
    '/xem-phim': ['xem phim hay', 'xem phim mới', 'xem phim online hay', 'xem phim nhanh', 'trang xem phim', 'web phim hay'],
    '/xem-phim-online': ['xem phim online miễn phí', 'xem phim online Vietsub', 'xem phim không cần tải app', 'xem phim trên điện thoại', 'xem phim trên máy tính'],
    '/xem-phim-mien-phi': ['xem phim mien phi', 'phim miễn phí', 'phim online miễn phí', 'xem phim miễn phí HD', 'xem phim miễn phí Vietsub'],
    '/xem-phim-hd': ['xem phim HD online', 'phim Full HD', 'phim chất lượng cao', 'xem phim nét', 'phim HD Vietsub', 'phim 4K'],
    '/xem-phim-vietsub': ['xem phim vietsub', 'phim phụ đề Việt', 'phim phu de Viet', 'phim Vietsub online', 'phim Vietsub HD'],
    '/web-xem-phim': ['web xem phim online', 'website xem phim', 'trang xem phim online', 'web phim Vietsub', 'web phim HD'],
    '/kho-phim-online': ['kho phim', 'kho phim HD', 'kho phim Vietsub', 'kho phim mới', 'thư viện phim online', 'tổng hợp phim hay'],
    '/phim-chieu-rap': ['xem phim chiếu rạp', 'phim chieu rap', 'phim rạp Vietsub', 'bom tấn chiếu rạp', 'phim điện ảnh mới', 'phim rạp Việt Nam'],
    '/phim-viet-nam': ['xem phim Việt Nam', 'phim Viet Nam', 'phim Việt Nam mới', 'phim chiếu rạp Việt', 'phim bộ Việt Nam', 'web drama Việt'],
    '/phim-han-quoc': ['xem phim Hàn Quốc', 'phim Han Quoc', 'drama Hàn', 'phim Hàn mới', 'phim Hàn Vietsub', 'phim bộ Hàn Quốc'],
    '/phim-trung-quoc': ['xem phim Trung Quốc', 'phim Trung Quoc', 'phim cổ trang', 'phim tiên hiệp', 'phim ngôn tình', 'phim Trung Vietsub'],
    '/phim-au-my': ['xem phim Âu Mỹ', 'phim Au My', 'phim Hollywood', 'phim hành động Mỹ', 'phim bom tấn', 'phim viễn tưởng'],
    '/anime': ['xem anime', 'anime Vietsub', 'anime mới', 'anime mùa mới', 'hoạt hình Nhật Bản', 'xem anime online'],
    '/phim-bo': ['xem phim bộ', 'phim bộ Vietsub', 'phim bộ hay', 'phim trọn bộ', 'phim full', 'series mới'],
    '/phim-le': ['xem phim lẻ', 'phim lẻ Vietsub', 'phim lẻ hay', 'phim điện ảnh', 'phim lẻ mới', 'phim lẻ HD'],
    '/phim-vietsub': ['phim Vietsub', 'xem phim Vietsub', 'phim phụ đề Việt', 'phim vietsub hd', 'anime Vietsub', 'drama Vietsub'],
    '/phim-hay': ['phim hay nên xem', 'xem phim hay', 'phim đáng xem', 'phim hot', 'phim hay cuối tuần', 'gợi ý phim hay'],
    '/phim-moi-nhat': ['phim mới', 'phim mới cập nhật', 'phim mới hôm nay', 'phim vừa ra tập', 'phim mới Vietsub', 'phim cập nhật nhanh'],
    '/phim-dang-chieu': ['phim đang chiếu', 'phim đang cập nhật', 'phim tập mới', 'phim bộ đang chiếu', 'anime đang chiếu', 'lịch ra tập'],
    '/vu-tru-dam-my': ['phim đam mỹ', 'phim dam my', 'BL Vietsub', 'phim BL Thái', 'GL bách hợp', 'phim bách hợp'],
  };

  const extra = byPath[cleanPath] || [];
  return keywordVariants([meta.h1, meta.title, meta.description, ...base, ...extra]).slice(0, 42);
}

function renderTopicBody(cleanPath, meta, canonical) {
  const topic = getTopicContent(cleanPath);
  const keywordCluster = getKeywordCluster(cleanPath, meta);
  const isFreshHub = cleanPath === '/phim-moi-nhat' || cleanPath === '/phim-moi-cap-nhat';
  const relatedLinks = [
    ['/xem-phim-online', 'Xem phim online'],
    ...(isFreshHub ? [['/sitemap-movies-recent.xml', 'Sitemap phim vừa cập nhật']] : []),
    ['/phim-moi-nhat', 'Phim mới nhất'],
    ['/phim-moi-cap-nhat', 'Phim mới cập nhật'],
    ['/phim-hot-2026', 'Phim hot 2026'],
    ['/phim-le', 'Phim lẻ'],
    ['/phim-bo', 'Phim bộ'],
    ['/phim-chieu-rap', 'Phim chiếu rạp'],
    ['/phim-viet-nam', 'Phim Việt Nam'],
    ['/phim-han-quoc', 'Phim Hàn Quốc'],
    ['/phim-trung-quoc', 'Phim Trung Quốc'],
    ['/phim-au-my', 'Phim Âu Mỹ'],
    ['/anime', 'Anime Vietsub'],
    ['/search', 'Tìm kiếm phim'],
  ].filter(([href]) => href !== cleanPath);
  return `<p>${escapeHtml(meta.description)}</p>
    <section>
      <h2>${escapeHtml(meta.h1)} trên KhoPhim có gì?</h2>
      ${topic.intro.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}
    </section>
    <section>
      <h2>Lý do trang này quan trọng cho người xem phim</h2>
      <ul>
        ${topic.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </section>
    ${isFreshHub ? `<section>
      <h2>Ưu tiên phim và tập mới cập nhật</h2>
      <p>KhoPhim đặt các phim vừa ra tập, phim mới thêm nguồn xem và phim có cập nhật gần nhất vào luồng ưu tiên crawl. Googlebot có thể đi từ trang này sang sitemap phim mới để phát hiện URL phim vừa đổi tập nhanh hơn.</p>
      <ul>
        <li>Phim vừa cập nhật được ghi rõ trạng thái tập mới trong title, mô tả, H1 và schema.</li>
        <li>Sitemap phim mới cập nhật được đặt trong sitemap index để Google đọc nhóm URL mới trước.</li>
        <li>Các trang phim mới liên kết ngược về phim mới cập nhật, phim mới nhất và sitemap recent để tăng tín hiệu freshness.</li>
      </ul>
    </section>` : ''}
    <section>
      <h2>Câu hỏi thường gặp</h2>
      ${topic.faq.map(([question, answer]) => `<article><h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p></article>`).join('')}
    </section>
    <section>
      <h2>Cụm từ khóa liên quan</h2>
      <p>KhoPhim tối ưu các biến thể tìm kiếm tự nhiên theo tiếng Việt có dấu và không dấu để người xem dễ tìm đúng phim cần xem.</p>
      <ul>
        ${keywordCluster.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </section>
    <nav aria-label="Danh mục phim liên quan">
      ${relatedLinks.map(([href, label]) => `<a href="${SITE_URL}${href}">${escapeHtml(label)}</a>`).join('')}
      <a href="${escapeHtml(canonical)}">${escapeHtml(meta.h1)}</a>
    </nav>`;
}

function renderStaticPrerender(pathname) {
  const cleanPath = getCanonicalPath(pathname);
  const meta = CLEAN_STATIC_META[cleanPath] || dynamicStaticMeta(cleanPath);
  if (!meta) return null;

  const canonical = `${SITE_URL}${cleanPath === '/' ? '/' : cleanPath}`;
  const keywords = keywordVariants([
    meta.h1,
    meta.title.replace(/\s*\|\s*KhoPhim$/i, ''),
    meta.description,
    'xem phim online',
    'xem phim',
    'xem phim HD',
    'xem phim Vietsub',
    'xem phim miễn phí',
    'xem phim chiếu rạp',
    'xem phim Việt Nam',
    'phim HD',
    'KhoPhim',
  ]).join(', ');
  const topic = getTopicContent(cleanPath);
  const isFreshHub = cleanPath === '/phim-moi-nhat' || cleanPath === '/phim-moi-cap-nhat';
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
      significantLink: isFreshHub ? [
        `${SITE_URL}/sitemap-movies-recent.xml`,
        `${SITE_URL}/phim-moi-nhat`,
        `${SITE_URL}/phim-moi-cap-nhat`,
        `${SITE_URL}/phim-dang-chieu`,
      ] : undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: `${SITE_URL}/` },
        ...(cleanPath === '/' ? [] : [{ '@type': 'ListItem', position: 2, name: meta.h1, item: canonical }]),
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: topic.faq.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ];
  const body = renderTopicBody(cleanPath, meta, canonical);
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
      'Cache-Control': isOngoing
        ? 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800'
        : 'public, max-age=900, s-maxage=3600',
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
  const titleVariants = keywordVariants([
    name,
    origin,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.title_original,
  ]).filter((item) => item && item.toLowerCase() !== name.toLowerCase()).slice(0, 5);
  const content = stripHtml(movie.content || '');
  const year = Number(movie.year || 0);
  const lang = String(movie.lang || 'Vietsub');
  const poster = getImageUrl(movie.poster_url || movie.thumb_url || '');
  const requestedSlug = String(slug || '').trim();
  const pathSlug = /^\/phim\/([^/?#]+)/.exec(pathname)?.[1];
  const canonicalSlug = decodeURIComponent(pathSlug || requestedSlug || String(movie.slug || '')).trim() || String(movie.slug || slug).trim() || slug;
  const canonicalPath = `/phim/${canonicalSlug}`;
  const canonical = `${SITE_URL}${encodeCanonicalPath(canonicalPath)}`;
  const watchUrl = `${SITE_URL}/xem-phim/${encodeURIComponent(canonicalSlug)}`;
  const genreItems = taxonomyItems(movie.category);
  const countryItems = taxonomyItems(movie.country);
  const genres = genreItems.map((item) => item.name);
  const countries = countryItems.map((item) => item.name);
  const actors = personNames(movie.actor, 12);
  const directors = personNames(movie.director, 8);
  const isTrailerOnly = isTrailerOnlyMovie(movie);
  const isUpcoming = isUpcomingMovie(movie);
  const hasPlayableEpisode = hasPlayableMovieEvidence(movie);
  const trailerEmbedUrl = getTrailerEmbedUrl(movie.trailer_url);
  const qualityApproved = movie.seo_eligible_for_index === true;
  const qualityTier = String(movie.seo_index_tier || '');
  const isOngoing = qualityTier === 'ongoing';
  const qualityChecked = Boolean(movie.seo_quality_checked_at);
  const isIndexableUpcoming = qualityApproved
    && qualityTier === 'upcoming'
    && (isUpcoming || isTrailerOnly)
    && Boolean(trailerEmbedUrl && name && poster && content.length >= 120);
  const isIndexablePlayable = (
    qualityApproved
      && (qualityTier === 'playable' || qualityTier === 'ongoing')
      && hasPlayableEpisode
      && Boolean(name && poster && content.length >= 80)
  ) || (!qualityChecked
      && hasPlayableEpisode
      && !isUpcoming
      && !isTrailerOnly
      && Boolean(name && poster && content.length >= 80));
  const isIndexable = isIndexableUpcoming || isIndexablePlayable;
  const releaseDateText = formatVietnamDate(movie.release_at);
  const episodeChangedAt = Date.parse(String(movie.seo_last_episode_change_at || '')) || 0;
  const modifiedAt = Math.max(getMovieModifiedAt(movie), episodeChangedAt);
  const modifiedIso = modifiedAt ? new Date(modifiedAt).toISOString() : undefined;
  const modifiedText = modifiedAt ? formatVietnamDateTime(modifiedAt) : '';
  const isFreshUpdate = isFreshMovieUpdate(movie);
  const episodeText = String(movie.episode_current || '').trim();
  const latestEpisodeNumber = Number(movie.seo_latest_episode_number || movie.current_episode || 0);
  const totalEpisodeCount = Number(movie.seo_declared_total_episodes || parseEpisodeCount(movie.episode_total) || 0);
  const episodeProgress = Number(movie.seo_episode_progress_percent || 0);
  const freshnessScore = Number(movie.seo_freshness_score || 0);
  const nextEpisodeText = formatVietnamDateTime(movie.seo_next_episode_at || movie.next_episode_at);
  const updateIntentText = (isOngoing || isFreshUpdate) && episodeText && !isUpcoming && !isTrailerOnly
    ? `Tập mới cập nhật: ${episodeText}.`
    : '';
  const title = isUpcoming
    ? `${name} - Lịch Chiếu Và Thông Tin Phim | KhoPhim`
    : isTrailerOnly
      ? `${name} - Trailer Và Thông Tin Phim | KhoPhim`
      : isOngoing
        ? `${name} - ${episodeText || `Tập ${latestEpisodeNumber}`} Đang Chiếu ${lang} | KhoPhim`
      : `${name}${year ? ` (${year})` : ''} - Xem Phim ${lang} | KhoPhim`;
  const description = compactMeta([
    isUpcoming
      ? `${name}${origin ? ` (${origin})` : ''} là phim sắp chiếu, được cập nhật trailer, lịch chiếu, nội dung và thông tin diễn viên trên KhoPhim.`
      : isTrailerOnly
        ? `Xem trailer ${name}${origin ? ` (${origin})` : ''}, thông tin phim, nội dung, thể loại và lịch cập nhật tập mới trên KhoPhim.`
        : isOngoing
          ? `${name}${origin ? ` (${origin})` : ''} đang chiếu bản ${lang}, hiện có ${episodeText || `tập ${latestEpisodeNumber}`}${totalEpisodeCount ? ` trên tổng dự kiến ${totalEpisodeCount} tập` : ''}. Theo dõi và xem tập mới trên KhoPhim.`
        : `Xem thông tin và các tập đang có của ${name}${origin ? ` (${origin})` : ''} bản ${lang} trên KhoPhim.`,
    updateIntentText,
    nextEpisodeText ? `Tập tiếp theo dự kiến: ${nextEpisodeText}.` : '',
    releaseDateText ? `Dự kiến phát hành: ${releaseDateText}.` : '',
    episodeText ? `Trạng thái: ${episodeText}.` : '',
    modifiedText ? `Cập nhật lúc ${modifiedText}.` : '',
    sentenceSnippet(content, 150),
    genres.length ? `Thể loại: ${genres.join(', ')}.` : '',
    year ? `Năm phát hành: ${year}.` : '',
  ].filter(Boolean).join(' '), 155);
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: SITE_URL },
        ...(genreItems[0]?.slug ? [{
          '@type': 'ListItem',
          position: 2,
          name: genreItems[0].name,
          item: `${SITE_URL}/the-loai/${genreItems[0].slug}`,
        }] : []),
        { '@type': 'ListItem', position: genreItems[0]?.slug ? 3 : 2, name, item: canonical },
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
      dateModified: modifiedIso,
      numberOfEpisodes: totalEpisodeCount,
      episode: episodeText ? {
        '@type': 'Episode',
        name: episodeText,
        episodeNumber: latestEpisodeNumber || undefined,
        url: canonical,
        datePublished: modifiedIso,
        dateModified: modifiedIso,
      } : undefined,
      actor: actors.map((actor) => ({ '@type': 'Person', name: actor })),
      director: directors.map((director) => ({ '@type': 'Person', name: director })),
      releasedEvent: movie.release_at ? {
        '@type': 'PublicationEvent',
        startDate: movie.release_at,
        name: `Lịch chiếu ${name}`,
      } : undefined,
      genre: genres,
      countryOfOrigin: countries.map((country) => ({ '@type': 'Country', name: country })),
      inLanguage: lang,
      potentialAction: hasPlayableEpisode ? { '@type': 'WatchAction', target: watchUrl } : undefined,
      trailer: trailerEmbedUrl ? { '@id': `${canonical}#trailer` } : undefined,
    },
    ...(trailerEmbedUrl ? [{
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      '@id': `${canonical}#trailer`,
      name: `Trailer ${name}`,
      description,
      thumbnailUrl: [poster],
      uploadDate: modifiedIso || movie.release_at || (year ? `${year}-01-01` : undefined),
      embedUrl: trailerEmbedUrl,
      url: canonical,
      inLanguage: lang,
      isFamilyFriendly: true,
    }] : []),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      primaryImageOfPage: poster ? { '@type': 'ImageObject', url: poster } : undefined,
      breadcrumb: { '@id': `${canonical}#breadcrumb` },
      inLanguage: 'vi-VN',
      dateModified: modifiedIso,
      significantLink: [
        `${SITE_URL}/phim-moi-cap-nhat`,
        `${SITE_URL}/phim-moi-nhat`,
        ...(isOngoing ? [`${SITE_URL}/phim-dang-chieu`, `${SITE_URL}/sitemap-movies-ongoing.xml`] : []),
        `${SITE_URL}/sitemap-movies-recent.xml`,
      ],
    },
  ];
  const genreLinks = genreItems.slice(0, 4)
    .map((genre) => genre.slug
      ? `<a href="${SITE_URL}/the-loai/${escapeHtml(genre.slug)}">${escapeHtml(genre.name)}</a>`
      : `<span>${escapeHtml(genre.name)}</span>`)
    .join('');
  const countryCanonicalPaths = new Map([
    ['viet-nam', '/phim-viet-nam'], ['han-quoc', '/phim-han-quoc'],
    ['trung-quoc', '/phim-trung-quoc'], ['nhat-ban', '/phim-nhat-ban'],
    ['thai-lan', '/phim-thai-lan'], ['au-my', '/phim-au-my'],
  ]);
  const countryLinks = countryItems.slice(0, 3)
    .map((country) => country.slug
      ? `<a href="${SITE_URL}${countryCanonicalPaths.get(country.slug) || `/filter?country=${escapeHtml(country.slug)}`}">${escapeHtml(country.name)}</a>`
      : `<span>${escapeHtml(country.name)}</span>`)
    .join('');
  const actorLinks = actors.slice(0, 8)
    .map((actor) => `<a href="${SITE_URL}/search?q=${encodeURIComponent(actor)}&amp;role=actor">${escapeHtml(actor)}</a>`)
    .join(', ');
  const directorLinks = directors.slice(0, 6)
    .map((director) => `<a href="${SITE_URL}/search?q=${encodeURIComponent(director)}&amp;role=director">${escapeHtml(director)}</a>`)
    .join(', ');
  const body = `${origin ? `<p>${escapeHtml(origin)}</p>` : ''}
    ${titleVariants.length ? `<p>Tên khác: ${titleVariants.map(escapeHtml).join(', ')}</p>` : ''}
    <img src="${escapeHtml(poster)}" alt="${escapeHtml(name)}">
    <p>${escapeHtml(isUpcoming ? 'Phim sắp chiếu' : isTrailerOnly ? 'Trailer và thông tin phim' : isOngoing ? 'Phim đang chiếu và cập nhật tập mới' : isFreshUpdate ? 'Phim mới cập nhật tập mới' : 'Xem phim online')}</p>
    ${releaseDateText ? `<p>Lịch chiếu dự kiến: ${escapeHtml(releaseDateText)}</p>` : ''}
    ${episodeText ? `<p>Trạng thái hiện tại: ${escapeHtml(episodeText)}</p>` : ''}
    ${isOngoing && totalEpisodeCount ? `<p>Tiến độ phát sóng: ${latestEpisodeNumber}/${totalEpisodeCount} tập (${episodeProgress}%).</p>` : ''}
    ${isOngoing && nextEpisodeText ? `<p>Tập tiếp theo dự kiến: ${escapeHtml(nextEpisodeText)}</p>` : ''}
    ${isOngoing ? `<p>Độ mới của cập nhật tập: ${freshnessScore}/100. <a href="${SITE_URL}/phim-dang-chieu">Xem các phim đang chiếu khác</a>.</p>` : ''}
    ${isFreshUpdate && modifiedText ? `<p>Ưu tiên cập nhật mới: ${escapeHtml(name)} ${episodeText ? `${escapeHtml(episodeText)} ` : ''}được làm mới lúc ${escapeHtml(modifiedText)}.</p>` : ''}
    ${actorLinks ? `<p>Diễn viên: ${actorLinks}</p>` : ''}
    ${directorLinks ? `<p>Đạo diễn: ${directorLinks}</p>` : ''}
    <p>${escapeHtml(description)}</p>
    ${trailerEmbedUrl ? `<section>
      <h2>Trailer ${escapeHtml(name)}</h2>
      <iframe
        src="${escapeHtml(trailerEmbedUrl)}"
        title="Trailer ${escapeHtml(name)}"
        width="960"
        height="540"
        loading="eager"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowfullscreen
      ></iframe>
    </section>` : ''}
    <nav>
      <a href="${escapeHtml(canonical)}">${escapeHtml(isUpcoming || isTrailerOnly ? `Xem trailer va thong tin ${name}` : `Xem phim ${name}`)}</a>
      <a href="${SITE_URL}/phim-moi-cap-nhat">Phim mới cập nhật</a>
      <a href="${SITE_URL}/phim-moi-nhat">Phim mới nhất</a>
      <a href="${SITE_URL}/phim-sap-chieu">Phim sắp chiếu</a>
      ${genreLinks}
      ${countryLinks}
    </nav>
    <section>
      <h2>Thông tin phim ${escapeHtml(name)}</h2>
      ${content ? `<p>${escapeHtml(content)}</p>` : '<p>Thông tin nội dung đang được biên tập và sẽ cập nhật khi có dữ liệu xác thực.</p>'}
      ${genres.length ? `<p>Thể loại: ${genres.map(escapeHtml).join(', ')}.</p>` : ''}
      ${countries.length ? `<p>Quốc gia: ${countries.map(escapeHtml).join(', ')}.</p>` : ''}
    </section>`;
  return new Response(renderHtml({
    title,
    description,
    canonical,
    h1: isUpcoming || isTrailerOnly ? `${name} - trailer và thông tin phim` : `Xem phim ${name}`,
    body,
    schema,
    ogType: 'video.movie',
    ogImage: poster,
    robots: isIndexable
      ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      : 'noindex, follow',
  }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': isOngoing
        ? 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800'
        : 'public, max-age=900, s-maxage=3600',
      'X-Prerendered': 'cloudflare-movie',
      'X-Robots-Tag': isIndexable
        ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        : 'noindex, follow',
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
  if (/^\/sitemap-movies-\d+\.xml$/.test(pathname)) {
    return new Response(request.method === 'HEAD' ? null : '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
      status: 410,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Sitemap-Retired': 'index-bloat-cleanup',
        ...SECURITY_HEADERS,
      },
    });
  }

  if (pathname === '/sitemap.xml' || isLegacySitemapAlias(pathname)) {
    const today = currentVietnamDate();
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
  <sitemap>
    <loc>${SITE_URL}/sitemap-movies-ongoing.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/feed.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
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
  const sitemapVersion = '20260723-ongoing-quality-v9';
  let target = `${SUPABASE_FUNCTION_BASE}/sitemap-index?v=${sitemapVersion}`;
  if (pathname === '/sitemap-movies.xml' || pathname === '/sitemap-movies-dynamic') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?recent=1&page_size=5000&v=${sitemapVersion}`;
  } else if (pathname === '/sitemap-movies-recent.xml') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?recent=1&page_size=2000&v=${sitemapVersion}`;
  } else if (pathname === '/sitemap-movies-upcoming.xml') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?upcoming=1&page_size=5000&v=${sitemapVersion}`;
  } else if (pathname === '/sitemap-movies-ongoing.xml') {
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?ongoing=1&page_size=5000&v=${sitemapVersion}`;
  } else if (pathname === '/feed.xml') {
    target = `${SUPABASE_FUNCTION_BASE}/movie-rss-feed?v=${sitemapVersion}`;
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

    const isOngoingSitemap = pathname === '/sitemap-movies-ongoing.xml';
    const response = await fetch(target, {
      headers: { 'Accept': 'application/xml', 'User-Agent': request.headers.get('user-agent') || 'KhoPhimBot/1.0' },
      cf: { cacheTtl: isOngoingSitemap ? 600 : 1800, cacheEverything: true },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Sitemap upstream ${response.status}`);
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/xml; charset=utf-8');
    headers.set(
      'Cache-Control',
      isOngoingSitemap
        ? 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800'
        : 'public, max-age=1800, s-maxage=3600',
    );
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
  // A short-lived failure marker acts as a POP-level circuit breaker. When
  // BLVietsub is down, every visitor should not trigger another slow upstream
  // request. Successful responses continue to use the normal content cache.
  const failureKey = new Request(`${SITE_URL}/__circuit/blvietsub/${encodeURIComponent(targetUrl.toString())}`, { method: 'GET' });
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
      const openCircuit = await caches.default.match(failureKey);
      if (openCircuit) {
        const headers = new Headers(openCircuit.headers);
        headers.set('X-KhoPhim-Circuit', 'OPEN');
        return new Response(openCircuit.body, { status: 503, headers });
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
      contextWaitUntil(context, caches.default.delete(failureKey));
    }
    return response;
  } catch (error) {
    const failureResponse = new Response(error instanceof Error ? error.message : 'BLVietsub proxy failed', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=30',
        'Retry-After': '30',
        'X-KhoPhim-Circuit': 'TRIPPED',
        ...SECURITY_HEADERS,
      },
    });
    if (!fresh && request.method === 'GET' && typeof caches !== 'undefined') {
      contextWaitUntil(context, caches.default.put(failureKey, failureResponse.clone()));
    }
    return failureResponse;
  }
}

async function proxyMovieDetail(request, context) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '').trim();
  const refresh = url.searchParams.get('refresh') === '1';
  if (!slug || slug.length > 240 || !/^[\p{L}\p{N}._~-]+$/u.test(slug)) {
    return new Response(JSON.stringify({ status: false, message: 'Invalid slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }

  const upstreamUrl = new URL(`${SUPABASE_FUNCTION_BASE}/movie-detail-proxy`);
  upstreamUrl.searchParams.set('slug', slug);
  if (refresh) upstreamUrl.searchParams.set('refresh', '1');
  const cacheKey = new Request(`${SITE_URL}/__api-cache/movie-detail/${encodeURIComponent(slug)}?rev=canonical-v3`, { method: 'GET' });
  const failureKey = new Request(`${SITE_URL}/__circuit/movie-detail/${encodeURIComponent(slug)}`, { method: 'GET' });

  try {
    if (!refresh && request.method === 'GET' && typeof caches !== 'undefined') {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-KhoPhim-Detail-Cache', 'HIT');
        return new Response(cached.body, { status: cached.status, headers });
      }
      const openCircuit = await caches.default.match(failureKey);
      if (openCircuit) {
        const headers = new Headers(openCircuit.headers);
        headers.set('X-KhoPhim-Circuit', 'OPEN');
        return new Response(openCircuit.body, { status: 503, headers });
      }
    }

    const upstream = await fetch(upstreamUrl.toString(), {
      headers: { Accept: 'application/json' },
      cf: refresh ? undefined : { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(10000),
    });
    const headers = new Headers(upstream.headers);
    headers.delete('Set-Cookie');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', refresh ? 'no-store' : 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800, stale-if-error=86400');
    headers.set('X-KhoPhim-Detail-Cache', refresh ? 'REFRESH' : 'MISS');
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    const response = new Response(upstream.body, { status: upstream.status, headers });
    if (!refresh && request.method === 'GET' && upstream.ok && typeof caches !== 'undefined') {
      contextWaitUntil(context, caches.default.put(cacheKey, response.clone()));
      contextWaitUntil(context, caches.default.delete(failureKey));
    }
    return response;
  } catch (error) {
    const failureResponse = new Response(JSON.stringify({ status: false, message: error instanceof Error ? error.message : 'Detail unavailable' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=15',
        'Retry-After': '15',
        'X-KhoPhim-Circuit': 'TRIPPED',
        ...SECURITY_HEADERS,
      },
    });
    if (!refresh && request.method === 'GET' && typeof caches !== 'undefined') {
      contextWaitUntil(context, caches.default.put(failureKey, failureResponse.clone()));
    }
    return failureResponse;
  }
}

async function proxySearch(request, context) {
  const url = new URL(request.url);
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 120);
  const parsedLimit = Number(url.searchParams.get('limit') || 16);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 16, 1), 50);
  if (query.length < 2) {
    return new Response(JSON.stringify({ status: true, items: [], query, count: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }

  const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const cacheKey = new Request(`${SITE_URL}/__api-cache/search/v9/${limit}/${encodeURIComponent(normalizedQuery)}`, { method: 'GET' });
  if (request.method === 'GET' && typeof caches !== 'undefined') {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-KhoPhim-Search-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  const fetchSearchRpc = (timeoutMs) => fetch(`${SUPABASE_REST_BASE}/rpc/search_movies_fast`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
    },
    body: JSON.stringify({ search_query: query, result_limit: limit }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  try {
    // Call PostgREST directly to avoid a second serverless cold start. The
    // response is still cached at the Cloudflare POP below.
    let attempt = 1;
    let upstream;
    try {
      upstream = await fetchSearchRpc(3500);
    } catch {
      // Supabase/PostgREST occasionally stalls on the first pooled connection.
      // One bounded retry is faster and safer than returning an empty search.
      attempt = 2;
      upstream = await fetchSearchRpc(2500);
    }
    const upstreamPayload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      throw new Error(upstreamPayload?.message || `Search RPC returned ${upstream.status}`);
    }
    const items = Array.isArray(upstreamPayload) ? upstreamPayload : [];
    const headers = new Headers(upstream.headers);
    headers.delete('Set-Cookie');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=120, s-maxage=900, stale-while-revalidate=3600, stale-if-error=86400');
    headers.set('X-KhoPhim-Search-Cache', 'MISS');
    headers.set('X-KhoPhim-Search-Attempt', String(attempt));
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    const response = new Response(JSON.stringify({ status: true, query, count: items.length, items }), { status: 200, headers });
    if (upstream.ok && request.method === 'GET' && typeof caches !== 'undefined') {
      contextWaitUntil(context, caches.default.put(cacheKey, response.clone()));
    }
    return response;
  } catch (error) {
    return new Response(JSON.stringify({ status: false, items: [], message: error instanceof Error ? error.message : 'Search unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }
}

function isAllowedSsplayResolveUrl(target) {
  try {
    const parsed = new URL(target);
    return /(^|\.)ssplay\.net$/i.test(parsed.hostname) && /^\/v\/[^/]+\.html$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function resolveSsplayEmbed(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url') || '';
  if (!isAllowedSsplayResolveUrl(target)) {
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
  targetUrl.searchParams.set('s', 'HY');
  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 KhoPhim-Player/1.0',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Referer': 'https://khophim.org/',
      },
      cf: { cacheTtl: 900, cacheEverything: true },
      signal: AbortSignal.timeout(12000),
    });
    if (upstream.ok) {
      const html = await upstream.text();
      const iframeSrc = /<iframe[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]?.replace(/&amp;/g, '&').trim();
      if (iframeSrc) {
        const resolved = new URL(iframeSrc, targetUrl);
        if (/^(https?:)$/i.test(resolved.protocol)) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: resolved.toString(),
              'Cache-Control': 'public, max-age=300, s-maxage=900',
              'X-Ssplay-Resolve': 'HY-iframe',
            },
          });
        }
      }
    }
  } catch {
    // Fall back to the HY page below.
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: targetUrl.toString(),
      'Cache-Control': 'public, max-age=120, s-maxage=300',
      'X-Ssplay-Resolve': 'HY-fallback',
    },
  });
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

const DMCA_REMOVED_MOVIE_SLUGS = new Set([
  'deadpool-va-wolverine',
]);

function removedForCopyrightResponse() {
  return new Response(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Noi dung da duoc go bo | KhoPhim</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080a10;color:#fff;font-family:Arial,sans-serif;padding:24px;text-align:center">
  <main style="max-width:520px">
    <h1 style="font-size:24px;margin:0 0 12px">Noi dung da duoc go bo</h1>
    <p style="color:rgba(255,255,255,.72);line-height:1.6;margin:0">Trang nay da bi vo hieu hoa quyen truy cap theo yeu cau ban quyen hop le.</p>
    <p style="margin-top:18px"><a href="/" style="color:#f87171;font-weight:700">Ve trang chu KhoPhim</a></p>
  </main>
</body>
</html>`, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
      ...SECURITY_HEADERS,
    },
  });
}

function blockedCrawlerResponse() {
  return new Response('Crawler access limited', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'X-Robots-Tag': 'noindex, nofollow',
      ...SECURITY_HEADERS,
    },
  });
}

function isDmcaRemovedPath(pathname) {
  const movieMatch = /^\/phim\/([^/?#]+)/.exec(pathname);
  return Boolean(movieMatch && DMCA_REMOVED_MOVIE_SLUGS.has(decodeURIComponent(movieMatch[1]).toLowerCase()));
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (url.hostname === 'mhophim.com' || url.hostname === 'www.mhophim.com') {
    return handleMhophimRequest(context, url, pathname);
  }

  if (/^\/mhophim(?:\/|$)/i.test(pathname) || /^\/mhophim-assets\//i.test(pathname)) {
    return canonicalRedirect(url, '/');
  }

  if (url.hostname === 'www.khophim.org' || url.protocol === 'http:') {
    return canonicalRedirect(url, pathname);
  }

  if (isDmcaRemovedPath(pathname)) {
    return removedForCopyrightResponse();
  }

  if (isBlockedCrawler(request.headers.get('user-agent') || '')) {
    return blockedCrawlerResponse();
  }

  if (pathname === '/filter') {
    const countryCanonical = new Map([
      ['viet-nam', '/phim-viet-nam'],
      ['han-quoc', '/phim-han-quoc'],
      ['trung-quoc', '/phim-trung-quoc'],
      ['nhat-ban', '/phim-nhat-ban'],
      ['thai-lan', '/phim-thai-lan'],
      ['au-my', '/phim-au-my'],
    ]).get(String(url.searchParams.get('country') || '').toLowerCase());
    const onlyCountryFilter = countryCanonical && [...url.searchParams.keys()].every((key) => key === 'country');
    if (onlyCountryFilter) {
      url.search = '';
      return canonicalRedirect(url, countryCanonical);
    }
  }

  if (
    pathname === '/sitemap.xml' ||
    isLegacySitemapAlias(pathname) ||
    pathname === '/sitemap-movies.xml' ||
    pathname === '/sitemap-movies-dynamic' ||
    pathname === '/sitemap-movies-recent.xml' ||
    pathname === '/sitemap-movies-upcoming.xml' ||
    pathname === '/sitemap-movies-ongoing.xml' ||
    pathname === '/feed.xml' ||
    /^\/sitemap-movies-\d+\.xml$/.test(pathname)
  ) {
    const sitemapResponse = await proxySitemap(pathname, request, context);
    if (sitemapResponse) return sitemapResponse;
  }

  if (pathname === '/internal/blvietsub-proxy') {
    return proxyBlvietsub(request, context);
  }

  if (pathname === '/api/movie-detail') {
    return proxyMovieDetail(request, context);
  }

  if (pathname === '/api/search') {
    return proxySearch(request, context);
  }

  if (pathname === '/internal/ssplay-resolve') {
    return resolveSsplayEmbed(request);
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
      let movie = await fetchSupabaseMovie(slug);
      if (shouldPreferOphimMovieName(movie, slug)) {
        const ophimMovie = await fetchOphimMovie(slug);
        movie = mergeMovieForPrerender(movie, ophimMovie);
      }
      if (!movie) movie = await fetchOphimMovie(slug);
      const movieResponse = movie
        ? renderMoviePrerender(pathname, movie, slug)
        : renderMovieNotFound(pathname, slug);
      putCachedPrerender(context, cacheKey, movieResponse, request);
      return movieResponse;
    }
    const staticResponse = renderStaticPrerender(pathname);
    if (staticResponse) return staticResponse;
  }

  if (pathname === '/') {
    const response = await context.next();
    return withHeaders(response, pathname);
  }

  return serveSpaIndex(context, request, pathname);
}





