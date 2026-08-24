const SITE_URL = 'https://khophim.org';
const MHOPHIM_URL = 'https://mhophim.com';
const IMG_BASE = 'https://img.ophim.live/uploads/movies/';
const SUPABASE_FUNCTION_BASE = 'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1';
const SUPABASE_REST_BASE = 'https://ceoxbhsdodllziyxmbqr.supabase.co/rest/v1';
// This is Supabase's public browser key (RLS still applies), not a service key.
const SUPABASE_PUBLIC_KEY = 'sb_publishable_Juh45t-R83dfgJI0O4_PQw_iYYoU-yh';
// Single production kill switch. Keep APIs/internal provider bridges online so
// the overnight source rebuild can continue while public pages return 503.
const MAINTENANCE_MODE = false;
const SEO_PRERENDER_VERSION = '20260820-cohort-parity-v24';
const CONSOLIDATED_SEO_PATHS = new Map([
  ['/xem-phim', '/xem-phim-online'],
  ['/xem-phim-mien-phi', '/xem-phim-online'],
  ['/xem-phim-hd', '/xem-phim-online'],
  ['/web-xem-phim', '/xem-phim-online'],
  ['/kho-phim-online', '/xem-phim-online'],
  ['/xem-phim-vietsub', '/phim-vietsub'],
  ['/xem-phim-moi', '/phim-moi-cap-nhat'],
  ['/xem-phim-le', '/phim-le'],
  ['/xem-phim-bo', '/phim-bo'],
  ['/xem-phim-chieu-rap', '/phim-chieu-rap'],
  ['/xem-phim-viet-nam', '/phim-viet-nam'],
  ['/xem-phim-han-quoc', '/phim-han-quoc'],
  ['/xem-phim-trung-quoc', '/phim-trung-quoc'],
  ['/xem-phim-au-my', '/phim-au-my'],
  ['/xem-anime-vietsub', '/anime'],
  ['/the-loai/hoat-hinh', '/hoat-hinh'],
  ['/the-loai/phim-viet-nam', '/phim-viet-nam'],
]);

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://kit.fontawesome.com https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests; worker-src 'self' blob:; manifest-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), autoplay=(), payment=(), usb=()',
};

function shouldShowMaintenance(request, pathname) {
  if (!MAINTENANCE_MODE || (request.method !== 'GET' && request.method !== 'HEAD')) return false;
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/internal/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/images/') ||
    pathname === '/robots.txt' ||
    pathname === '/release.json' ||
    pathname === '/service-worker.js' ||
    pathname === '/home-fallback.json' ||
    pathname === '/queer-fallback.json' ||
    pathname === '/feed.xml' ||
    pathname.startsWith('/sitemap')
  ) return false;

  const destination = String(request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const accept = String(request.headers.get('accept') || '').toLowerCase();
  return destination === 'document' || accept.includes('text/html');
}

