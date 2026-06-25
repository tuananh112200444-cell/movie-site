const links = [
  { server: 'SV 1 / SV 3', url: 'https://ssplay.net/v/580664981984429.html' },
  { server: 'SV 2 / SV 4', url: 'https://abyssplayer.com/OFyQpXvIv' },
];

for (const link of links) {
  const started = Date.now();
  try {
    const response = await fetch(link.url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'Referer': 'https://blvietsub.com/',
      },
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text().catch(() => '');
    const lower = text.toLowerCase();
    const indicators = {
      hasVideo: /video|m3u8|mp4|jwplayer|player|iframe|source/.test(lower),
      hasErrorText: /not found|404|removed|deleted|error|unavailable|not exist|dmca|blocked/.test(lower),
      hasCloudflare: /cloudflare|cf-browser-verification|just a moment/.test(lower),
      title: (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
    console.log(JSON.stringify({
      server: link.server,
      url: link.url,
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      elapsed_ms: Date.now() - started,
      bytes: text.length,
      ...indicators,
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      server: link.server,
      url: link.url,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - started,
    }, null, 2));
  }
}

