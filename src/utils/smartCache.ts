type CacheStorageLike = Storage;

type CacheRule = {
  prefix: string;
  ttl: number;
  maxEntries: number;
};

type StoredEntry = {
  ts?: number;
};

const MINUTE = 60 * 1000;

const SESSION_CACHE_RULES: CacheRule[] = [
  { prefix: 'kp_home_proxy_', ttl: 2 * MINUTE, maxEntries: 2 },
  { prefix: 'kp_suggest_', ttl: 2 * MINUTE, maxEntries: 30 },
  { prefix: 'search_v', ttl: 2 * MINUTE, maxEntries: 30 },
  { prefix: 'kp_supabase_search_index_', ttl: 30 * MINUTE, maxEntries: 2 },
  { prefix: 'kp_genre_', ttl: 15 * MINUTE, maxEntries: 8 },
  { prefix: 'kp_country_', ttl: 15 * MINUTE, maxEntries: 8 },
  { prefix: 'kp_anime_', ttl: 15 * MINUTE, maxEntries: 8 },
  { prefix: 'kp_mynam_', ttl: 15 * MINUTE, maxEntries: 8 },
  { prefix: 'kp_phimma_', ttl: 15 * MINUTE, maxEntries: 8 },
  { prefix: 'kp_trending_', ttl: 10 * MINUTE, maxEntries: 2 },
  { prefix: 'kp_new_movies_', ttl: 10 * MINUTE, maxEntries: 2 },
  { prefix: 'detail_', ttl: 5 * MINUTE, maxEntries: 20 },
];

const LEGACY_SESSION_KEYS = [
  'kp_home_proxy_v2',
  'kp_home_proxy_v3',
  'kp_home_proxy_v4',
  'kp_home_proxy_v5',
  'kp_cinema_v1',
  'kp_trending_v5',
  'kp_new_movies_v5',
  'kp_supabase_search_index_v3',
];

let lastPruneAt = 0;
const PRUNE_COOLDOWN_MS = 60_000;

function safeStorage(type: 'session' | 'local'): CacheStorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return type === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function parseEntry(raw: string | null): StoredEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredEntry;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function matchingRule(key: string): CacheRule | null {
  return SESSION_CACHE_RULES.find((rule) => key.startsWith(rule.prefix)) ?? null;
}

function removeLegacyStorageKeys(): void {
  const session = safeStorage('session');
  const local = safeStorage('local');
  for (const key of LEGACY_SESSION_KEYS) {
    try { session?.removeItem(key); } catch { /* best effort */ }
    try { local?.removeItem(key); } catch { /* best effort */ }
  }
}

export function pruneSmartClientCaches(options: { force?: boolean } = {}): void {
  const now = Date.now();
  if (!options.force && now - lastPruneAt < PRUNE_COOLDOWN_MS) return;
  lastPruneAt = now;

  removeLegacyStorageKeys();

  const session = safeStorage('session');
  if (!session) return;

  const buckets = new Map<string, Array<{ key: string; ts: number }>>();

  try {
    for (const key of Object.keys(session)) {
      const rule = matchingRule(key);
      if (!rule) continue;

      const entry = parseEntry(session.getItem(key));
      const ts = Number(entry?.ts || 0);
      if (!Number.isFinite(ts) || ts <= 0 || now - ts > rule.ttl) {
        session.removeItem(key);
        continue;
      }

      const bucket = buckets.get(rule.prefix) ?? [];
      bucket.push({ key, ts });
      buckets.set(rule.prefix, bucket);
    }

    for (const rule of SESSION_CACHE_RULES) {
      const bucket = buckets.get(rule.prefix);
      if (!bucket || bucket.length <= rule.maxEntries) continue;
      bucket
        .sort((a, b) => b.ts - a.ts)
        .slice(rule.maxEntries)
        .forEach((entry) => session.removeItem(entry.key));
    }
  } catch {
    // Cleanup must never block page startup.
  }
}

export function setSmartSessionCache(key: string, value: string): void {
  const session = safeStorage('session');
  if (!session) return;
  try {
    session.setItem(key, value);
  } catch {
    pruneSmartClientCaches({ force: true });
    try { session.setItem(key, value); } catch { /* quota */ }
  }
}

export function removeSmartSessionCache(key: string): void {
  try { safeStorage('session')?.removeItem(key); } catch { /* best effort */ }
}