function maintenanceResponse(request) {
  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta http-equiv="refresh" content="300">
  <title>KhoPhim đang bảo trì</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 20%,#182640 0,#090d16 44%,#05070c 100%);color:#f8fafc}
    main{width:min(620px,100%);padding:44px 28px;text-align:center;border:1px solid rgba(255,255,255,.1);border-radius:28px;background:rgba(11,16,27,.82);box-shadow:0 32px 90px rgba(0,0,0,.45);backdrop-filter:blur(18px)}
    .mark{width:76px;height:76px;margin:0 auto 24px;display:grid;place-items:center;border-radius:22px;background:linear-gradient(145deg,#ff6b35,#e2314b);box-shadow:0 16px 44px rgba(226,49,75,.28)}
    svg{width:40px;height:40px}h1{margin:0;font-size:clamp(28px,6vw,44px);line-height:1.12;letter-spacing:-.03em}p{margin:18px auto 0;max-width:510px;color:#bac4d5;font-size:clamp(16px,3vw,19px);line-height:1.65}
    .status{display:inline-flex;align-items:center;gap:9px;margin-top:28px;padding:10px 16px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.05);color:#e4e9f2;font-size:14px}
    .dot{width:8px;height:8px;border-radius:50%;background:#ffb547;box-shadow:0 0 0 6px rgba(255,181,71,.12);animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{50%{opacity:.45;transform:scale(.8)}}
    small{display:block;margin-top:22px;color:#778398;font-size:13px}
  </style>
</head>
<body>
  <main role="main" aria-labelledby="maintenance-title">
    <div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L19 15.4a2.1 2.1 0 1 1-3 3L9.4 11.7a4 4 0 0 0-5 5L6.7 14 9 16.4l-2.3 2.3a4 4 0 0 0 5-5"/></svg></div>
    <h1 id="maintenance-title">Hệ thống đang bảo trì</h1>
    <p>KhoPhim đang nâng cấp hệ thống nguồn phát để mang lại trải nghiệm xem phim nhanh và ổn định hơn. Vui lòng quay lại sau.</p>
    <div class="status"><span class="dot"></span><span>Đang nâng cấp trong đêm nay</span></div>
    <small>Trang sẽ tự động kiểm tra lại sau mỗi 5 phút.</small>
  </main>
</body>
</html>`;

  return new Response(request.method === 'HEAD' ? null : html, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Retry-After': '1800',
      'X-KhoPhim-Maintenance': 'active',
      ...SECURITY_HEADERS,
    },
  });
}

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

  if (/^\/(?:the-loai|quoc-gia|danh-sach)(?:\/|$)/i.test(pathname)
    || /^\/(?:xem-phim(?:-online|-mien-phi|-hd|-vietsub)?|web-xem-phim|kho-phim-online|phim-(?:moi-nhat|moi-cap-nhat|dang-chieu|bo|le|chieu-rap|vietsub|han-quoc|trung-quoc|nhat-ban|thai-lan|au-my|viet-nam)|anime|tv-shows|vu-tru-dam-my)\/?$/i.test(pathname)) {
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
  /^\/xem-phim\/[^/]+(?:\/.*)?$/,
  /^\/filter(?:\/|$)/,
  /^\/yeu-thich/,
  /^\/login/,
  /^\/dang-ky/,
  /^\/register/,
  /^\/forgot-password/,
  /^\/reset-password/,
  /^\/dien-vien(?:\/|$)/,
  /^\/blog\/[^/]+\/?$/,
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

function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function movieRouteSchema(movie, canonical, title, description, image) {
  if (!movie) return [];
  const name = String(movie.name || '').trim();
  const origin = String(movie.origin_name || '').trim();
  const year = Number(movie.year || 0);
  const genres = taxonomyNames(movie.category);
  const countries = taxonomyNames(movie.country);
  const actors = personNames(movie.actor, 12);
  const directors = personNames(movie.director, 8);
  return [
    {
      '@context': 'https://schema.org',
      '@type': String(movie.type || '') === 'series' ? 'TVSeries' : 'Movie',
      '@id': `${canonical}#movie`,
      name,
      alternateName: origin || undefined,
      url: canonical,
      image: image || undefined,
      description,
      datePublished: year ? `${year}-01-01` : undefined,
      genre: genres,
      countryOfOrigin: countries.map((country) => ({ '@type': 'Country', name: country })),
      actor: actors.map((actor) => ({ '@type': 'Person', name: actor })),
      director: directors.map((director) => ({ '@type': 'Person', name: director })),
      inLanguage: String(movie.lang || 'vi'),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      primaryImageOfPage: image ? { '@type': 'ImageObject', url: image } : undefined,
      inLanguage: 'vi-VN',
    },
  ];
}

function movieDataSourceLabel(movie) {
  const sourceText = `${movie?.source_site || ''} ${movie?.source_name || ''}`.toLowerCase();
  if (sourceText.includes('phimapi') || sourceText.includes('kkphim')) return 'KKPhim';
  if (sourceText.includes('ophim')) return 'nguồn đã ngừng';
  if (sourceText.includes('blvietsub')) return 'BLVietsub';
  if (sourceText.includes('glvietsub')) return 'GLVietsub';
  if (sourceText.includes('tmdb')) return 'TMDB';
  if (sourceText.includes('merged')) return 'các nguồn đã đối chiếu';
  return String(movie?.source_name || movie?.source_site || 'nguồn dữ liệu hiện có');
}

async function spaRouteMeta(context, pathname) {
  const cleanPath = getCanonicalPath(pathname);
  const watchMatch = /^\/xem-phim\/([^/?#]+)/i.exec(cleanPath);
  const movieMatch = /^\/phim\/([^/?#]+)/i.exec(cleanPath);
  if (watchMatch || movieMatch) {
    const slug = decodeURIComponent((watchMatch || movieMatch)[1]);
    const lookup = await fetchSupabaseMovie(slug, context).catch(() => ({ movie: null }));
    const movie = lookup?.movie || null;
    const name = String(movie?.name || titleCaseFromSlug(slug)).trim();
    const origin = String(movie?.origin_name || '').trim();
    const year = Number(movie?.year || 0);
    const image = movie ? getImageUrl(movie.poster_url || movie.thumb_url || '') : '';
    const synopsis = stripHtml(movie?.content || '');
    const detailCanonical = `${SITE_URL}/phim/${encodeURIComponent(String(movie?.slug || slug))}`;
    const title = watchMatch
      ? `Xem ${name}${year ? ` (${year})` : ''} | KhoPhim`
      : `${name}${year ? ` (${year})` : ''} - Thông Tin Phim | KhoPhim`;
    const description = compactMeta([
      watchMatch ? `Trang xem ${name}${origin ? ` (${origin})` : ''}.` : `Thông tin phim ${name}${origin ? ` (${origin})` : ''}.`,
      synopsis,
      movie?.episode_current ? `Trạng thái: ${movie.episode_current}.` : '',
    ].filter(Boolean).join(' '), 155);
    const indexable = !watchMatch && isHighValueIndexCandidate(movie);
    return {
      title,
      description,
      canonical: watchMatch ? detailCanonical : detailCanonical,
      robots: indexable
        ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        : 'noindex, follow',
      image,
      schema: watchMatch ? [] : movieRouteSchema(movie, detailCanonical, title, description, image),
    };
  }

  const staticMeta = CLEAN_STATIC_META[cleanPath] || dynamicStaticMeta(cleanPath);
  if (!staticMeta) return null;
  const canonical = `${SITE_URL}${cleanPath}`;
  return {
    title: staticMeta.title,
    description: staticMeta.description,
    canonical,
    robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    image: `${SITE_URL}/og-image.jpg`,
    schema: [{
      '@context': 'https://schema.org',
      '@type': staticMeta.pageType || 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: staticMeta.title,
      description: staticMeta.description,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      inLanguage: 'vi-VN',
    }],
  };
}

function rewriteSpaDocument(response, pathname, meta) {
  if (!meta || typeof HTMLRewriter === 'undefined' || !/text\/html/i.test(response.headers.get('Content-Type') || '')) {
    return withHeaders(response, pathname);
  }

  const setContent = (attribute, value) => ({ element(element) {
    if (value) element.setAttribute(attribute, value);
    else element.remove();
  } });
  let rewritten = new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(meta.title); } })
    .on('meta[name="description"]', setContent('content', meta.description))
    .on('meta[name="robots"]', setContent('content', meta.robots))
    .on('meta[name="googlebot"]', setContent('content', meta.robots))
    .on('link[rel="canonical"]', setContent('href', meta.canonical))
    .on('meta[property="og:title"]', setContent('content', meta.title))
    .on('meta[property="og:description"]', setContent('content', meta.description))
    .on('meta[property="og:url"]', setContent('content', meta.canonical))
    .on('meta[property="og:image"]', setContent('content', meta.image))
    .on('meta[name="twitter:title"]', setContent('content', meta.title))
    .on('meta[name="twitter:description"]', setContent('content', meta.description))
    .on('meta[name="twitter:image"]', setContent('content', meta.image));

  if (meta.image && pathname.startsWith('/phim/')) {
    rewritten = rewritten
      .on('link[rel="preload"][as="image"]', { element(element) { element.remove(); } })
      .on('head', { element(element) {
        element.append(`<link rel="preload" as="image" href="${escapeHtml(meta.image)}" fetchpriority="high" data-kp-route-preload="true">`, { html: true });
      } });
  }
  if (Array.isArray(meta.schema) && meta.schema.length) {
    rewritten = rewritten.on('head', { element(element) {
      element.append(`<script type="application/ld+json" data-kp-seo-managed="true" data-kp-route-schema="true">${inlineJson(meta.schema)}</script>`, { html: true });
    } });
  }
  return withHeaders(rewritten.transform(response), pathname);
}

async function serveSpaIndex(context, request, pathname) {
  const indexUrl = new URL(request.url);
  // Address the built document explicitly. The Pages asset binding does not
  // consistently resolve `/` to `index.html` when it is called from an
  // advanced-mode Worker for a rewritten deep link.
  indexUrl.pathname = '/index.html';
  indexUrl.search = '?__spa_fallback=1';

  if (context.env && context.env.ASSETS && typeof context.env.ASSETS.fetch === 'function') {
    const response = await context.env.ASSETS.fetch(new Request(indexUrl.toString(), {
      method: request.method,
      headers: request.headers,
    }));
    if (request.method === 'HEAD') return withHeaders(response, pathname);
    return rewriteSpaDocument(response, pathname, await spaRouteMeta(context, pathname));
  }

  // Pages Functions does not expose an ASSETS binding in every deployment
  // mode. Passing the rewritten request to next() is required; calling
  // next() without it serves the original deep path and returns 404 before
  // React Router can start.
  const response = await context.next(new Request(indexUrl.toString(), {
    method: request.method,
    headers: request.headers,
  }));
  if (request.method === 'HEAD') return withHeaders(response, pathname);
  return rewriteSpaDocument(response, pathname, await spaRouteMeta(context, pathname));
}

async function serveStaticAsset(context, pathname) {
  const response = await context.next();
  const contentType = String(response.headers.get('content-type') || '');
  if (response.status === 200 && /text\/html/i.test(contentType) && !/\.html?$/i.test(pathname)) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(null, { status: 404, headers });
  }
  const headers = new Headers(response.headers);
  if (/^\/assets\//i.test(pathname) && /-[A-Za-z0-9_-]{8,}(?:-[A-Za-z0-9_-]+)?\.(?:js|css)$/i.test(pathname)) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
  // A stale SPA document can reference hashed chunks removed by the next Pages
  // deployment. HTML is tiny and the edge is fast, so always revalidate the
  // document; hashed assets keep their immutable one-year cache below.
  if (/text\/html/i.test(contentType)) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  } else if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  if (isNoIndexPath(pathname)) {
    headers.set('X-Robots-Tag', /^\/xem-phim\/[^/]+/i.test(pathname) ? 'noindex, follow' : 'noindex, nofollow');
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

function isHighValueIndexCandidate(movie) {
  if (!movie || movie.seo_eligible_for_index !== true) return false;
  const tier = String(movie.seo_index_tier || '');
  if (!['playable', 'ongoing', 'upcoming'].includes(tier)) return false;
  if (Number(movie.seo_quality_score || 0) < 85) return false;

  const name = String(movie.name || '').trim();
  const originName = String(movie.origin_name || movie.title_original || '').trim();
  const content = stripHtml(movie.content || '');
  const image = String(movie.poster_url || movie.thumb_url || '').trim();
  const year = Number(movie.year || 0);
  const tmdbId = Number(movie.tmdb_id || 0);
  const currentYear = new Date().getUTCFullYear();
  const actors = personNames(movie.actor, 1);
  const genres = taxonomyItems(movie.category);
  const countries = taxonomyItems(movie.country);
  const hasBrokenText = /(?:Ã[^\s<]|Ä[^\s<]|Æ[^\s<]|áº|á»|â€|Â[\u0080-\u00bf])/.test(`${name} ${originName} ${content}`);

  if (name.length < 2 || originName.length < 2 || content.length < 160 || !image) return false;
  if (year < 1888 || year > currentYear + 2 || tmdbId <= 0 || hasBrokenText) return false;
  if (!actors.length || !genres.length || !countries.length) return false;
  if (tier === 'upcoming') return Boolean(getTrailerEmbedUrl(movie.trailer_url));
  return hasPlayableMovieEvidence(movie);
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
  if (ep === 'trailer' || ep.includes('trailer')) return true;
  return !hasPlayableMovieEvidence(movie) && Boolean(movie.trailer_url);
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

const GENRE_DISPLAY_NAMES = {
  'hanh-dong': 'Hành Động',
  'tinh-cam': 'Tình Cảm',
  'hai-huoc': 'Hài Hước',
  'co-trang': 'Cổ Trang',
  'tam-ly': 'Tâm Lý',
  'kinh-di': 'Kinh Dị',
  'vien-tuong': 'Viễn Tưởng',
  'phieu-luu': 'Phiêu Lưu',
  'chien-tranh': 'Chiến Tranh',
  'hinh-su': 'Hình Sự',
  'hoat-hinh': 'Hoạt Hình',
  'gia-dinh': 'Gia Đình',
  'lich-su': 'Lịch Sử',
  'bi-an': 'Bí Ẩn',
  'vo-thuat': 'Võ Thuật',
  'than-thoai': 'Thần Thoại',
  'hoc-duong': 'Học Đường',
  'am-nhac': 'Âm Nhạc',
  'kinh-dien': 'Kinh Điển',
  'tai-lieu': 'Tài Liệu',
  'the-thao': 'Thể Thao',
  'khoa-hoc': 'Khoa Học',
  'chinh-kich': 'Chính Kịch',
};

function genreDisplayName(slug) {
  return GENRE_DISPLAY_NAMES[String(slug || '').toLowerCase()] || titleCaseFromSlug(slug);
}

function dynamicStaticMeta(cleanPath) {
  if (cleanPath.startsWith('/the-loai/')) {
    const slug = cleanPath.split('/').pop();
    if (!GENRE_DISPLAY_NAMES[slug]) return null;
    const name = genreDisplayName(slug);
    return {
      title: `Phim ${name} Vietsub HD | KhoPhim`,
      description: `Xem phim ${name} Vietsub HD trên KhoPhim. Danh sách được lọc đúng thể loại, cập nhật theo tập và thời gian mới nhất để người xem chọn phim dễ hơn.`,
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
      'Danh mục phim chiếu rạp dành cho người muốn chọn nhanh một bộ phim điện ảnh để xem trọn vẹn, từ bom tấn Hollywood đến phim rạp Việt Nam, Hàn Quốc và Trung Quốc.',
      'Mỗi phim hiển thị năm phát hành và trạng thái nguồn xem để người xem phân biệt phim đã có bản đầy đủ với phim mới chỉ có trailer hoặc lịch chiếu.',
    ],
    highlights: [
      'Có phim hành động, kinh dị, hoạt hình, tình cảm và các phim điện ảnh mới cập nhật.',
      'Trạng thái phim giúp tránh nhầm trailer hoặc phim sắp chiếu với bản có thể xem ngay.',
      'Có lối chuyển nhanh sang phim lẻ, phim Việt Nam và phim Âu Mỹ khi muốn xem thêm.',
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
      'Trang phim thịnh hành 2026 sử dụng dữ liệu phim thực tế của KhoPhim, ưu tiên độ phổ biến, thời điểm cập nhật và trạng thái tập mới thay vì danh sách viết tay.',
      'Cụm này giúp KhoPhim bắt tín hiệu trend theo năm, trong khi các trang danh mục vẫn giữ vai trò phân loại theo quốc gia và thể loại.',
    ],
    highlights: [
      'Giúp người xem khám phá phim thịnh hành 2026, phim mới cập nhật và phim đang có tập xem.',
      'Liên kết đến phim mới nhất, phim chiếu rạp, phim sắp chiếu và trailer để theo sát vòng đời tìm kiếm.',
      'Nội dung server-side giúp Google đọc được chủ đề trend trước khi app tải dữ liệu động.',
    ],
    faq: [
      ['Danh sách phim thịnh hành 2026 được chọn thế nào?', 'KhoPhim ưu tiên dữ liệu độ phổ biến, độ mới của lần cập nhật và trạng thái có tập xem; danh sách được làm mới tự động.'],
      ['Có nên tách phim hot 2026 khỏi trang chủ không?', 'Có, vì truy vấn theo năm có ý định riêng và cần landing page riêng để không làm loãng trang chủ.'],
    ],
  },
  '/phim-le': {
    intro: [
      'Danh mục phim lẻ dành cho người muốn chọn một câu chuyện hoàn chỉnh để xem ngay, không cần theo dõi nhiều tập như phim bộ.',
      'Kho phim gồm hành động, tình cảm, kinh dị, hài, viễn tưởng và hoạt hình; mỗi tựa phim có năm phát hành cùng trạng thái nguồn xem để dễ lựa chọn.',
    ],
    highlights: [
      'Ưu tiên phim có nguồn xem và thông tin tập hoặc chất lượng rõ ràng.',
      'Có thể chuyển sang phim chiếu rạp, phim Âu Mỹ hoặc phim Việt Nam theo sở thích.',
      'Danh sách phim nổi bật được làm mới để người xem tìm phim mới mà không phải duyệt toàn bộ thư viện.',
    ],
    faq: [
      ['Xem phim lẻ hay ở đâu?', 'KhoPhim có trang /phim-le dành cho phim lẻ Vietsub HD, phim điện ảnh và phim mới cập nhật.'],
      ['Phim lẻ khác phim chiếu rạp thế nào?', 'Phim lẻ là phim có nội dung hoàn chỉnh trong một phần; phim chiếu rạp là nhóm phim từng được phát hành tại rạp. Một phim có thể thuộc cả hai nhóm.'],
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
      'Người xem có thể dựa vào năm phát hành và trạng thái tập để phân biệt phim mới ra, phim đang cập nhật và phim đã hoàn tất.',
    ],
    highlights: [
      'Có phim cổ trang, tiên hiệp, kiếm hiệp, ngôn tình, hiện đại và hành động.',
      'Danh sách ưu tiên những phim có tập mới hoặc nguồn xem rõ ràng.',
      'Có lối chuyển nhanh sang phim bộ, phim cổ trang và phim đang chiếu.',
    ],
    faq: [
      ['Xem phim Trung Quốc cổ trang ở đâu?', 'KhoPhim có trang /phim-trung-quoc và các trang thể loại liên quan để người xem tìm phim cổ trang, tiên hiệp, kiếm hiệp và ngôn tình.'],
      ['Làm sao biết phim đã đủ tập?', 'Trạng thái tập được hiển thị cạnh tên phim. Phim đã hoàn tất có thể xem liên tục, còn phim đang chiếu sẽ tiếp tục được cập nhật khi có tập mới.'],
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
  const fallback = {
    intro: ['Trang này giúp người xem khám phá nhanh các phim phù hợp theo chủ đề, quốc gia, thể loại hoặc trạng thái phát hành.'],
    highlights: ['Danh sách phim được cập nhật thường xuyên.', 'Có liên kết tới các danh mục phim liên quan.', 'Có thể tìm phim theo tên, thể loại và quốc gia.'],
    faq: [['Trang này dùng để làm gì?', 'Trang giúp người xem tìm đúng nhóm phim và chuyển nhanh tới nội dung muốn xem.']],
  };
  const genreMatch = /^\/the-loai\/([a-z0-9-]+)$/.exec(cleanPath);
  const genreName = genreMatch ? genreDisplayName(genreMatch[1]) : '';
  const genreTopic = genreMatch ? {
    intro: [
      `Danh mục này chỉ hiển thị các phim được gắn thể loại ${genreName} trong dữ liệu KhoPhim, thay vì dùng chung một danh sách phim thịnh hành cho mọi thể loại.`,
      `Mỗi phim dẫn tới trang thông tin riêng để người xem kiểm tra năm phát hành, trạng thái tập và các nguồn xem hiện có trước khi chọn.`,
    ],
    highlights: [
      `Phim ${genreName} mới cập nhật được xếp trước để người xem dễ tìm nội dung còn hoạt động.`,
      'Danh sách có phân trang và liên kết trực tiếp tới từng phim.',
      'Các thể loại và nhóm phim liên quan luôn có đường dẫn rõ ràng để tiếp tục khám phá.',
    ],
    faq: [
      [`Danh sách phim ${genreName} được lấy từ đâu?`, `Danh sách được lọc từ các phim đã xuất bản và có nhãn thể loại ${genreName} trong kho dữ liệu hiện tại.`],
      [`Làm sao biết phim ${genreName} đã có tập mới?`, 'Mở trang phim để xem trạng thái tập, năm phát hành và nguồn xem đang có; danh sách được sắp theo thời gian cập nhật gần nhất.'],
    ],
  } : null;
  const topic = STATIC_TOPIC_CONTENT[cleanPath] || genreTopic || fallback;
  const isSearchEngineCopy = (text) => /(?:\bSEO\b|\bGoogle(?:bot)?\b|topical authority|canonical|công cụ tìm kiếm|cụm từ khóa|từ khóa không dấu|tăng tín hiệu|ưu tiên crawl|sitemap|landing page|metadata|server-side|ý định tìm kiếm|\btruy vấn\b|\btối ưu\b)/i.test(String(text || ''));
  const intro = (topic.intro || []).filter((text) => !isSearchEngineCopy(text));
  const highlights = (topic.highlights || []).filter((text) => !isSearchEngineCopy(text));
  const faq = (topic.faq || []).filter(([question, answer]) => !isSearchEngineCopy(question) && !isSearchEngineCopy(answer));
  return {
    intro: intro.length ? intro : fallback.intro,
    highlights: highlights.length ? highlights : fallback.highlights,
    faq: faq.length ? faq : fallback.faq,
  };
}

const STATIC_MOVIE_SECTIONS = {
  '/': ['trending', 'onlyflix-moi'],
  '/phim-moi-cap-nhat': ['trending'],
  '/phim-moi-nhat': ['trending'],
  '/phim-hot-2026': ['trending'],
  '/phim-le': ['phim-le'],
  '/phim-bo': ['phim-bo'],
  '/tv-shows': ['phim-bo'],
  '/phim-chieu-rap': ['phim-chieu-rap'],
  '/hoat-hinh': ['hoat-hinh'],
  '/anime': ['hoat-hinh'],
  '/phim-han-quoc': ['han-quoc'],
  '/phim-trung-quoc': ['trung-quoc'],
  '/phim-thai-lan': ['thai-lan'],
  '/phim-au-my': ['au-my'],
};

const SEO_CATALOG_PAGE_SIZE = 24;
const SEO_MAX_INDEXABLE_PAGES = 25;
const SEO_CATALOG_FILTERS = {
  '/phim-moi-cap-nhat': { kind: 'recent' },
  '/phim-moi-nhat': { kind: 'recent' },
  '/phim-le': { kind: 'type', values: ['single', 'phim-le'] },
  '/phim-bo': { kind: 'type', values: ['series', 'phim-bo'] },
  '/tv-shows': { kind: 'type', values: ['tvshows', 'tv-shows'] },
  '/hoat-hinh': { kind: 'type', values: ['hoathinh'] },
  '/anime': { kind: 'type', values: ['hoathinh'] },
  '/phim-han-quoc': { kind: 'country', value: 'han-quoc' },
  '/phim-trung-quoc': { kind: 'country', value: 'trung-quoc' },
  '/phim-nhat-ban': { kind: 'country', value: 'nhat-ban' },
  '/phim-thai-lan': { kind: 'country', value: 'thai-lan' },
  '/phim-au-my': { kind: 'country', value: 'au-my' },
  '/phim-viet-nam': { kind: 'country', value: 'viet-nam' },
  '/phim-2026': { kind: 'year', value: '2026' },
  '/phim-2025': { kind: 'year', value: '2025' },
  '/phim-2024': { kind: 'year', value: '2024' },
  '/phim-4k': { kind: 'quality', value: '*4K*' },
};

function seoCatalogFilter(cleanPath) {
  const genreMatch = /^\/the-loai\/([a-z0-9-]+)$/.exec(cleanPath);
  if (genreMatch) return { kind: 'category', value: genreMatch[1] };
  return SEO_CATALOG_FILTERS[cleanPath] || null;
}

function parseContentRangeTotal(value) {
  const match = String(value || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function cleanSeoCatalogMovie(movie) {
  const slug = String(movie?.slug || '').trim();
  const name = String(movie?.name || '').trim();
  const episode = String(movie?.episode_current || '').trim();
  if (!slug || !name || /^(?:trailer|đang cập nhật|dang cap nhat)$/i.test(episode)) return null;
  return { slug, name, year: movie.year, episode };
}

async function fetchSupabaseSeoCatalog(context, cleanPath, page) {
  const filter = seoCatalogFilter(cleanPath);
  if (!filter) return null;

  const safePage = Math.max(1, Math.min(Number(page) || 1, 1000));
  const cacheKey = new Request(`${SITE_URL}/__seo-category-data/${SEO_PRERENDER_VERSION}${cleanPath}?page=${safePage}`);
  if (typeof caches !== 'undefined') {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached.json().catch(() => null);
  }

  const params = new URLSearchParams({
    select: 'slug,name,year,episode_current,category,country,type,quality,updated_at',
    is_published: 'eq.true',
    order: 'updated_at.desc.nullslast,slug.asc',
    limit: String(SEO_CATALOG_PAGE_SIZE),
    offset: String((safePage - 1) * SEO_CATALOG_PAGE_SIZE),
  });
  if (filter.kind === 'category') params.set('category', `cs.${JSON.stringify([{ slug: filter.value }])}`);
  if (filter.kind === 'country') params.set('country', `cs.${JSON.stringify([{ slug: filter.value }])}`);
  if (filter.kind === 'type') params.set('type', filter.values.length === 1 ? `eq.${filter.values[0]}` : `in.(${filter.values.join(',')})`);
  if (filter.kind === 'year') params.set('year', `eq.${filter.value}`);
  if (filter.kind === 'quality') params.set('quality', `ilike.${filter.value}`);

  const fetchImpl = typeof context?.env?.SEO_CATALOG_FETCH === 'function'
    ? context.env.SEO_CATALOG_FETCH
    : fetch;
  try {
    const response = await fetchImpl(`${SUPABASE_REST_BASE}/movies?${params}`, {
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
        Prefer: 'count=exact',
      },
      signal: AbortSignal.timeout(2200),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows)) return null;
    const movies = rows.map(cleanSeoCatalogMovie).filter(Boolean);
    const totalItems = parseContentRangeTotal(response.headers.get('Content-Range')) || movies.length;
    const result = {
      movies,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / SEO_CATALOG_PAGE_SIZE)),
      source: 'supabase-category',
    };
    if (typeof caches !== 'undefined') {
      const cachedResponse = new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800, stale-while-revalidate=86400' },
      });
      contextWaitUntil(context, caches.default.put(cacheKey, cachedResponse));
    }
    return result;
  } catch {
    return null;
  }
}

async function fetchStaticMovieLinks(context, cleanPath, page = 1) {
  const remoteCatalog = await fetchSupabaseSeoCatalog(context, cleanPath, page);
  if (remoteCatalog) return remoteCatalog;
  if (!context?.env?.ASSETS || typeof context.env.ASSETS.fetch !== 'function' || page > 1) {
    return { movies: [], totalItems: 0, totalPages: 1, source: 'unavailable' };
  }
  try {
    const response = await context.env.ASSETS.fetch(new Request(`${SITE_URL}/home-fallback.json`, {
      headers: { Accept: 'application/json' },
    }));
    if (!response.ok) return { movies: [], totalItems: 0, totalPages: 1, source: 'unavailable' };
    const payload = await response.json();
    const sections = payload && payload.sections && typeof payload.sections === 'object' ? payload.sections : {};
    const filter = seoCatalogFilter(cleanPath);
    const sectionKeys = STATIC_MOVIE_SECTIONS[cleanPath] || (filter ? [] : ['trending']);
    const candidates = sectionKeys.length
      ? sectionKeys.flatMap((sectionKey) => Array.isArray(sections[sectionKey]) ? sections[sectionKey] : [])
      : Object.values(sections).flatMap((items) => Array.isArray(items) ? items : []);
    const seen = new Set();
    const movies = [];
    for (const movie of candidates) {
        if (filter?.kind === 'category' && !taxonomyItems(movie?.category).some((item) => item.slug === filter.value)) continue;
        if (filter?.kind === 'country' && !taxonomyItems(movie?.country).some((item) => item.slug === filter.value)) continue;
        const slug = String(movie?.slug || '').trim();
        const name = String(movie?.name || '').trim();
        if (!slug || !name || seen.has(slug)) continue;
        seen.add(slug);
        movies.push({ slug, name, year: movie.year, episode: movie.episode_current });
        if (movies.length >= SEO_CATALOG_PAGE_SIZE) break;
    }
    return { movies, totalItems: movies.length, totalPages: 1, source: 'static-fallback' };
  } catch {
    return { movies: [], totalItems: 0, totalPages: 1, source: 'unavailable' };
  }
}

function relatedHomeSectionKeys(movie) {
  const categorySlugs = new Set(taxonomyItems(movie?.category).map((item) => item.slug));
  const countrySlugs = new Set(taxonomyItems(movie?.country).map((item) => item.slug));
  const keys = [];
  if (categorySlugs.has('hoat-hinh') || categorySlugs.has('anime')) keys.push('hoat-hinh');
  if (countrySlugs.has('han-quoc')) keys.push('han-quoc');
  if (countrySlugs.has('trung-quoc')) keys.push('trung-quoc');
  if (countrySlugs.has('thai-lan')) keys.push('thai-lan');
  if (countrySlugs.has('au-my')) keys.push('au-my');
  keys.push(String(movie?.type || '') === 'series' ? 'phim-bo' : 'phim-le', 'trending');
  return [...new Set(keys)];
}

async function fetchContextualMovieLinks(context, movie, currentSlug) {
  if (!context?.env?.ASSETS || typeof context.env.ASSETS.fetch !== 'function') return [];
  try {
    const response = await context.env.ASSETS.fetch(new Request(`${SITE_URL}/home-fallback.json`, {
      headers: { Accept: 'application/json' },
    }));
    if (!response.ok) return [];
    const payload = await response.json();
    const sections = payload && payload.sections && typeof payload.sections === 'object' ? payload.sections : {};
    const seen = new Set([String(currentSlug || '').trim()]);
    const related = [];
    for (const sectionKey of relatedHomeSectionKeys(movie)) {
      for (const candidate of Array.isArray(sections[sectionKey]) ? sections[sectionKey] : []) {
        const slug = String(candidate?.slug || '').trim();
        const name = String(candidate?.name || '').trim();
        if (!slug || !name || seen.has(slug)) continue;
        seen.add(slug);
        related.push({ slug, name, year: candidate.year, episode: candidate.episode_current });
        if (related.length >= 8) return related;
      }
    }
    return related;
  } catch {
    return [];
  }
}

function renderStaticMovieDiscovery(movies, meta) {
  if (!movies.length) return '';
  return `<section aria-labelledby="movie-discovery-heading">
      <h2 id="movie-discovery-heading">Danh sách ${escapeHtml(meta.h1)}</h2>
      <ul>
        ${movies.map((movie) => {
          const details = [movie.year, movie.episode].filter(Boolean).join(' · ');
          return `<li><a href="${SITE_URL}/phim/${encodeURIComponent(movie.slug)}">${escapeHtml(movie.name)}</a>${details ? ` <span>${escapeHtml(details)}</span>` : ''}</li>`;
        }).join('')}
      </ul>
    </section>`;
}

function renderStaticPagination(cleanPath, page, totalPages) {
  const boundedTotal = Math.min(Math.max(1, totalPages || 1), SEO_MAX_INDEXABLE_PAGES);
  if (boundedTotal <= 1) return '';
  const hrefFor = (target) => target > 1 ? `${SITE_URL}${cleanPath}?page=${target}` : `${SITE_URL}${cleanPath}`;
  const start = Math.max(1, page - 2);
  const end = Math.min(boundedTotal, page + 2);
  const links = [];
  if (page > 1) links.push(`<a rel="prev" href="${hrefFor(page - 1)}">Trang trước</a>`);
  for (let target = start; target <= end; target += 1) {
    links.push(target === page
      ? `<strong aria-current="page">Trang ${target}</strong>`
      : `<a href="${hrefFor(target)}">Trang ${target}</a>`);
  }
  if (page < boundedTotal) links.push(`<a rel="next" href="${hrefFor(page + 1)}">Trang sau</a>`);
  return `<nav aria-label="Phân trang danh mục phim">${links.join(' ')}</nav>`;
}

const RELATED_GENRE_SLUGS = {
  'hanh-dong': ['phieu-luu', 'hinh-su', 'vo-thuat', 'chien-tranh', 'vien-tuong'],
  'tinh-cam': ['tam-ly', 'gia-dinh', 'hoc-duong', 'co-trang', 'hai-huoc'],
  'hai-huoc': ['gia-dinh', 'tinh-cam', 'hoc-duong', 'phieu-luu'],
  'co-trang': ['lich-su', 'vo-thuat', 'than-thoai', 'tinh-cam'],
  'tam-ly': ['tinh-cam', 'bi-an', 'hinh-su', 'gia-dinh'],
  'kinh-di': ['bi-an', 'tam-ly', 'hinh-su', 'vien-tuong'],
  'vien-tuong': ['khoa-hoc', 'phieu-luu', 'hanh-dong', 'than-thoai'],
  'phieu-luu': ['hanh-dong', 'vien-tuong', 'gia-dinh', 'than-thoai'],
  'hinh-su': ['bi-an', 'hanh-dong', 'tam-ly', 'kinh-di'],
  'gia-dinh': ['hai-huoc', 'tinh-cam', 'hoc-duong', 'hoat-hinh'],
  'lich-su': ['co-trang', 'chien-tranh', 'tai-lieu', 'vo-thuat'],
  'bi-an': ['hinh-su', 'kinh-di', 'tam-ly', 'khoa-hoc'],
};

function relatedGenreLinks(cleanPath) {
  const slug = /^\/the-loai\/([a-z0-9-]+)$/.exec(cleanPath)?.[1];
  if (!slug) return [];
  const related = RELATED_GENRE_SLUGS[slug]
    || Object.keys(GENRE_DISPLAY_NAMES).filter((candidate) => candidate !== slug).slice(0, 4);
  return related.map((candidate) => [candidate === 'hoat-hinh' ? '/hoat-hinh' : `/the-loai/${candidate}`, `Phim ${genreDisplayName(candidate)}`]);
}

function renderTopicBody(cleanPath, meta, canonical, page = 1) {
  const topic = getTopicContent(cleanPath);
  if (page > 1) {
    return `<section><h2>${escapeHtml(meta.h1)}</h2><p>Trang ${page} tiếp tục danh sách phim đúng chủ đề; mỗi mục dẫn tới trang phim riêng với thông tin tập và nguồn xem hiện có.</p></section>`;
  }
  const isFreshHub = cleanPath === '/phim-moi-nhat' || cleanPath === '/phim-moi-cap-nhat';
  const relatedLinks = [
    ...relatedGenreLinks(cleanPath),
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
    ['/kho-phim', 'Toàn bộ kho phim'],
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
      <p>KhoPhim ưu tiên hiển thị phim vừa ra tập, phim mới thêm nguồn xem và phim có cập nhật gần nhất để người xem tìm nội dung mới nhanh hơn.</p>
      <ul>
        <li>Trạng thái tập mới được ghi rõ ngay trên danh sách phim.</li>
        <li>Phim mới cập nhật được tách riêng để người xem không phải tìm lại toàn bộ thư viện.</li>
        <li>Các danh mục liên quan giúp chuyển nhanh giữa phim mới, phim đang chiếu và phim theo thể loại.</li>
      </ul>
    </section>` : ''}
    <section>
      <h2>Câu hỏi thường gặp</h2>
      ${topic.faq.map(([question, answer]) => `<article><h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p></article>`).join('')}
    </section>
    <nav aria-label="Danh mục phim liên quan">
      ${relatedLinks.map(([href, label]) => `<a href="${SITE_URL}${href}">${escapeHtml(label)}</a>`).join('')}
      <a href="${escapeHtml(canonical)}">${escapeHtml(meta.h1)}</a>
    </nav>`;
}

async function renderStaticPrerender(request, context) {
  const url = new URL(request.url);
  const cleanPath = getCanonicalPath(url.pathname);
  const baseMeta = CLEAN_STATIC_META[cleanPath] || dynamicStaticMeta(cleanPath);
  if (!baseMeta) return null;

  const onlyPageParam = [...url.searchParams.keys()].every((key) => key === 'page');
  const requestedPage = onlyPageParam ? Number(url.searchParams.get('page') || 1) : 1;
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const meta = page > 1 ? {
    ...baseMeta,
    title: `${baseMeta.title.replace(/\s*\|\s*KhoPhim$/i, '')} - Trang ${page} | KhoPhim`,
    description: `${baseMeta.description} Trang ${page}.`,
    h1: `${baseMeta.h1} - Trang ${page}`,
  } : baseMeta;

  const canonical = `${SITE_URL}${cleanPath === '/' ? '/' : cleanPath}${page > 1 ? `?page=${page}` : ''}`;
  const topic = getTopicContent(cleanPath);
  const isFreshHub = cleanPath === '/phim-moi-nhat' || cleanPath === '/phim-moi-cap-nhat';
  const catalog = await fetchStaticMovieLinks(context, cleanPath, page);
  const staticMovies = catalog.movies || [];
  const totalPages = Math.min(catalog.totalPages || 1, SEO_MAX_INDEXABLE_PAGES);
  const outOfRange = page > 1 && catalog.totalItems > 0 && page > totalPages;
  const noIndex = isNoIndexPath(cleanPath) || page > SEO_MAX_INDEXABLE_PAGES || outOfRange;
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
        ...(cleanPath === '/' ? [] : [{ '@type': 'ListItem', position: 2, name: baseMeta.h1, item: `${SITE_URL}${cleanPath}` }]),
        ...(page > 1 ? [{ '@type': 'ListItem', position: 3, name: `Trang ${page}`, item: canonical }] : []),
      ],
    },
    ...(page === 1 ? [{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: topic.faq.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    }] : []),
    ...(staticMovies.length ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Danh sách - ${meta.h1}`,
      numberOfItems: staticMovies.length,
      itemListElement: staticMovies.map((movie, index) => ({
        '@type': 'ListItem',
        position: ((page - 1) * SEO_CATALOG_PAGE_SIZE) + index + 1,
        name: movie.name,
        url: `${SITE_URL}/phim/${encodeURIComponent(movie.slug)}`,
      })),
    }] : []),
  ];
  const body = `${renderStaticMovieDiscovery(staticMovies, meta)}${renderStaticPagination(cleanPath, page, totalPages)}${renderTopicBody(cleanPath, meta, canonical, page)}`;
  return new Response(renderHtml({
    title: meta.title,
    description: meta.description,
    canonical,
    h1: meta.h1,
    body,
    schema,
    robots: noIndex
      ? 'noindex, follow'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  }), {
    status: outOfRange ? 404 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': isFreshHub
        ? 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800'
        : 'public, max-age=900, s-maxage=3600',
      'X-Prerendered': 'cloudflare-static',
      'X-SEO-Catalog-Source': catalog.source || 'unknown',
      'X-Robots-Tag': noIndex
        ? 'noindex, follow'
        : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      ...SECURITY_HEADERS,
    },
  });
}

async function fetchSupabaseMovie(slug, context) {
  const seoUrl = new URL(`${SUPABASE_FUNCTION_BASE}/movie-seo-prerender-data`);
  seoUrl.searchParams.set('slug', slug);
  const detailUrl = new URL(`${SUPABASE_FUNCTION_BASE}/movie-detail-proxy`);
  detailUrl.searchParams.set('slug', slug);

  const fetchMovie = async (attempt) => {
    try {
      const response = await fetch(attempt.url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'KhoPhimBot/1.0 SEO-Prerender',
          // This function is deployed with JWT verification. The public key is
          // deliberately used here (never a service-role key): it authorizes
          // the Worker as the same public client that can read published data.
          ...(attempt.url === seoUrl ? {
            apikey: SUPABASE_PUBLIC_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
          } : {}),
          ...(attempt.url === detailUrl && context?.env?.MOVIE_DETAIL_PROXY_SECRET
            ? { 'X-KhoPhim-Proxy-Secret': context.env.MOVIE_DETAIL_PROXY_SECRET }
            : {}),
        },
        signal: AbortSignal.timeout(attempt.timeoutMs),
      });
      if (!response.ok) {
        return { movie: null, unavailable: response.status !== 404, notFound: response.status === 404 };
      }
      const data = await response.json();
      return {
        movie: data && data.status && data.movie && data.movie.slug ? data.movie : null,
        unavailable: !(data && data.status && data.movie && data.movie.slug),
        notFound: false,
      };
    } catch {
      return { movie: null, unavailable: true, notFound: false };
    }
  };

  // The SEO endpoint is the fast, quality-gated source. Only call the much
  // heavier detail proxy after a definitive 404 (for aliases or legacy rows).
  // A timeout/5xx is a circuit-breaker signal: adding another expensive call
  // during the same outage made crawler bursts amplify database pressure.
  const primary = await fetchMovie({ url: seoUrl, timeoutMs: 12000 });
  if (primary.movie || !primary.notFound) return primary;
  return fetchMovie({ url: detailUrl, timeoutMs: 8500 });
}

function renderEmergencyRss() {
  const now = new Date().toUTCString();
  const items = [
    ['/phim/nu-hoang-nuoc-mat', 'Nữ Hoàng Nước Mắt'],
    ['/phim-moi-cap-nhat', 'Phim mới cập nhật'],
    ['/phim-dang-chieu', 'Phim đang chiếu'],
  ].map(([path, title]) => `<item>
    <title>${escapeHtml(title)}</title>
    <link>${SITE_URL}${path}</link>
    <guid isPermaLink="true">${SITE_URL}${path}</guid>
    <pubDate>${now}</pubDate>
    <description>Nội dung dự phòng của KhoPhim trong lúc dịch vụ dữ liệu đang phục hồi.</description>
  </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>KhoPhim - Phim mới cập nhật</title>
    <link>${SITE_URL}</link>
    <description>Phim mới, phim đang chiếu và tập mới trên KhoPhim.</description>
    <language>vi-VN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <atom:link href="https://pubsubhubbub.appspot.com/" rel="hub"/>
    ${items}
  </channel>
</rss>`;
}

function renderMoviePrerender(pathname, movie, slug, relatedMovies = []) {
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
  const sourceLabel = movieDataSourceLabel(movie);
  const isTrailerOnly = isTrailerOnlyMovie(movie);
  const isUpcoming = isUpcomingMovie(movie);
  const hasPlayableEpisode = hasPlayableMovieEvidence(movie);
  const trailerEmbedUrl = getTrailerEmbedUrl(movie.trailer_url);
  const qualityTier = String(movie.seo_index_tier || '');
  const isOngoing = qualityTier === 'ongoing';
  // Google is currently declining most discovered movie URLs. Keep the public
  // index cohort deliberately small and trustworthy instead of treating every
  // technically playable record as search-worthy.
  const isIndexable = isHighValueIndexCandidate(movie);
  const releaseDateText = formatVietnamDate(movie.release_at);
  const releaseDateValue = String(movie.release_at || '').trim();
  const releaseDateIso = /^\d{4}-\d{2}-\d{2}/.test(releaseDateValue)
    ? releaseDateValue.slice(0, 10)
    : (year ? `${year}-01-01` : undefined);
  const episodeChangedAt = Date.parse(String(movie.seo_last_episode_change_at || '')) || 0;
  const modifiedAt = Math.max(getMovieModifiedAt(movie), episodeChangedAt);
  const modifiedIso = modifiedAt ? new Date(modifiedAt).toISOString() : undefined;
  const modifiedText = modifiedAt ? formatVietnamDateTime(modifiedAt) : '';
  const isFreshUpdate = isFreshMovieUpdate(movie);
  const episodeText = String(movie.episode_current || '').trim();
  const latestEpisodeNumber = Number(movie.seo_latest_episode_number || movie.current_episode || 0);
  const totalEpisodeCount = Number(movie.seo_declared_total_episodes || parseEpisodeCount(movie.episode_total) || 0);
  const episodeProgress = Number(movie.seo_episode_progress_percent || 0);
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
      : `${name}${year ? ` (${year})` : ''} - Thông Tin Và Tập Phim | KhoPhim`;
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
      datePublished: releaseDateIso,
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
    },
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
    ...(relatedMovies.length ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': `${canonical}#related-movies`,
      name: `Phim liên quan đến ${name}`,
      numberOfItems: relatedMovies.length,
      itemListElement: relatedMovies.map((relatedMovie, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: relatedMovie.name,
        url: `${SITE_URL}/phim/${encodeURIComponent(relatedMovie.slug)}`,
      })),
    }] : []),
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
    ${modifiedText ? `<p>Dữ liệu phim được cập nhật lúc ${escapeHtml(modifiedText)}.</p>` : ''}
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
      <a href="${escapeHtml(hasPlayableEpisode ? watchUrl : canonical)}">${escapeHtml(hasPlayableEpisode ? `Mở trang xem ${name}` : `Xem trailer và thông tin ${name}`)}</a>
      <a href="${SITE_URL}/phim-moi-cap-nhat">Phim mới cập nhật</a>
      <a href="${SITE_URL}/phim-moi-nhat">Phim mới nhất</a>
      <a href="${SITE_URL}/phim-sap-chieu">Phim sắp chiếu</a>
      <a href="${SITE_URL}/kho-phim">Toàn bộ kho phim</a>
      ${genreLinks}
      ${countryLinks}
    </nav>
    ${relatedMovies.length ? `<section aria-labelledby="related-movies-heading">
      <h2 id="related-movies-heading">Phim liên quan và cùng nhóm nội dung</h2>
      <ul>
        ${relatedMovies.map((relatedMovie) => {
          const details = [relatedMovie.year, relatedMovie.episode].filter(Boolean).join(' · ');
          return `<li><a href="${SITE_URL}/phim/${encodeURIComponent(relatedMovie.slug)}">${escapeHtml(relatedMovie.name)}</a>${details ? ` <span>${escapeHtml(details)}</span>` : ''}</li>`;
        }).join('')}
      </ul>
    </section>` : ''}
    <section>
      <h2>Thông tin phim ${escapeHtml(name)}</h2>
      ${content ? `<p>${escapeHtml(content)}</p>` : '<p>Thông tin nội dung đang được biên tập và sẽ cập nhật khi có dữ liệu xác thực.</p>'}
      ${genres.length ? `<p>Thể loại: ${genres.map(escapeHtml).join(', ')}.</p>` : ''}
      ${countries.length ? `<p>Quốc gia: ${countries.map(escapeHtml).join(', ')}.</p>` : ''}
      <p>Thông tin cơ bản được tổng hợp từ ${escapeHtml(sourceLabel)}. Trạng thái tập và nguồn xem được KhoPhim đồng bộ theo dữ liệu hiện có${modifiedText ? `; cập nhật gần nhất lúc ${escapeHtml(modifiedText)}` : ''}.</p>
    </section>`;
  return new Response(renderHtml({
    title,
    description,
    canonical,
    h1: isUpcoming || isTrailerOnly ? `${name} - trailer và thông tin phim` : `Thông tin phim ${name}`,
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

function renderMovieTemporarilyUnavailable(pathname, slug) {
  const cleanPath = pathname.replace(/\/+$/, '') || `/phim/${slug}`;
  const canonical = `${SITE_URL}${cleanPath}`;
  return new Response(renderHtml({
    title: 'Dữ liệu phim đang tạm thời cập nhật | KhoPhim',
    description: 'Dữ liệu phim đang tạm thời cập nhật. Vui lòng thử lại sau ít phút.',
    canonical,
    h1: 'Dữ liệu phim đang tạm thời cập nhật',
    body: '<p>KhoPhim đang khôi phục dữ liệu phim. Vui lòng thử lại sau ít phút.</p>',
  }), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '300',
      'X-Prerendered': 'cloudflare-movie-unavailable',
      ...SECURITY_HEADERS,
    },
  });
}

const EDGE_SITEMAP_CHUNK_SIZE = 1000;
const EDGE_FALLBACK_MOVIE_CHUNKS = 18;

function repairSitemapMojibake(value = '') {
  const looksBroken = (text) => /(?:Ã[^\s<]|Ä[^\s<]|Æ[^\s<]|áº|á»|â€|Â[\u0080-\u00bf])/.test(text);
  const repairText = (text) => {
    let repaired = text;
    for (let attempt = 0; attempt < 2 && looksBroken(repaired); attempt += 1) {
      try {
        const bytes = Uint8Array.from(Array.from(repaired), (character) => character.charCodeAt(0) & 255);
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (!decoded || decoded === repaired) break;
        repaired = decoded;
      } catch {
        break;
      }
    }
    return repaired;
  };
  return String(value || '').replace(/>([^<>]+)</g, (match, text) => `>${repairText(text)}<`);
}

function renderSitemapIndexXml() {
  const today = currentVietnamDate();
  const files = [
    'sitemap-static.xml',
    'sitemap-seo-landing.xml',
    'sitemap-movies-recent.xml',
    'sitemap-movies-upcoming.xml',
    'sitemap-movies-ongoing.xml',
    'feed.xml',
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- khophim.org Sitemap Index - Last updated: ${today} -->
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map((file) => `  <sitemap>
    <loc>${SITE_URL}/${file}</loc>
  </sitemap>`).join('\n')}
</sitemapindex>`;
}

function renderMovieSitemapIndexXml({ archive = false } = {}) {
  const files = archive
    ? Array.from({ length: EDGE_FALLBACK_MOVIE_CHUNKS }, (_, index) => `sitemap-movies-${index + 1}.xml`)
    : ['sitemap-movies-recent.xml', 'sitemap-movies-upcoming.xml', 'sitemap-movies-ongoing.xml'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- khophim.org ${archive ? 'archive' : 'priority'} movie sitemap index -->
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map((file) => `  <sitemap>
    <loc>${SITE_URL}/${file}</loc>
  </sitemap>`).join('\n')}
</sitemapindex>`;
}

async function proxySitemap(pathname, request, context) {
  if (pathname === '/sitemap.xml' || isLegacySitemapAlias(pathname)) {
    const sitemapIndex = renderSitemapIndexXml();
    return new Response(request.method === 'HEAD' ? null : sitemapIndex, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
        'X-Sitemap-Proxy': 'cloudflare-pages-priority-index',
        ...SECURITY_HEADERS,
      },
    });
  }

  if (pathname === '/sitemap-movies.xml' || pathname === '/sitemap-movies-archive.xml') {
    const sitemapIndex = renderMovieSitemapIndexXml({ archive: pathname.endsWith('-archive.xml') });
    return new Response(request.method === 'HEAD' ? null : sitemapIndex, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
        'X-Sitemap-Proxy': pathname.endsWith('-archive.xml')
          ? 'cloudflare-pages-archive-index'
          : 'cloudflare-pages-priority-movie-index',
        ...SECURITY_HEADERS,
      },
    });
  }

  const movieChunkMatch = /^\/sitemap-movies-(\d+)\.xml$/.exec(pathname);
  const sitemapVersion = '20260810-dynamic-chunks-v5';
  let target = `${SUPABASE_FUNCTION_BASE}/sitemap-index?v=${sitemapVersion}`;
  if (pathname === '/sitemap-movies-dynamic') {
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
    target = `${SUPABASE_FUNCTION_BASE}/sitemap-movies-xml?page=${movieChunkMatch[1]}&page_size=${EDGE_SITEMAP_CHUNK_SIZE}&v=${sitemapVersion}`;
  }
  const cacheKey = new Request(target, { method: 'GET' });
  const staleCacheKey = new Request(`${target}${target.includes('?') ? '&' : '?'}kp_stale=1`, { method: 'GET' });

  try {
    if ((request.method === 'GET' || request.method === 'HEAD') && typeof caches !== 'undefined') {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-Sitemap-Proxy', 'cloudflare-pages');
        headers.set('X-Sitemap-Cache', 'HIT');
        const cachedCount = headers.get('X-Movie-Count');
        if (movieChunkMatch && cachedCount === '0') {
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
    // An RSS feed is supplementary discovery data. Do not make crawlers wait
    // for a congested database: the valid emergency feed below is preferable
    // to a 30-second timeout and keeps the endpoint crawlable.
    const upstreamTimeoutMs = movieChunkMatch
      ? 8000
      : ((pathname === '/feed.xml' || pathname === '/sitemap-movies-recent.xml') ? 5000 : 30000);
    const maxAttempts = movieChunkMatch ? 2 : 1;
    let response = null;
    let upstreamError = null;
    for (let attempt = 0; attempt < maxAttempts && !response; attempt += 1) {
      try {
        const candidate = await fetch(target, {
          headers: { 'Accept': 'application/xml', 'User-Agent': request.headers.get('user-agent') || 'KhoPhimBot/1.0' },
          cf: { cacheTtl: isOngoingSitemap ? 600 : 1800, cacheEverything: true },
          signal: AbortSignal.timeout(upstreamTimeoutMs),
        });
        if (candidate.ok) response = candidate;
        else upstreamError = new Error(`Sitemap upstream ${candidate.status}`);
      } catch (error) {
        upstreamError = error;
      }
    }
    if (!response) throw upstreamError || new Error('Sitemap upstream unavailable');
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
    headers.delete('Content-Length');
    const movieCount = headers.get('X-Movie-Count');
    if (movieChunkMatch && movieCount === '0') {
      headers.set('Cache-Control', 'no-store');
      return new Response(request.method === 'HEAD' ? null : '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
        status: 404,
        headers,
      });
    }
    const sitemapBody = request.method === 'HEAD'
      ? null
      : repairSitemapMojibake(await response.text());
    const sitemapResponse = new Response(sitemapBody, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    if (request.method === 'GET' && typeof caches !== 'undefined') {
      const staleHeaders = new Headers(sitemapResponse.headers);
      staleHeaders.set('Cache-Control', 'public, max-age=604800');
      staleHeaders.set('X-Sitemap-Stale-Snapshot', '1');
      const staleResponse = new Response(sitemapResponse.clone().body, {
        status: sitemapResponse.status,
        statusText: sitemapResponse.statusText,
        headers: staleHeaders,
      });
      contextWaitUntil(context, Promise.all([
        caches.default.put(cacheKey, sitemapResponse.clone()),
        caches.default.put(staleCacheKey, staleResponse),
      ]));
    }
    return sitemapResponse;
  } catch (error) {
    if ((request.method === 'GET' || request.method === 'HEAD') && typeof caches !== 'undefined') {
      const stale = await caches.default.match(staleCacheKey);
      if (stale) {
        const headers = new Headers(stale.headers);
        headers.set('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400');
        headers.set('X-Sitemap-Cache', 'STALE-FALLBACK');
        return new Response(request.method === 'HEAD' ? null : stale.body, {
          status: stale.status,
          statusText: stale.statusText,
          headers,
        });
      }
    }
    if (pathname === '/feed.xml') {
      return new Response(request.method === 'HEAD' ? null : renderEmergencyRss(), {
        status: 200,
        headers: {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600',
          'X-Sitemap-Proxy': 'cloudflare-pages-emergency-rss',
          'X-Upstream-Degraded': '1',
          ...SECURITY_HEADERS,
        },
      });
    }
    // The build carries a validated, last-known-good snapshot of the newest
    // movie URLs. Keeping this one priority sitemap available during a
    // Supabase incident protects discovery without inventing catalogue URLs.
    if (pathname === '/sitemap-movies-recent.xml') {
      const fallback = await serveAsset(context, '/sitemap-movies-recent.xml');
      const headers = new Headers(fallback.headers);
      headers.set('X-Sitemap-Proxy', 'cloudflare-pages-static-recent-fallback');
      headers.set('X-Upstream-Degraded', '1');
      return new Response(request.method === 'HEAD' ? null : fallback.body, {
        status: fallback.status,
        statusText: fallback.statusText,
        headers,
      });
    }
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

function decodeXmlValue(value = '') {
  return String(value || '')
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseCatalogMovies(xml = '') {
  const movies = [];
  const seen = new Set();
  for (const match of repairSitemapMojibake(xml).matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const locMatch = block.match(/<loc>([\s\S]*?)<\/loc>/i);
    if (!locMatch) continue;
    try {
      const movieUrl = new URL(decodeXmlValue(locMatch[1]).trim());
      const slugMatch = /^\/phim\/([^/]+)\/?$/.exec(movieUrl.pathname);
      if (movieUrl.origin !== SITE_URL || !slugMatch) continue;
      const slug = decodeURIComponent(slugMatch[1]);
      if (!slug || seen.has(slug)) continue;
      const titleMatch = block.match(/<image:title>([\s\S]*?)<\/image:title>/i);
      const lastmodMatch = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i);
      const imageMatch = block.match(/<image:loc>([\s\S]*?)<\/image:loc>/i);
      seen.add(slug);
      movies.push({
        slug,
        name: decodeXmlValue(titleMatch?.[1] || '').trim() || titleCaseFromSlug(slug),
        lastmod: decodeXmlValue(lastmodMatch?.[1] || '').trim(),
        image: decodeXmlValue(imageMatch?.[1] || '').trim(),
      });
    } catch {
      // Ignore malformed entries; the sitemap remains the source of truth.
    }
  }
  return movies;
}

function parseCatalogChunkNumbers(xml = '') {
  return [...new Set([...String(xml || '').matchAll(/sitemap-movies-(\d+)\.xml/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

function catalogResponse(request, html, { status = 200, cache = true, source = 'catalog' } = {}) {
  return new Response(request.method === 'HEAD' ? null : html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cache
        ? 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400'
        : 'no-store',
      'X-Prerendered': `cloudflare-${source}`,
      'X-Robots-Tag': status === 200
        ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        : 'noindex, follow',
      ...SECURITY_HEADERS,
    },
  });
}

async function renderMovieCatalogIndex(request, context) {
  const internalRequest = request.method === 'HEAD'
    ? new Request(request.url, { method: 'GET', headers: request.headers })
    : request;
  const sitemapResponse = await proxySitemap('/sitemap-movies-archive.xml', internalRequest, context);
  const sitemapXml = sitemapResponse?.ok ? await sitemapResponse.text() : '';
  const chunks = parseCatalogChunkNumbers(sitemapXml);
  if (!chunks.length) {
    return catalogResponse(request, renderHtml({
      title: 'Kho phim đang tạm thời cập nhật | KhoPhim',
      description: 'Danh mục phim đang tạm thời cập nhật. Vui lòng thử lại sau ít phút.',
      canonical: `${SITE_URL}/kho-phim`,
      h1: 'Kho phim đang tạm thời cập nhật',
      body: `<p>Danh mục đang được phục hồi. Bạn vẫn có thể xem <a href="${SITE_URL}/phim-moi-cap-nhat">phim mới cập nhật</a>.</p>`,
      robots: 'noindex, follow',
    }), { status: 503, cache: false, source: 'catalog-unavailable' });
  }

  const canonical = `${SITE_URL}/kho-phim`;
  const title = 'Kho Phim Vietsub HD - Danh Mục Phim Đầy Đủ | KhoPhim';
  const description = `Duyệt toàn bộ phim đủ điều kiện hiển thị trên KhoPhim qua ${chunks.length} trang danh mục, hoặc chuyển nhanh tới phim mới cập nhật và phim đang chiếu.`;
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      name: title,
      description,
      url: canonical,
      inLanguage: 'vi-VN',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      numberOfItems: chunks.length,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Kho phim', item: canonical },
      ],
    },
  ];
  const body = `<p>${escapeHtml(description)}</p>
    <nav aria-label="Các trang trong kho phim">
      <ol>
        ${chunks.map((page) => `<li><a href="${SITE_URL}/kho-phim/trang/${page}">Kho phim - trang ${page}</a></li>`).join('')}
      </ol>
    </nav>
    <p><a href="${SITE_URL}/phim-moi-cap-nhat">Xem phim mới cập nhật</a> · <a href="${SITE_URL}/phim-dang-chieu">Xem phim đang chiếu</a></p>`;
  return catalogResponse(request, renderHtml({
    title,
    description,
    canonical,
    h1: 'Kho phim Vietsub HD',
    body,
    schema,
  }));
}

async function renderMovieCatalogPage(request, context, page) {
  const internalRequest = request.method === 'HEAD'
    ? new Request(request.url, { method: 'GET', headers: request.headers })
    : request;
  const sitemapResponse = await proxySitemap(`/sitemap-movies-${page}.xml`, internalRequest, context);
  if (!sitemapResponse?.ok) {
    const status = sitemapResponse?.status === 404 ? 404 : 503;
    const canonical = `${SITE_URL}/kho-phim/trang/${page}`;
    return catalogResponse(request, renderHtml({
      title: status === 404 ? 'Không tìm thấy trang kho phim | KhoPhim' : 'Kho phim đang tạm thời cập nhật | KhoPhim',
      description: status === 404 ? 'Trang kho phim này không tồn tại.' : 'Danh mục phim đang tạm thời cập nhật. Vui lòng thử lại sau ít phút.',
      canonical,
      h1: status === 404 ? 'Không tìm thấy trang kho phim' : 'Kho phim đang tạm thời cập nhật',
      body: `<p><a href="${SITE_URL}/kho-phim">Trở về toàn bộ kho phim</a>.</p>`,
      robots: 'noindex, follow',
    }), { status, cache: status === 404, source: status === 404 ? 'catalog-not-found' : 'catalog-unavailable' });
  }

  const movies = parseCatalogMovies(await sitemapResponse.text());
  if (!movies.length) {
    return catalogResponse(request, renderHtml({
      title: 'Không tìm thấy trang kho phim | KhoPhim',
      description: 'Trang kho phim này không có phim hợp lệ.',
      canonical: `${SITE_URL}/kho-phim/trang/${page}`,
      h1: 'Không tìm thấy trang kho phim',
      body: `<p><a href="${SITE_URL}/kho-phim">Trở về toàn bộ kho phim</a>.</p>`,
      robots: 'noindex, follow',
    }), { status: 404, source: 'catalog-not-found' });
  }

  const canonical = `${SITE_URL}/kho-phim/trang/${page}`;
  const title = `Kho Phim Vietsub HD - Trang ${page} | KhoPhim`;
  const description = `Danh mục ${movies.length} phim đủ điều kiện hiển thị trên KhoPhim, trang ${page}. Mỗi phim dẫn trực tiếp tới trang thông tin chính thức và dữ liệu cập nhật gần nhất.`;
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${canonical}#webpage`,
      name: title,
      description,
      url: canonical,
      inLanguage: 'vi-VN',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      numberOfItems: movies.length,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Kho phim', item: `${SITE_URL}/kho-phim` },
        { '@type': 'ListItem', position: 3, name: `Trang ${page}`, item: canonical },
      ],
    },
  ];
  const body = `<p>${escapeHtml(description)}</p>
    <nav aria-label="Điều hướng kho phim">
      <a href="${SITE_URL}/kho-phim">Toàn bộ kho phim</a>
      ${page > 1 ? `<a rel="prev" href="${SITE_URL}/kho-phim/trang/${page - 1}">Trang trước</a>` : ''}
      ${movies.length === EDGE_SITEMAP_CHUNK_SIZE ? `<a rel="next" href="${SITE_URL}/kho-phim/trang/${page + 1}">Trang sau</a>` : ''}
    </nav>
    <section aria-labelledby="catalog-movies-heading">
      <h2 id="catalog-movies-heading">Danh sách phim - trang ${page}</h2>
      <ol>
        ${movies.map((movie) => `<li><a href="${SITE_URL}/phim/${encodeURIComponent(movie.slug)}">${escapeHtml(movie.name)}</a>${movie.lastmod ? ` <span>· cập nhật ${escapeHtml(movie.lastmod)}</span>` : ''}</li>`).join('')}
      </ol>
    </section>`;
  return catalogResponse(request, renderHtml({
    title,
    description,
    canonical,
    h1: `Kho phim Vietsub HD - trang ${page}`,
    body,
    schema,
  }));
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

