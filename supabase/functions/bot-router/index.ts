import type { Context } from 'https://edge.netlify.com';

const PRERENDER_URL = 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/seo-prerender';

// Security headers — inject vào MỌI response (kể cả non-bot)
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://kit.fontawesome.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https: http:; media-src 'self' blob: https: http:; connect-src 'self' https: wss:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'",
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
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p));
}

function shouldPrerender(pathname: string): boolean {
  return PRERENDER_PATHS.some((pattern) => pattern.test(pathname));
}

/** Inject security headers vào response object */
function injectSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
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

  // Không phải bot → serve SPA bình thường nhưng vẫn inject security headers
  if (!isBot(userAgent) || !shouldPrerender(pathname)) {
    const response = await context.next();
    return injectSecurityHeaders(response);
  }

  // Proxy sang prerender edge function
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
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=900, s-maxage=3600',
          'X-Prerendered': 'true',
          'X-Prerender-Path': pathname,
          'Link': `<https://khophim.org${pathname}>; rel="canonical"`,
          'X-Robots-Tag': 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
          ...SECURITY_HEADERS,
        },
      });
    }
  } catch {
    // Nếu prerender lỗi/timeout → fallback về SPA bình thường
  }

  // Fallback: serve SPA + inject security headers
  const fallback = await context.next();
  return injectSecurityHeaders(fallback);
}

export const config = {
  path: '/*',
};
