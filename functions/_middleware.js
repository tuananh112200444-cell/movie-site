const SITE_URL = 'https://khophim.org';
const CANONICAL_REDIRECT_HOSTS = new Set(['www.khophim.org', 'mhophim.com', 'www.mhophim.com']);

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (CANONICAL_REDIRECT_HOSTS.has(url.hostname) || url.protocol === 'http:') {
    return new Response(null, {
      status: 301,
      headers: {
        Location: `${SITE_URL}${url.pathname}${url.search}`,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-Robots-Tag': 'noindex, follow',
        'X-Canonical-Host': 'khophim.org',
      },
    });
  }

  return context.next();
}