function detailHasPlayableTransport(payload) {
  if (!payload || payload.status !== true || !payload.movie || !Array.isArray(payload.episodes)) return false;
  return payload.episodes.some((server) => Array.isArray(server?.server_data) && server.server_data.some((episode) => {
    const candidates = [episode?.link_m3u8, episode?.link_embed];
    return candidates.some((candidate) => {
      const value = String(candidate || '').trim();
      if (!/^https?:\/\//i.test(value)) return false;
      try {
        const parsed = new URL(value);
        if (/(^|\.)(?:ophim1\.com|ophim\.live|ophimimg\.com)$/i.test(parsed.hostname)) return false;
        if (/(^|\.)opstream[^.]*\./i.test(parsed.hostname) || /opstream/i.test(parsed.hostname)) return false;
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        return false;
      }
    });
  }));
}

function hasPlayableProviderDetail(payload, requestedSlug) {
  if (!detailHasPlayableTransport(payload)) return false;
  const responseSlug = String(payload.movie.slug || '').trim();
  if (responseSlug !== requestedSlug || payload.movie.is_published === false) return false;
  return true;
}

function isRetiredOphimPlaybackEpisode(episode, serverName = '') {
  const identity = `${episode?.source_provider || ''} ${serverName}`.toLowerCase();
  if (/(?:^|[^a-z0-9])ophim(?:[^a-z0-9]|$)|opstream/i.test(identity)) return true;
  return [episode?.link_m3u8, episode?.link_embed].some((candidate) => {
    const value = String(candidate || '').trim();
    if (!value) return false;
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
      return host === 'ophim1.com' || host.endsWith('.ophim1.com') || /opstream/i.test(host);
    } catch {
      return /ophim1\.com|opstream/i.test(value);
    }
  });
}

function sanitizeRetiredOphimDetailPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const episodes = (Array.isArray(payload.episodes) ? payload.episodes : []).map((server) => ({
    ...server,
    server_data: (Array.isArray(server?.server_data) ? server.server_data : [])
      .filter((episode) => !isRetiredOphimPlaybackEpisode(episode, server?.server_name || '')),
  })).filter((server) => server.server_data.length > 0);
  return {
    ...payload,
    movie: payload.movie && typeof payload.movie === 'object'
      ? { ...payload.movie, ophim_id: '' }
      : payload.movie,
    episodes,
  };
}

function isRetiredOphimCatalogItem(item) {
  // Catalogue identity is provider-neutral. OPhim playback URLs are retired,
  // but metadata remains discoverable so another provider can satisfy detail.
  return false;
}

function isOphimCatalogSource(item) {
  const identity = `${item?.source_site || ''} ${item?.source_name || ''}`.toLowerCase();
  return /(?:^|[^a-z0-9])ophim(?:[^a-z0-9]|$)|ophim1|opstream/i.test(identity);
}

function sanitizeHomePayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.sections || typeof payload.sections !== 'object') return payload;
  return {
    ...payload,
    sections: Object.fromEntries(Object.entries(payload.sections).map(([key, items]) => [
      key,
      (Array.isArray(items) ? items : []).filter((item) => !isRetiredOphimCatalogItem(item)),
    ])),
  };
}

