function collectConfiguredPublicKeys(): Set<string> {
  const keys = new Set<string>();
  const legacyAnonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
  if (legacyAnonKey) keys.add(legacyAnonKey);

  const rawPublishableKeys = String(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '').trim();
  if (!rawPublishableKeys) return keys;
  try {
    const parsed = JSON.parse(rawPublishableKeys) as unknown;
    const visit = (value: unknown) => {
      if (typeof value === 'string') {
        const key = value.trim();
        if (key) keys.add(key);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(visit);
      }
    };
    visit(parsed);
  } catch {
    // Hosted projects expose a JSON dictionary. Fail closed if a custom/self-
    // hosted environment provides an invalid value.
  }
  return keys;
}

export function hasValidPublishableApiKey(req: Request): boolean {
  const supplied = String(req.headers.get('apikey') || '').trim();
  if (!supplied) return false;
  return collectConfiguredPublicKeys().has(supplied);
}

export function withPublicReadCors(response: Response, origin: string | null): Response {
  const normalized = String(origin || '').trim().toLowerCase();
  const allowed = normalized === 'https://khophim.org'
    || normalized === 'https://www.khophim.org'
    || /^https:\/\/[a-z0-9-]+\.movie-site-eds\.pages\.dev$/.test(normalized)
    || /^http:\/\/(?:localhost|127\.0\.0\.1):(?:3000|4173|5173)$/.test(normalized);
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowed ? normalized : 'https://khophim.org');
  headers.set('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
