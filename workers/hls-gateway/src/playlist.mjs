function normalizeObjectKey(value) {
  const segments = [];
  for (const segment of String(value || '').replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) throw new Error('playlist reference escapes its directory');
      segments.pop();
      continue;
    }
    if (segment.includes('\0')) throw new Error('invalid object key');
    segments.push(segment);
  }
  if (segments.length === 0) throw new Error('empty object key');
  return segments.join('/');
}

function decodeUriPath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error('invalid encoded playlist reference');
  }
}

function encodeObjectKey(key) {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function resolveLocalReference(reference, playlistKey) {
  const trimmed = String(reference || '').trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return null;

  const withoutFragment = trimmed.split('#', 1)[0];
  const pathOnly = withoutFragment.split('?', 1)[0];
  const decodedPath = decodeUriPath(pathOnly);
  const playlistDirectory = playlistKey.includes('/') ? playlistKey.slice(0, playlistKey.lastIndexOf('/') + 1) : '';
  return normalizeObjectKey(decodedPath.startsWith('/') ? decodedPath.slice(1) : `${playlistDirectory}${decodedPath}`);
}

function protectedUrlForKey(key) {
  return `/hls/${encodeObjectKey(key)}`;
}

function rewriteReference(reference, playlistKey, scope) {
  const key = resolveLocalReference(reference, playlistKey);
  if (!key) return reference;
  if (!key.startsWith(scope)) throw new Error('playlist reference is outside the signed scope');
  return protectedUrlForKey(key);
}

export function rewriteMediaPlaylist(text, playlistKey, scope) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (!trimmed.startsWith('#')) return rewriteReference(trimmed, playlistKey, scope);
    return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewriteReference(uri, playlistKey, scope)}"`);
  }).join(newline);
}