function normalizeNguoncProviderDetail(payload, requestedSlug) {
  if (!payload || payload.status !== 'success' || !payload.movie || typeof payload.movie !== 'object') return null;
  const movie = payload.movie;
  if (String(movie.slug || '').trim() !== requestedSlug || !Array.isArray(movie.episodes)) return null;
  const episodes = movie.episodes.map((server) => ({
    server_name: String(server?.server_name || 'NguồnC'),
    server_data: (Array.isArray(server?.items) ? server.items : []).map((episode) => ({
      name: String(episode?.name || ''),
      slug: String(episode?.slug || episode?.name || ''),
      filename: String(episode?.name || ''),
      link_embed: String(episode?.embed || episode?.link_embed || ''),
      link_m3u8: String(episode?.m3u8 || episode?.link_m3u8 || ''),
    })),
  })).filter((server) => server.server_data.length > 0);
  const normalized = {
    status: true,
    movie: {
      ...movie,
      content: movie.content || movie.description || '',
      episode_current: movie.episode_current || movie.current_episode || '',
      episode_total: movie.episode_total || String(movie.total_episodes || ''),
      lang: movie.lang || movie.language || '',
      source_site: 'nguonc',
      source_name: 'NguồnC',
    },
    episodes,
  };
  return hasPlayableProviderDetail(normalized, requestedSlug) ? normalized : null;
}

function scoreProviderDetail(payload, elapsedMs) {
  const servers = Array.isArray(payload?.episodes) ? payload.episodes : [];
  const episodeKeys = new Set();
  let playableUrls = 0;
  let directUrls = 0;
  for (const server of servers) {
    for (const episode of Array.isArray(server?.server_data) ? server.server_data : []) {
      const urls = [episode?.link_m3u8, episode?.link_embed]
        .map((value) => String(value || '').trim())
        .filter((value) => /^https?:\/\//i.test(value));
      if (!urls.length) continue;
      episodeKeys.add(String(episode?.slug || episode?.name || episodeKeys.size));
      playableUrls += urls.length;
      directUrls += urls.filter((value) => /\.(?:m3u8|mp4|webm|mov)(?:[?#].*)?$/i.test(value)).length;
    }
  }
  const expected = Math.max(
    Number(payload?.movie?.episode_total || 0) || 0,
    Number(String(payload?.movie?.episode_current || '').match(/\d+/)?.[0] || 0),
  );
  const completeness = expected > 0 ? Math.min(1, episodeKeys.size / expected) : Number(episodeKeys.size > 0);
  const metadataFields = ['name', 'origin_name', 'poster_url', 'thumb_url', 'year']
    .filter((key) => payload?.movie?.[key]).length;
  return completeness * 500
    + episodeKeys.size * 20
    + playableUrls * 4
    + directUrls * 8
    + servers.length * 5
    + metadataFields * 2
    + Math.max(0, 3000 - elapsedMs) / 100;
}

async function fetchProviderDetailFallback(slug, _preferredSource = '') {
  // The public catalogue can originate from several providers. A fallback
  // restricted to OPhim made every KKPhim-only cinema card fail whenever the
  // database was slow. Keep the provider URLs fixed (no SSRF surface), require
  // an exact slug and playable episode. Every provider starts together and
  // the winner is selected only by completeness, transport readiness and
  // response time; provider identity contributes no score.
  const providers = [
    { code: 'KKPHIM', url: `https://phimapi.com/phim/${encodeURIComponent(slug)}` },
    { code: 'VSMOV', url: `https://vsmov.com/api/phim/${encodeURIComponent(slug)}` },
    { code: 'NGUONC', url: `https://phim.nguonc.com/api/film/${encodeURIComponent(slug)}` },
  ];
  const controllers = [];
  const attempts = providers.map(({ code, url }) => {
    const startedAt = Date.now();
    const controller = new AbortController();
    controllers.push(controller);
    const timer = setTimeout(() => controller.abort(), 2400);
    return fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'KhoPhim-Detail-Fallback/2.0' },
      signal: controller.signal,
    }).then(async (upstream) => {
      if (!upstream.ok) return null;
      const contentLength = Number(upstream.headers.get('content-length') || 0);
      if (contentLength > 2_000_000) {
        await upstream.body?.cancel().catch(() => undefined);
        return null;
      }
      const payload = await upstream.json().catch(() => null);
      const normalizedPayload = code === 'NGUONC'
        ? normalizeNguoncProviderDetail(payload, slug)
        : payload;
      if (!hasPlayableProviderDetail(normalizedPayload, slug)) return null;
      return {
        code,
        payload: normalizedPayload,
        elapsedMs: Date.now() - startedAt,
        payloadSize: JSON.stringify(normalizedPayload).length,
      };
    }).catch(() => null).finally(() => clearTimeout(timer));
  });

  try {
    const candidates = (await Promise.all(attempts)).filter(Boolean);
    candidates.sort((a, b) => {
      const scoreDiff = scoreProviderDetail(b.payload, b.elapsedMs) - scoreProviderDetail(a.payload, a.elapsedMs);
      if (scoreDiff !== 0) return scoreDiff;
      if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
      return b.payloadSize - a.payloadSize;
    });
    const winner = candidates[0] || null;
    if (!winner) return null;
    return new Response(JSON.stringify(winner.payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=120',
        'X-KhoPhim-Detail-Cache': 'MISS',
        'X-KhoPhim-Detail-Fallback': winner.code,
        ...SECURITY_HEADERS,
      },
    });
  } finally {
    for (const controller of controllers) {
      try { controller.abort(); } catch { /* noop */ }
    }
  }
}

function normalizeCanonicalTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:doc tham|vietsub|thuyet minh|long tieng|ban dep|full hd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalMovieType(value) {
  const type = String(value || '').toLowerCase();
  if (/(?:single|movie|phim-le|phim-chieu-rap)/.test(type)) return 'single';
  if (/(?:series|tv|phim-bo|hoathinh|tvshows)/.test(type)) return 'series';
  return '';
}

function safeLocalAlternativeIdentity(base, candidate) {
  const baseTmdb = Number(base?.tmdb_id || 0) || 0;
  const candidateTmdb = Number(candidate?.tmdb_id || 0) || 0;
  if (baseTmdb && candidateTmdb) return baseTmdb === candidateTmdb;
  const baseImdb = String(base?.imdb_id || '').trim().toLowerCase();
  const candidateImdb = String(candidate?.imdb_id || '').trim().toLowerCase();
  if (baseImdb && candidateImdb) return baseImdb === candidateImdb;

  const baseYear = Number(base?.year || 0) || 0;
  const candidateYear = Number(candidate?.year || 0) || 0;
  if (baseYear && candidateYear && baseYear !== candidateYear) return false;
  const baseType = canonicalMovieType(base?.type);
  const candidateType = canonicalMovieType(candidate?.type);
  if (baseType && candidateType && baseType !== candidateType) return false;

  const fields = ['name', 'origin_name', 'title_vi', 'title_en', 'title_original'];
  const baseTitles = new Set(fields.map((field) => normalizeCanonicalTitle(base?.[field])).filter((value) => value.length >= 6));
  const candidateTitles = new Set(fields.map((field) => normalizeCanonicalTitle(candidate?.[field])).filter((value) => value.length >= 6));
  return [...baseTitles].some((title) => candidateTitles.has(title));
}

async function fetchLocalPlayableAlternative(requestedSlug, upstreamPayload, context) {
  const baseMovie = upstreamPayload?.movie;
  const proxySecret = String(context?.env?.MOVIE_DETAIL_PROXY_SECRET || '');
  if (!baseMovie || typeof baseMovie !== 'object' || !proxySecret) return null;
  const queries = [...new Set([
    baseMovie.name,
    baseMovie.origin_name,
    baseMovie.title_en,
    baseMovie.title_original,
  ].map((value) => String(value || '').trim()).filter((value) => value.length >= 3))].slice(0, 2);
  const candidates = [];
  for (const query of queries) {
    try {
      const response = await fetch(`${SUPABASE_REST_BASE}/rpc/search_movies_fast`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          apikey: SUPABASE_PUBLIC_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
        },
        body: JSON.stringify({ search_query: query, result_limit: 12 }),
        signal: AbortSignal.timeout(1800),
      });
      if (!response.ok) continue;
      const rows = await response.json().catch(() => []);
      if (Array.isArray(rows)) candidates.push(...rows);
    } catch {
      /* try the next stable title */
    }
  }

  const uniqueCandidates = [...new Map(candidates
    .filter((candidate) => candidate && String(candidate.slug || '') !== requestedSlug)
    .filter((candidate) => !isOphimCatalogSource(candidate))
    .map((candidate) => [String(candidate.slug || ''), candidate])).values()]
    .filter((candidate) => candidate.slug && safeLocalAlternativeIdentity(baseMovie, candidate))
    .slice(0, 4);

  for (const candidate of uniqueCandidates) {
    const candidateSlug = String(candidate.slug || '');
    try {
      const detailUrl = new URL(`${SUPABASE_FUNCTION_BASE}/movie-detail-proxy`);
      detailUrl.searchParams.set('slug', candidateSlug);
      const response = await fetch(detailUrl, {
        headers: { Accept: 'application/json', 'X-KhoPhim-Proxy-Secret': proxySecret },
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) continue;
      const detail = sanitizeRetiredOphimDetailPayload(await response.json().catch(() => null));
      if (!hasPlayableProviderDetail(detail, candidateSlug)) continue;
      const payload = {
        ...detail,
        movie: {
          ...baseMovie,
          ...detail.movie,
          slug: requestedSlug,
          canonical_slug: candidateSlug,
          resolved_source_slug: candidateSlug,
        },
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=1800, stale-if-error=86400',
          'X-KhoPhim-Detail-Fallback': 'LOCAL_CANONICAL',
          'X-KhoPhim-Canonical-Source': candidateSlug,
          ...SECURITY_HEADERS,
        },
      });
    } catch {
      /* try the next verified local identity */
    }
  }
  return null;
}

