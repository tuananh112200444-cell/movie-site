import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
const BOT_PATTERNS = [
  'googlebot',
  'google-inspectiontool',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'sogou',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'telegrambot',
  'applebot',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'rogerbot',
  'screaming frog',
  'sitebulb',
  'dotbot',
  'petalbot',
  'bytespider'
];
function isBot(userAgent) {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p)=>ua.includes(p));
}
serve(async (request)=>{
  const userAgent = request.headers.get('user-agent') ?? '';
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map|json|txt|xml)$/i)) {
    return new Response(null, {
      status: 204,
      headers: SECURITY_HEADERS
    });
  }
  if (!isBot(userAgent)) {
    return new Response(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=${request.url}"><title>KhoPhim</title></head><body></body></html>`, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...SECURITY_HEADERS
      }
    });
  }
  return new Response(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>KhoPhim</title>
  <meta name="robots" content="index, follow">
  <meta http-equiv="refresh" content="0;url=${request.url}">
</head>
<body><p>Redirecting...</p></body>
</html>`, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Prerender-Handled-By': 'netlify-edge',
      ...SECURITY_HEADERS
    }
  });
});
