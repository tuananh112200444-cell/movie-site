function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
}

function firstMatch(value, pattern) {
  return decodeHtml(String(value || '').match(pattern)?.[1] || '').trim();
}

function isSafeImageCandidate(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^(?:data:|javascript:|about:)/i.test(trimmed)) return false;
  if (/^(?:null|undefined)$/i.test(trimmed)) return false;
  return true;
}

function normalizeImageUrl(value = '', baseUrl = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed || !isSafeImageCandidate(trimmed)) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) {
    try {
      return new URL(trimmed, baseUrl || 'https://example.com').toString();
    } catch {
      return trimmed;
    }
  }
  if (/^\.?\//.test(trimmed)) {
    try {
      return new URL(trimmed, baseUrl || 'https://example.com').toString();
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function extractImageFromHtml(html = '', baseUrl = '') {
  const candidates = [];
  const ogImage = firstMatch(html, /<meta[^>]+(?:property|name)=['"]og:image['"][^>]+content=['"]([^'"]+)['"][^>]*>/i);
  const twitterImage = firstMatch(html, /<meta[^>]+(?:property|name)=['"]twitter:image['"][^>]+content=['"]([^'"]+)['"][^>]*>/i);
  const itemImage = firstMatch(html, /<meta[^>]+(?:property|name)=['"]image['"][^>]+content=['"]([^'"]+)['"][^>]*>/i);
  const genericImage = firstMatch(html, /<img[^>]+src=['"]([^'"]+)['"][^>]*>/i);

  if (isSafeImageCandidate(ogImage)) candidates.push(ogImage);
  if (isSafeImageCandidate(twitterImage)) candidates.push(twitterImage);
  if (isSafeImageCandidate(itemImage)) candidates.push(itemImage);
  if (isSafeImageCandidate(genericImage)) candidates.push(genericImage);

  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, baseUrl);
    if (normalized) return normalized;
  }

  return '';
}