async function proxyMovieDetail(request, context) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '').trim();
  const preferredSource = String(url.searchParams.get('source') || '').trim().toLowerCase();
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
  const cacheKey = new Request(`${SITE_URL}/__api-cache/movie-detail/${encodeURIComponent(slug)}?rev=canonical-v8-provider-neutral`, { method: 'GET' });
  const failureKey = new Request(`${SITE_URL}/__circuit/movie-detail/${encodeURIComponent(slug)}`, { method: 'GET' });
  let fallbackPromise;

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
        const fallback = await fetchProviderDetailFallback(slug, preferredSource);
        if (fallback) {
          contextWaitUntil(context, caches.default.put(cacheKey, fallback.clone()));
          contextWaitUntil(context, caches.default.delete(failureKey));
          return fallback;
        }
        const headers = new Headers(openCircuit.headers);
        headers.set('X-KhoPhim-Circuit', 'OPEN');
        return new Response(openCircuit.body, { status: 503, headers });
      }
    }

    fallbackPromise = fetchProviderDetailFallback(slug, preferredSource);
    const upstreamOutcomePromise = fetch(upstreamUrl.toString(), {
      headers: {
        Accept: 'application/json',
        ...(context?.env?.MOVIE_DETAIL_PROXY_SECRET
          ? { 'X-KhoPhim-Proxy-Secret': context.env.MOVIE_DETAIL_PROXY_SECRET }
          : {}),
      },
      cf: refresh ? undefined : { cacheTtl: 30, cacheEverything: true },
      // Large catalogues can finish just after four seconds. Keep this below
      // the browser's bounded fallback window, but do not kill a valid response
      // at 4.1s before it can populate the shared edge cache.
      signal: AbortSignal.timeout(11000),
    }).then((upstream) => ({ upstream, error: null }))
      .catch((error) => ({ upstream: null, error }));
    let upstreamOutcome = await Promise.race([
      upstreamOutcomePromise,
      new Promise((resolve) => setTimeout(() => resolve({ upstream: null, error: null, slow: true }), 1400)),
    ]);
    if (upstreamOutcome.slow) {
      const fallback = await Promise.race([
        fallbackPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);
      if (fallback) {
        if (!refresh && request.method === 'GET' && typeof caches !== 'undefined') {
          contextWaitUntil(context, caches.default.put(cacheKey, fallback.clone()));
          contextWaitUntil(context, caches.default.delete(failureKey));
        }
        return fallback;
      }
      upstreamOutcome = await upstreamOutcomePromise;
    }
    if (upstreamOutcome.error) throw upstreamOutcome.error;
    const upstream = upstreamOutcome.upstream;
    const headers = new Headers(upstream.headers);
    headers.delete('Set-Cookie');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', refresh ? 'no-store' : 'public, max-age=30, s-maxage=30, stale-while-revalidate=30, stale-if-error=300');
    headers.set('X-KhoPhim-Detail-Cache', refresh ? 'REFRESH' : 'MISS');
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    const upstreamBody = await upstream.text();
    let responseBody = upstreamBody;
    let parsedUpstreamPayload = null;
    if (upstream.ok) {
      try {
        parsedUpstreamPayload = sanitizeRetiredOphimDetailPayload(JSON.parse(upstreamBody));
        responseBody = JSON.stringify(parsedUpstreamPayload);
      } catch {
        /* preserve upstream error/body contract */
      }
    }
    const response = new Response(responseBody, { status: upstream.status, headers });
    const upstreamPlayable = upstream.ok && detailHasPlayableTransport(parsedUpstreamPayload);
    if (upstream.ok && !upstreamPlayable) {
      // A metadata-only HTTP 200 is not a successful movie-detail response.
      // Prefer any playable provider result, then a verified local canonical
      // duplicate (for example a BLVietsub/GLVietsub row under another slug).
      const fallback = await fallbackPromise
        || await fetchLocalPlayableAlternative(slug, parsedUpstreamPayload, context);
      if (fallback) {
        if (!refresh && request.method === 'GET' && typeof caches !== 'undefined') {
          contextWaitUntil(context, caches.default.put(cacheKey, fallback.clone()));
          contextWaitUntil(context, caches.default.delete(failureKey));
        }
        return fallback;
      }
      headers.set('Cache-Control', 'public, max-age=0, s-maxage=10, stale-if-error=60');
      headers.set('X-KhoPhim-Detail-Playable', '0');
      return new Response(responseBody, { status: upstream.status, headers });
    }
    if (!refresh && request.method === 'GET' && upstreamPlayable && typeof caches !== 'undefined') {
      contextWaitUntil(context, caches.default.put(cacheKey, response.clone()));
      contextWaitUntil(context, caches.default.delete(failureKey));
    }
    if (upstream.status >= 500) {
      const fallback = await fallbackPromise;
      if (fallback) {
        if (!refresh && request.method === 'GET' && typeof caches !== 'undefined') {
          contextWaitUntil(context, caches.default.put(cacheKey, fallback.clone()));
          contextWaitUntil(context, caches.default.delete(failureKey));
        }
        return fallback;
      }
    }
    if (upstream.status < 500 && fallbackPromise) {
      contextWaitUntil(context, fallbackPromise.then(() => undefined));
    }
    return response;
  } catch (error) {
    const fallback = await (fallbackPromise || fetchProviderDetailFallback(slug, preferredSource));
    if (fallback) {
      if (!refresh && request.method === 'GET' && typeof caches !== 'undefined') {
        contextWaitUntil(context, caches.default.put(cacheKey, fallback.clone()));
        contextWaitUntil(context, caches.default.delete(failureKey));
      }
      return fallback;
    }
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

async function secretsMatch(provided, expected) {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

async function proxyNguoncDetail(request, context) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }
  const expectedSecret = String(context?.env?.MOVIE_DETAIL_PROXY_SECRET || '');
  const providedSecret = String(request.headers.get('x-khophim-proxy-secret') || '');
  if (!await secretsMatch(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ status: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }

  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug || slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return new Response(JSON.stringify({ status: false, message: 'Invalid slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }

  try {
    const upstream = await fetch(`https://phim.nguonc.com/api/film/${encodeURIComponent(slug)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 KhoPhim-ProviderBridge/1.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    const contentType = upstream.headers.get('content-type') || '';
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (!upstream.ok || !/json/i.test(contentType) || contentLength > 2_000_000) {
      await upstream.body?.cancel().catch(() => undefined);
      return new Response(JSON.stringify({ status: false, message: 'Provider detail unavailable' }), {
        status: upstream.ok ? 502 : upstream.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        ...SECURITY_HEADERS,
      },
    });
  } catch {
    return new Response(JSON.stringify({ status: false, message: 'Provider bridge unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }
}

async function proxyNguoncCollection(request, context, kind) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }
  const expectedSecret = String(context?.env?.MOVIE_DETAIL_PROXY_SECRET || '');
  const providedSecret = String(request.headers.get('x-khophim-proxy-secret') || '');
  if (!await secretsMatch(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ status: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }

  const url = new URL(request.url);
  let upstreamUrl = '';
  if (kind === 'catalog') {
    const page = Number(url.searchParams.get('page') || 0);
    if (!Number.isInteger(page) || page < 1 || page > 10000) {
      return new Response(JSON.stringify({ status: false, message: 'Invalid page' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
      });
    }
    upstreamUrl = `https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=${page}`;
  } else {
    const keyword = String(url.searchParams.get('keyword') || '').trim();
    if (!keyword || keyword.length > 160) {
      return new Response(JSON.stringify({ status: false, message: 'Invalid keyword' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
      });
    }
    upstreamUrl = `https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(keyword)}`;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 KhoPhim-ProviderBridge/1.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    const contentType = upstream.headers.get('content-type') || '';
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (!upstream.ok || !/json/i.test(contentType) || contentLength > 2_000_000) {
      await upstream.body?.cancel().catch(() => undefined);
      return new Response(JSON.stringify({ status: false, message: 'Provider collection unavailable' }), {
        status: upstream.ok ? 502 : upstream.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        ...SECURITY_HEADERS,
      },
    });
  } catch {
    return new Response(JSON.stringify({ status: false, message: 'Provider bridge unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }
}

function normalizeSearchFallbackText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectSearchFallbackRows(payload) {
  const sections = payload && typeof payload.sections === 'object' ? payload.sections : {};
  const rows = [];
  if (Array.isArray(payload?.items)) rows.push(...payload.items);
  for (const value of Object.values(sections)) {
    if (Array.isArray(value)) rows.push(...value);
    else if (value && Array.isArray(value.items)) rows.push(...value.items);
  }
  return rows.filter((row) => row && typeof row === 'object');
}

function normalizeKnownOphimImageUrl(value) {
  const match = String(value || '').match(/^(https:\/\/(?:img\.ophimimg\.com|img\.ophim\.live))\/([^/?#]+)([?#].*)?$/i);
  if (!match) return String(value || '');
  return `${match[1]}/uploads/movies/${match[2]}${match[3] || ''}`;
}

function parseProviderSearchRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const nested = payload.data && typeof payload.data === 'object' ? payload.data : null;
  const rows = nested?.items || payload.items || [];
  if (!Array.isArray(rows)) return [];
  const cdn = String(nested?.APP_DOMAIN_CDN_IMAGE || payload.APP_DOMAIN_CDN_IMAGE || '').replace(/\/$/, '');
  return rows.map((row) => {
    const normalizeImage = (value) => {
      const image = String(value || '').trim();
      if (!image || !cdn) return image;
      if (/^https?:\/\//i.test(image)) return normalizeKnownOphimImageUrl(image);
      if (/^\/\//.test(image)) {
        const absolute = `https:${image}`;
        const repaired = normalizeKnownOphimImageUrl(absolute);
        return repaired === absolute ? image : repaired;
      }
      return normalizeKnownOphimImageUrl(`${cdn}/${image.replace(/^\/+/, '')}`);
    };
    return {
      ...row,
      thumb_url: normalizeImage(row.thumb_url || row.poster_url),
      poster_url: normalizeImage(row.poster_url),
    };
  });
}

function rankSearchFallbackRows(rows, query, limit) {
  const normalizedQuery = normalizeSearchFallbackText(query);
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  const tokens = normalizedQuery.split(' ').filter((token) => token.length >= 2 || /^\d+$/.test(token));
  const unique = new Map();

  for (const row of rows) {
    const slug = String(row.slug || '').trim();
    const name = String(row.name || row.title_vi || row.origin_name || '').trim();
    if (!slug || !name || unique.has(slug)) continue;
    const haystack = normalizeSearchFallbackText([
      name,
      row.origin_name,
      row.title_vi,
      row.title_en,
      row.title_zh,
      row.title_original,
      slug.replace(/-/g, ' '),
    ].filter(Boolean).join(' '));
    const compactHaystack = haystack.replace(/\s+/g, '');
    const exact = haystack.includes(normalizedQuery);
    const compact = compactQuery.length >= 6 && compactHaystack.includes(compactQuery);
    const tokenMatch = tokens.length >= 2 && tokens.every((token) => haystack.includes(token));
    if (!exact && !compact && !tokenMatch) continue;
    const normalizedName = normalizeSearchFallbackText(name);
    const score = normalizedName === normalizedQuery
      ? 5000
      : normalizedName.startsWith(normalizedQuery)
        ? 4000
        : exact
          ? 3000
          : compact
            ? 2000
            : 1000;
    unique.set(slug, { row, score });
  }

  return [...unique.values()]
    .sort((a, b) => b.score - a.score || Number(b.row.year || 0) - Number(a.row.year || 0))
    .slice(0, limit)
    .map(({ row }) => row);
}

function providerNeutralTitle(value) {
  return normalizeSearchFallbackText(value)
    .replace(/\b(?:doc tham|vietsub|thuyet minh|long tieng|ban dep|full hd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function providerNeutralType(value) {
  const type = String(value || '').toLowerCase();
  if (/(?:single|movie|phim-le|phim-chieu-rap)/.test(type)) return 'single';
  if (/(?:series|tv|phim-bo|hoathinh|tvshows)/.test(type)) return 'series';
  return '';
}

function sameProviderNeutralSearchIdentity(left, right, query = '') {
  const leftTitle = providerNeutralTitle(left?.name || left?.title_vi || left?.origin_name || '');
  const rightTitle = providerNeutralTitle(right?.name || right?.title_vi || right?.origin_name || '');
  if (!leftTitle || leftTitle !== rightTitle) return false;
  const normalizedQuery = providerNeutralTitle(query);
  if (normalizedQuery && leftTitle === normalizedQuery) {
    const leftTmdb = Number(left?.tmdb_id || 0) || 0;
    const rightTmdb = Number(right?.tmdb_id || 0) || 0;
    return !(leftTmdb && rightTmdb && leftTmdb !== rightTmdb);
  }
  const leftYear = Number(left?.year || 0) || 0;
  const rightYear = Number(right?.year || 0) || 0;
  if (leftYear && rightYear && leftYear !== rightYear) return false;
  const leftType = providerNeutralType(left?.type);
  const rightType = providerNeutralType(right?.type);
  return !leftType || !rightType || leftType === rightType;
}

function mergeProviderNeutralSearchRows(databaseRows, providerRows, query, limit) {
  // Live database rows are canonical for mutable fields such as episode
  // count. Static shards are an outage fallback and may be several hours old;
  // letting them dedupe first can pin a completed series to an older episode.
  const ranked = rankSearchFallbackRows([...databaseRows, ...providerRows], query, Math.max(limit * 3, 36));
  const merged = [];
  for (const row of ranked) {
    const existingIndex = merged.findIndex((existing) => sameProviderNeutralSearchIdentity(existing, row, query));
    if (existingIndex < 0) {
      merged.push(row);
      continue;
    }
    // When two rows describe the same film, a non-retired provider identity
    // supplies metadata/playback while the stable canonical URL is retained.
    // Provider identity never otherwise changes relevance or playback score.
    if (isOphimCatalogSource(merged[existingIndex]) && !isOphimCatalogSource(row)) {
      const canonicalRow = merged[existingIndex];
      merged[existingIndex] = {
        ...row,
        slug: canonicalRow.slug,
        canonical_source_slug: row.slug,
        canonical_source_provider: row.source_site || row.source_name || '',
      };
    } else if (!isOphimCatalogSource(merged[existingIndex]) && isOphimCatalogSource(row)) {
      const playableRow = merged[existingIndex];
      merged[existingIndex] = {
        ...playableRow,
        slug: row.slug,
        canonical_source_slug: playableRow.slug,
        canonical_source_provider: playableRow.source_site || playableRow.source_name || '',
      };
    }
  }
  return merged.slice(0, limit);
}

async function fetchSearchFallbackItems(request, context, query, limit) {
  const assetFetch = async (pathname) => {
    const assetRequest = new Request(new URL(pathname, request.url), { method: 'GET' });
    const response = context?.env?.ASSETS?.fetch
      ? await context.env.ASSETS.fetch(assetRequest)
      : await fetch(assetRequest);
    if (!response.ok) return null;
    return response.json().catch(() => null);
  };
  const providerFetch = async (endpoint) => {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', 'User-Agent': 'KhoPhim-Search-Fallback/1.0' },
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return [];
    return parseProviderSearchRows(await response.json().catch(() => null));
  };
  const encoded = encodeURIComponent(query);
  const first = normalizeSearchFallbackText(query).charAt(0);
  const searchShard = /^[a-z0-9]$/.test(first) ? first : '_';
  const results = await Promise.allSettled([
    assetFetch('/home-fallback.json'),
    assetFetch('/queer-fallback.json'),
    assetFetch(`/search-fallback/${searchShard}.json`),
    providerFetch(`https://phimapi.com/v1/api/tim-kiem?keyword=${encoded}&page=1`),
    providerFetch(`https://vsmov.com/api/tim-kiem?keyword=${encoded}&limit=12`),
    providerFetch(`https://phim.nguonc.com/api/films/search?keyword=${encoded}`),
  ]);
  const rows = [];
  for (const [index, result] of results.entries()) {
    if (result.status !== 'fulfilled') continue;
    if (index < 3) rows.push(...collectSearchFallbackRows(result.value));
    else if (Array.isArray(result.value)) rows.push(...result.value);
  }
  const normalizedQuery = query.toLowerCase().replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (normalizedQuery === 'mua do') {
    rows.push({
      _id: '1148786f081772ed0fbfedee09d8d771',
      slug: 'mua-do',
      name: 'Mưa Đỏ',
      thumb_url: 'https://phim.nguonc.com/public/images/Film/bLrNhlqhAMHycAe5jZj1U8lpWrQ.jpg',
      poster_url: 'https://phim.nguonc.com/public/images/Film/xgOS4pOeZX510GY42YBdpCbjuXi.jpg',
      type: 'phim-le',
      year: 2025,
      quality: 'HD',
      lang: 'Vietsub',
      episode_current: 'Full',
      current_episode: 1,
      source_site: 'canonical-safety-net',
      source_name: 'KhoPhim Singapore',
    });
  }
  return rankSearchFallbackRows(rows, query, limit);
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
  const cacheKey = new Request(`${SITE_URL}/__api-cache/search/v17-live-row-first/${limit}/${encodeURIComponent(normalizedQuery)}`, { method: 'GET' });
  const rpcCircuitKey = new Request(`${SITE_URL}/__circuit/search-rpc/v1`, { method: 'GET' });
  let rpcCircuitOpen = false;
  if (request.method === 'GET' && typeof caches !== 'undefined') {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-KhoPhim-Search-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }
    const cachedCircuit = await caches.default.match(rpcCircuitKey);
    if (cachedCircuit) {
      const circuitPayload = await cachedCircuit.clone().json().catch(() => null);
      const openedAt = Number(circuitPayload?.opened_at || 0);
      rpcCircuitOpen = openedAt > 0 && Date.now() - openedAt < 120_000;
      if (!rpcCircuitOpen) contextWaitUntil(context, caches.default.delete(rpcCircuitKey));
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
  const fallbackItemsPromise = fetchSearchFallbackItems(request, context, query, limit).catch(() => []);

  try {
    // Call PostgREST directly to avoid a second serverless cold start. The
    // response is still cached at the Cloudflare POP below.
    // This endpoint is an accelerator, not the only way a visitor can search.
    // A slow database used to keep the request open for six seconds before a
    // retry failed.  Fail fast so the browser can use its independent mirrors.
    if (rpcCircuitOpen) throw new Error('Search RPC circuit open');
    const attempt = 1;
    const upstream = await fetchSearchRpc(1800);
    const upstreamPayload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      throw new Error(upstreamPayload?.message || `Search RPC returned ${upstream.status}`);
    }
    const databaseItems = Array.isArray(upstreamPayload) ? upstreamPayload : [];
    const providerItems = await fallbackItemsPromise;
    const items = mergeProviderNeutralSearchRows(databaseItems, providerItems, query, limit);
    const headers = new Headers(upstream.headers);
    headers.delete('Set-Cookie');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=120, s-maxage=900, stale-while-revalidate=3600, stale-if-error=86400');
    headers.set('X-KhoPhim-Search-Cache', 'MISS');
    headers.set('X-KhoPhim-Search-Attempt', String(attempt));
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    const response = new Response(JSON.stringify({ status: true, query, count: items.length, items }), { status: 200, headers });
    if (upstream.ok && request.method === 'GET' && typeof caches !== 'undefined') {
      contextWaitUntil(context, caches.default.delete(rpcCircuitKey));
      contextWaitUntil(context, caches.default.put(cacheKey, response.clone()));
    }
    return response;
  } catch (error) {
    if (!rpcCircuitOpen && request.method === 'GET' && typeof caches !== 'undefined') {
      const circuitResponse = new Response(JSON.stringify({ opened_at: Date.now() }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=120, s-maxage=120',
        },
      });
      contextWaitUntil(context, caches.default.put(rpcCircuitKey, circuitResponse));
    }
    const fallbackItems = mergeProviderNeutralSearchRows([], await fallbackItemsPromise, query, limit);
    if (fallbackItems.length > 0) {
      const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800, stale-if-error=86400',
        'X-KhoPhim-Search-Cache': 'FALLBACK',
        'X-KhoPhim-Search-Attempt': 'static-provider',
      });
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
      const response = new Response(JSON.stringify({
        status: true,
        query,
        count: fallbackItems.length,
        source: 'static-provider-fallback',
        items: fallbackItems,
      }), { status: 200, headers });
      // A fallback is useful for this request but is not canonical search
      // truth. Never store it under the RPC cache key: one transient timeout
      // must not pin lower-quality rankings for later visitors.
      return response;
    }
    return new Response(JSON.stringify({ status: false, items: [], message: error instanceof Error ? error.message : 'Search unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }
}

const HOME_SECTION_KEYS = new Set([
  'vsmov-4k', 'trending', 'top10-series', 'top10-single', 'onlyflix-moi',
  'phim-chieu-rap', 'phim-le', 'phim-bo', 'hoat-hinh', 'han-quoc',
  'au-my', 'thai-lan', 'trung-quoc', 'queer',
]);

const MOVIE_LIST_SELECT = [
  'id', 'slug', 'name', 'origin_name', 'title_vi', 'title_en', 'thumb_url', 'poster_url',
  'type', 'year', 'quality', 'lang', 'episode_current', 'episode_total', 'current_episode',
  'total_episodes', 'schedule_type', 'release_time', 'release_day', 'schedule_timezone',
  'category', 'country', 'updated_at', 'source_site', 'source_name', 'release_at',
  'next_episode_at', 'next_episode_name', 'schedule_note',
].join(',');

function safeListToken(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(normalized) ? normalized : '';
}

function movieListTypeValues(type) {
  if (!type || type === 'phim-moi-cap-nhat') return [];
  if (type === 'phim-le') return ['single', 'phim-le'];
  if (type === 'phim-bo') return ['series', 'phim-bo'];
  if (type === 'hoat-hinh') return ['hoathinh'];
  if (type === 'tv-shows') return ['tvshows', 'tv-shows'];
  return [type];
}

async function proxyMovieList(request, context) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }

  const requestUrl = new URL(request.url);
  const type = safeListToken(requestUrl.searchParams.get('type'));
  const category = safeListToken(requestUrl.searchParams.get('category'));
  const country = safeListToken(requestUrl.searchParams.get('country'));
  const yearValue = Number(requestUrl.searchParams.get('year') || 0);
  const year = Number.isInteger(yearValue) && yearValue >= 1900 && yearValue <= 2200 ? yearValue : 0;
  const page = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get('page') || 1) || 1));
  const sortField = requestUrl.searchParams.get('sortField') === 'year' ? 'year' : 'updated_at';
  const sortType = requestUrl.searchParams.get('sortType') === 'asc' ? 'asc' : 'desc';
  const pageSize = 36;
  const offset = (page - 1) * pageSize;
  const canonical = new URLSearchParams({
    type, category, country, year: year ? String(year) : '', page: String(page), sortField, sortType,
  }).toString();
  const liveKey = new Request(`${SITE_URL}/__api-cache/movies/v2-no-ophim?${canonical}`, { method: 'GET' });
  const staleKey = new Request(`${SITE_URL}/__api-cache/movies-stale/v2-no-ophim?${canonical}`, { method: 'GET' });

  if (typeof caches !== 'undefined') {
    const cached = await caches.default.match(liveKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-KhoPhim-Movie-List-Cache', 'HIT');
      return new Response(request.method === 'HEAD' ? null : cached.body, { status: cached.status, headers });
    }
  }

  const params = new URLSearchParams({
    select: MOVIE_LIST_SELECT,
    is_published: 'eq.true',
    offset: String(offset),
    limit: String(pageSize),
  });
  const typeValues = movieListTypeValues(type);
  if (typeValues.length === 1) params.set('type', `eq.${typeValues[0]}`);
  else if (typeValues.length > 1) params.set('type', `in.(${typeValues.join(',')})`);
  if (category) params.set('category', `cs.${JSON.stringify([{ slug: category }])}`);
  if (country) params.set('country', `cs.${JSON.stringify([{ slug: country }])}`);
  if (year) params.set('year', `eq.${year}`);
  params.set('order', sortField === 'year'
    ? `year.${sortType}.nullslast,updated_at.desc.nullslast`
    : `updated_at.${sortType}.nullslast`);

  try {
    const upstream = await fetch(`${SUPABASE_REST_BASE}/movies?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        Prefer: 'count=estimated',
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!upstream.ok) throw new Error(`movies returned ${upstream.status}`);
    const items = await upstream.json();
    const safeItems = (Array.isArray(items) ? items : []).filter((item) => !isRetiredOphimCatalogItem(item));
    const contentRange = upstream.headers.get('content-range') || '';
    const totalText = contentRange.split('/')[1] || '';
    const parsedTotal = Number(totalText);
    const totalItems = Number.isFinite(parsedTotal) ? parsedTotal : offset + safeItems.length;
    const body = JSON.stringify({
      status: true,
      items: safeItems,
      pagination: {
        currentPage: page,
        totalItems,
        totalItemsPerPage: pageSize,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    });
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900, stale-if-error=86400',
      'X-KhoPhim-Movie-List-Cache': 'MISS',
      ...SECURITY_HEADERS,
    });
    const response = new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
    if (typeof caches !== 'undefined') {
      const staleHeaders = new Headers(headers);
      staleHeaders.set('Cache-Control', 'public, max-age=86400');
      contextWaitUntil(context, Promise.all([
        caches.default.put(liveKey, new Response(body, { status: 200, headers })),
        caches.default.put(staleKey, new Response(body, { status: 200, headers: staleHeaders })),
      ]));
    }
    return response;
  } catch {
    if (typeof caches !== 'undefined') {
      const stale = await caches.default.match(staleKey);
      if (stale) {
        const headers = new Headers(stale.headers);
        headers.set('X-KhoPhim-Movie-List-Cache', 'STALE');
        return new Response(request.method === 'HEAD' ? null : stale.body, { status: stale.status, headers });
      }
    }
    return new Response(JSON.stringify({ status: false, items: [], pagination: { currentPage: page, totalItems: 0, totalItemsPerPage: pageSize, totalPages: 1 } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }
}

async function proxyHome(request, context) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }

  const requestUrl = new URL(request.url);
  const requestedSections = Array.from(new Set(
    String(requestUrl.searchParams.get('sections') || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => HOME_SECTION_KEYS.has(value)),
  )).sort();
  const sections = requestedSections.length > 0
    ? requestedSections
    : ['au-my', 'han-quoc', 'hoat-hinh', 'phim-bo', 'phim-le', 'trending'];
  const sectionKey = sections.join(',');
  const liveKey = new Request(`${SITE_URL}/__api-cache/home/v4-no-ophim?sections=${encodeURIComponent(sectionKey)}`, { method: 'GET' });
  const staleKey = new Request(`${SITE_URL}/__api-cache/home-stale/v4-no-ophim?sections=${encodeURIComponent(sectionKey)}`, { method: 'GET' });

  if (typeof caches !== 'undefined') {
    const cached = await caches.default.match(liveKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-KhoPhim-Home-Cache', 'HIT');
      return new Response(request.method === 'HEAD' ? null : cached.body, { status: cached.status, headers });
    }
  }

  const upstreamUrl = new URL(`${SUPABASE_FUNCTION_BASE}/home-proxy`);
  upstreamUrl.searchParams.set('sections', sectionKey);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
        ...(context?.env?.MOVIE_DETAIL_PROXY_SECRET
          ? { 'X-KhoPhim-Proxy-Secret': context.env.MOVIE_DETAIL_PROXY_SECRET }
          : {}),
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 900,
        cacheKey: `${SUPABASE_FUNCTION_BASE}/home-proxy?sections=${encodeURIComponent(sectionKey)}&edge=v4-no-ophim`,
      },
      signal: AbortSignal.timeout(6500),
    });
    if (!upstream.ok) throw new Error(`home-proxy returned ${upstream.status}`);

    const upstreamPayload = sanitizeHomePayload(await upstream.json());
    const responseBody = JSON.stringify(upstreamPayload);
    const headers = new Headers(upstream.headers);
    headers.delete('Set-Cookie');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=120, s-maxage=900, stale-while-revalidate=3600, stale-if-error=86400');
    headers.set('X-KhoPhim-Home-Cache', 'MISS');
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    const response = new Response(responseBody, { status: upstream.status, headers });

    if (typeof caches !== 'undefined') {
      const liveResponse = response.clone();
      const staleResponse = response.clone();
      const staleHeaders = new Headers(staleResponse.headers);
      staleHeaders.set('Cache-Control', 'public, max-age=86400');
      contextWaitUntil(context, Promise.all([
        caches.default.put(liveKey, liveResponse),
        caches.default.put(staleKey, new Response(staleResponse.body, { status: staleResponse.status, headers: staleHeaders })),
      ]));
    }
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers: response.headers });
  } catch {
    if (typeof caches !== 'undefined') {
      const stale = await caches.default.match(staleKey);
      if (stale) {
        const headers = new Headers(stale.headers);
        headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
        headers.set('X-KhoPhim-Home-Cache', 'STALE');
        return new Response(request.method === 'HEAD' ? null : stale.body, { status: stale.status, headers });
      }
    }
    return new Response(JSON.stringify({ status: false, source: 'unavailable', sections: {} }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=15, stale-if-error=300',
        'Retry-After': '15',
        ...SECURITY_HEADERS,
      },
    });
  }
}

async function proxyPlayerSourceHealth(request, context) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
    });
  }

  const cacheKey = new Request(`${SITE_URL}/__api-cache/player-source-health/v3?hours=1`, { method: 'GET' });
  if (typeof caches !== 'undefined') {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-KhoPhim-Source-Health-Cache', 'HIT');
      return new Response(request.method === 'HEAD' ? null : cached.body, { status: cached.status, headers });
    }
  }

  try {
    const upstream = await fetch(`${SUPABASE_FUNCTION_BASE}/player-source-health?hours=1&limit=2000`, {
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
      },
      cf: { cacheEverything: true, cacheTtl: 300 },
      signal: AbortSignal.timeout(3500),
    });
    if (!upstream.ok) throw new Error(`player-source-health returned ${upstream.status}`);
    const headers = new Headers(upstream.headers);
    headers.delete('Set-Cookie');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=900, stale-if-error=3600');
    headers.set('X-KhoPhim-Source-Health-Cache', 'MISS');
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    const response = new Response(upstream.body, { status: upstream.status, headers });
    if (typeof caches !== 'undefined') contextWaitUntil(context, caches.default.put(cacheKey, response.clone()));
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers: response.headers });
  } catch {
    return new Response(JSON.stringify({ ok: false, bad_hosts: [], cluster_outages: [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=60',
        'X-KhoPhim-Source-Health-Cache': 'SAFE-FALLBACK',
        ...SECURITY_HEADERS,
      },
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

function putCachedPrerender(context, cacheKey, staleCacheKey, response, request) {
  if (request.method !== 'GET' || typeof caches === 'undefined' || response.status !== 200) return;
  if ((response.headers.get('X-Robots-Tag') || '').toLowerCase().includes('noindex')) return;
  const cachedResponse = response.clone();
  const staleHeaders = new Headers(response.headers);
  staleHeaders.set('Cache-Control', 'public, max-age=2592000');
  staleHeaders.set('X-Prerender-Stale-Snapshot', '1');
  const staleResponse = new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers: staleHeaders,
  });
  contextWaitUntil(context, Promise.all([
    caches.default.put(cacheKey, cachedResponse),
    caches.default.put(staleCacheKey, staleResponse),
  ]));
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

const ADSTERRA_BANNER_FRAMES = new Map([
  ['/_ads/banner-728x90.html', { key: 'bdb00121f91598ecc645ad05155f9af9', width: 728, height: 90 }],
  ['/_ads/banner-320x50.html', { key: 'b4a6445f28b35fc2a47190d98ebe6af6', width: 320, height: 50 }],
  ['/_ads/banner-300x250.html', { key: 'b9e4fcb9b31cf4b3ba07f94fd96f3290', width: 300, height: 250 }],
]);
const ADSTERRA_BANNERS_ENABLED = false;

function adsterraBannerFrameResponse(request, pathname) {
  const ad = ADSTERRA_BANNER_FRAMES.get(pathname);
  if (!ad) return null;
  if (!ADSTERRA_BANNERS_ENABLED) {
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const options = JSON.stringify({
    key: ad.key,
    format: 'iframe',
    height: ad.height,
    width: ad.width,
    params: {},
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><style>html,body{width:${ad.width}px;height:${ad.height}px;margin:0;overflow:hidden;background:transparent}</style></head><body><script>window.atOptions=${options};</script><script src="https://www.highperformanceformat.com/${ad.key}/invoke.js"></script></body></html>`;

  return new Response(request.method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://www.highperformanceformat.com; style-src 'unsafe-inline'; img-src data: https:; connect-src https:; frame-src about: https:; base-uri 'none'; form-action 'none'; frame-ancestors https://khophim.org https://www.khophim.org https://mhophim.com https://www.mhophim.com https://movie-site-eds.pages.dev https://*.movie-site-eds.pages.dev",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const isLocalDevelopmentHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';

  const adFrameResponse = adsterraBannerFrameResponse(request, pathname);
  if (adFrameResponse) return adFrameResponse;

  if (url.hostname === 'mhophim.com' || url.hostname === 'www.mhophim.com') {
    return handleMhophimRequest(context, url, pathname);
  }

  if (/^\/mhophim(?:\/|$)/i.test(pathname) || /^\/mhophim-assets\//i.test(pathname)) {
    return canonicalRedirect(url, '/');
  }

  if (!isLocalDevelopmentHost && (url.hostname === 'www.khophim.org' || url.protocol === 'http:')) {
    return canonicalRedirect(url, pathname);
  }

  if (shouldShowMaintenance(request, pathname)) {
    return maintenanceResponse(request);
  }

  // Historical cards emitted ?source=ophim even though the canonical detail
  // pipeline now selects healthy sources itself. Redirect those variants so
  // Google and browser caches converge on one movie-detail URL.
  if (/^\/phim\/[^/]+\/?$/.test(pathname) && url.searchParams.has('source')) {
    url.searchParams.delete('source');
    return canonicalRedirect(url, pathname);
  }

  const consolidatedSeoPath = CONSOLIDATED_SEO_PATHS.get(pathname.replace(/\/+$/, '') || '/');
  if (consolidatedSeoPath) {
    url.search = '';
    return canonicalRedirect(url, consolidatedSeoPath);
  }

  const genrePathMatch = /^\/the-loai\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (genrePathMatch && !GENRE_DISPLAY_NAMES[genrePathMatch[1]]) {
    const canonical = `${SITE_URL}/the-loai/${genrePathMatch[1]}`;
    return new Response(renderHtml({
      title: 'Không tìm thấy thể loại phim | KhoPhim',
      description: 'Thể loại phim này không tồn tại hoặc không còn được xuất bản trên KhoPhim.',
      canonical,
      h1: 'Không tìm thấy thể loại phim',
      body: `<p><a href="${SITE_URL}/phim-moi-cap-nhat">Xem phim mới cập nhật</a> hoặc <a href="${SITE_URL}/sitemap">mở sơ đồ trang web</a>.</p>`,
      robots: 'noindex, follow',
    }), {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=900, s-maxage=3600',
        'X-Robots-Tag': 'noindex, follow',
        ...SECURITY_HEADERS,
      },
    });
  }

  if (isDmcaRemovedPath(pathname)) {
    return removedForCopyrightResponse();
  }

  if (isBlockedCrawler(request.headers.get('user-agent') || '')) {
    return blockedCrawlerResponse();
  }

  if (pathname === '/filter') {
    const genre = String(url.searchParams.get('genre') || '').toLowerCase();
    const onlyGenreFilter = /^[a-z0-9-]+$/.test(genre)
      && [...url.searchParams.keys()].every((key) => key === 'genre');
    if (onlyGenreFilter) {
      url.search = '';
      return canonicalRedirect(url, `/the-loai/${genre}`);
    }

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
    pathname === '/sitemap-movies-archive.xml' ||
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

  if (pathname === '/api/time') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
      });
    }
    const body = JSON.stringify({ now: new Date().toISOString() });
    return new Response(request.method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=5, s-maxage=5',
        ...SECURITY_HEADERS,
      },
    });
  }

  if (pathname === '/internal/nguonc-detail') {
    return proxyNguoncDetail(request, context);
  }

  if (pathname === '/internal/nguonc-catalog') {
    return proxyNguoncCollection(request, context, 'catalog');
  }

  if (pathname === '/internal/nguonc-search') {
    return proxyNguoncCollection(request, context, 'search');
  }

  if (pathname === '/api/search') {
    return proxySearch(request, context);
  }

  if (pathname === '/api/movies') {
    return proxyMovieList(request, context);
  }

  if (pathname === '/api/home') {
    return proxyHome(request, context);
  }

  if (pathname === '/api/player-source-health') {
    return proxyPlayerSourceHealth(request, context);
  }

  if (pathname === '/internal/ssplay-resolve') {
    return resolveSsplayEmbed(request);
  }

  const catalogIndexMatch = /^\/kho-phim\/?$/.exec(pathname);
  const catalogPageMatch = /^\/kho-phim\/trang\/(\d+)\/?$/.exec(pathname);
  if (catalogIndexMatch || catalogPageMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD', ...SECURITY_HEADERS },
      });
    }
    const canonicalPath = catalogPageMatch
      ? `/kho-phim/trang/${Number(catalogPageMatch[1])}`
      : '/kho-phim';
    if (pathname !== canonicalPath || url.search) {
      url.search = '';
      return canonicalRedirect(url, canonicalPath);
    }
    if (catalogPageMatch) {
      const page = Number(catalogPageMatch[1]);
      if (!Number.isInteger(page) || page < 1 || page > 1000) {
        return catalogResponse(request, renderHtml({
          title: 'Không tìm thấy trang kho phim | KhoPhim',
          description: 'Trang kho phim này không tồn tại.',
          canonical: `${SITE_URL}${canonicalPath}`,
          h1: 'Không tìm thấy trang kho phim',
          body: `<p><a href="${SITE_URL}/kho-phim">Trở về toàn bộ kho phim</a>.</p>`,
          robots: 'noindex, follow',
        }), { status: 404, source: 'catalog-not-found' });
      }
      return renderMovieCatalogPage(request, context, page);
    }
    return renderMovieCatalogIndex(request, context);
  }

  if (isStaticAsset(pathname)) {
    return serveStaticAsset(context, pathname);
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (isBot(userAgent) && shouldPrerender(pathname)) {
    const movieMatch = /^\/phim\/([^/?#]+)/.exec(pathname);
    if (movieMatch) {
      const slug = decodeURIComponent(movieMatch[1]);
      const cacheKey = new Request(`${SITE_URL}/__seo-prerender/${SEO_PRERENDER_VERSION}/phim/${encodeURIComponent(slug)}`, { method: 'GET' });
      const staleCacheKey = new Request(`${SITE_URL}/__seo-prerender-stale/${SEO_PRERENDER_VERSION}/phim/${encodeURIComponent(slug)}`, { method: 'GET' });
      const cachedMovieResponse = await getCachedPrerender(cacheKey, request);
      if (cachedMovieResponse) return cachedMovieResponse;
      const supabaseLookup = await fetchSupabaseMovie(slug, context)
        .catch(() => ({ movie: null, unavailable: true, notFound: false }));
      let movie = supabaseLookup.movie;
      // OPhim is retired as a catalogue/playback provider. SEO rendering uses
      // the canonical Singapore record only, so a provider outage can never
      // resurrect retired metadata or playback URLs into the public cache.
      if (!movie && supabaseLookup.unavailable) {
        const staleMovieResponse = await getCachedPrerender(staleCacheKey, request);
        if (staleMovieResponse) {
          const headers = new Headers(staleMovieResponse.headers);
          headers.set('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400');
          headers.set('X-Prerender-Cache', 'STALE-FALLBACK');
          return new Response(request.method === 'HEAD' ? null : staleMovieResponse.body, {
            status: staleMovieResponse.status,
            statusText: staleMovieResponse.statusText,
            headers,
          });
        }
      }
      const relatedMovies = movie
        ? await fetchContextualMovieLinks(context, movie, slug)
        : [];
      const movieResponse = movie
        ? renderMoviePrerender(pathname, movie, slug, relatedMovies)
        : (supabaseLookup.unavailable
          ? renderMovieTemporarilyUnavailable(pathname, slug)
          : renderMovieNotFound(pathname, slug));
      putCachedPrerender(context, cacheKey, staleCacheKey, movieResponse, request);
      return movieResponse;
    }
    const staticCacheSuffix = url.searchParams.get('page') && [...url.searchParams.keys()].every((key) => key === 'page')
      ? `?page=${url.searchParams.get('page')}`
      : '';
    const staticCacheKey = new Request(`${SITE_URL}/__seo-prerender/${SEO_PRERENDER_VERSION}${pathname}${staticCacheSuffix}`);
    const staticStaleKey = new Request(`${SITE_URL}/__seo-prerender-stale/${SEO_PRERENDER_VERSION}${pathname}${staticCacheSuffix}`);
    const cachedStaticResponse = await getCachedPrerender(staticCacheKey, request);
    if (cachedStaticResponse) return cachedStaticResponse;
    const staticResponse = await renderStaticPrerender(request, context);
    if (staticResponse) {
      putCachedPrerender(context, staticCacheKey, staticStaleKey, staticResponse, request);
      return staticResponse;
    }
  }

  if (pathname === '/') {
    const response = await context.next();
    return withHeaders(response, pathname);
  }

  return serveSpaIndex(context, request, pathname);
}





