const BAD_SOURCE_HOSTS_KEY = 'khophim.bad-source-hosts.v2';
const SOURCE_HEALTH_LAST_FETCH_KEY = 'khophim.source-health.last-fetch.v2';
const SOURCE_HEALTH_FETCH_TTL_MS = 5 * 60 * 1000;
// This refresh runs in the background; the watch page only waits 250ms before
// selecting its first source. Allow the Singapore rollup enough time to return
// during peak load without delaying player startup.
const SOURCE_HEALTH_TIMEOUT_MS = 8000;
const SOURCE_HEALTH_PENALTY_TTL_MS = 30 * 60 * 1000;
export const SOURCE_HEALTH_UPDATED_EVENT = 'kp:source-health-updated';
let sourceHealthInflight: Promise<void> | null = null;

type SourceHealthHost = {
  host?: string;
  cluster?: string;
  score?: number;
  critical?: number;
  success?: number;
  failure_rate?: number;
};

type SourceHealthResponse = {
  ok?: boolean;
  bad_hosts?: SourceHealthHost[];
  cluster_outages?: Array<{
    cluster?: string;
    affected_hosts?: number;
    critical?: number;
  }>;
};

function canUseBrowserStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readJsonMap(key: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as Record<string, number> : {};
  } catch {
    return {};
  }
}

function writeJsonMap(key: string, value: Record<string, number>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort only; playback still works without persisted hints.
  }
}

function normalizeHost(host: string | undefined): string {
  return String(host || '').trim().toLowerCase().replace(/^www\./, '');
}

function getSourceCluster(urlOrHost?: string): string {
  let host = normalizeHost(urlOrHost);
  try {
    host = normalizeHost(new URL(String(urlOrHost || '')).hostname);
  } catch {
    // Callers may already provide a hostname.
  }
  if (/opstream|ophim/.test(host)) return 'ophim';
  if (/phimapi|kkphim|phim1280/.test(host)) return 'kkphim';
  return host;
}

function shouldFetchSourceHealth(): boolean {
  if (!canUseBrowserStorage()) return false;
  const lastFetch = Number(window.localStorage.getItem(SOURCE_HEALTH_LAST_FETCH_KEY) || 0);
  return !lastFetch || Date.now() - lastFetch > SOURCE_HEALTH_FETCH_TTL_MS;
}

async function fetchPlayerSourceHealth(): Promise<void> {
  if (!shouldFetchSourceHealth()) return;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SOURCE_HEALTH_TIMEOUT_MS);

  try {
    // A provider can recover quickly. One hour still contains enough
    // independent viewer evidence to detect an active outage, while avoiding
    // a six-hour-old incident steering new viewers away from a recovered CDN.
    const supabaseUrl = String(import.meta.env.VITE_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    const publishableKey = String(import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '');
    const endpoints = [
      { url: '/api/player-source-health?hours=1&limit=2000', headers: { Accept: 'application/json' } },
      ...(supabaseUrl && publishableKey ? [{
        url: `${supabaseUrl}/functions/v1/player-source-health?hours=1&limit=2000`,
        headers: { Accept: 'application/json', apikey: publishableKey },
      }] : []),
    ];
    let response: Response | null = null;
    for (const endpoint of endpoints) {
      const candidate = await fetch(endpoint.url, {
        method: 'GET',
        signal: controller.signal,
        headers: endpoint.headers,
      });
      const contentType = candidate.headers.get('content-type') || '';
      if (candidate.ok && contentType.toLowerCase().includes('application/json')) {
        response = candidate;
        break;
      }
    }
    if (!response) return;

    const payload = await response.json() as SourceHealthResponse;
    if (!payload.ok || !Array.isArray(payload.bad_hosts)) return;

    const now = Date.now();
    // The response is the complete current outage snapshot. Rebuild rather
    // than extend the old map, otherwise a recovered host stays blocked for
    // 30 minutes even after fresh success evidence removed it from bad_hosts.
    const map: Record<string, number> = {};
    for (const item of payload.bad_hosts) {
      const host = normalizeHost(item.host);
      if (!host || Number(item.critical || 0) < 2 || Number(item.score || 0) < 5) continue;
      map[host] = now;
      // Keep the penalty scoped to the exact host. One failing CDN shard must
      // not demote every source from the same provider.
    }
    for (const item of payload.cluster_outages ?? []) {
      const cluster = normalizeHost(item.cluster);
      if (!cluster || Number(item.affected_hosts || 0) < 3 || Number(item.critical || 0) < 12) continue;
      map[`cluster:${cluster}`] = now;
    }
    writeJsonMap(BAD_SOURCE_HOSTS_KEY, map);
    window.localStorage.setItem(SOURCE_HEALTH_LAST_FETCH_KEY, String(now));
    window.dispatchEvent(new CustomEvent(SOURCE_HEALTH_UPDATED_EVENT));
  } catch {
    // Silent by design: source health is only a hint, never a startup dependency.
  } finally {
    window.clearTimeout(timeout);
  }
}

export function warmPlayerSourceHealth(): Promise<void> {
  if (!shouldFetchSourceHealth()) return Promise.resolve();
  if (sourceHealthInflight) return sourceHealthInflight;
  sourceHealthInflight = fetchPlayerSourceHealth().finally(() => {
    sourceHealthInflight = null;
  });
  return sourceHealthInflight;
}

export function isRecentlyBadSourceHost(urlOrHost?: string): boolean {
  if (!canUseBrowserStorage() || !urlOrHost) return false;
  let host = normalizeHost(urlOrHost);
  try {
    host = normalizeHost(new URL(urlOrHost).hostname);
  } catch {
    // The caller may already provide a hostname.
  }
  const map = readJsonMap(BAD_SOURCE_HOSTS_KEY);
  const isFreshPenalty = (markedAt: number) =>
    markedAt > 0 && Date.now() - markedAt < SOURCE_HEALTH_PENALTY_TTL_MS;
  if (isFreshPenalty(Number(map[host] || 0))) return true;

  // Cluster keys are only written after independent failures across multiple
  // hosts. Honouring them here closes the short window where a new watch page
  // could otherwise start on another known-bad OPhim/KKPhim shard.
  const cluster = getSourceCluster(host);
  return Boolean(cluster) && isFreshPenalty(Number(map[`cluster:${cluster}`] || 0));
}

/**
 * Exact-host outage evidence is strong enough to stop a new playback attempt.
 * Keep this separate from provider-cluster hints: a cluster warning may still
 * have healthy shards, while an exact hostname has independent viewer errors.
 */
export function isRecentlyBadExactSourceHost(urlOrHost?: string): boolean {
  if (!canUseBrowserStorage() || !urlOrHost) return false;
  let host = normalizeHost(urlOrHost);
  try {
    host = normalizeHost(new URL(urlOrHost).hostname);
  } catch {
    // The caller may already provide a hostname.
  }
  const map = readJsonMap(BAD_SOURCE_HOSTS_KEY);
  const markedAt = Number(map[host] || 0);
  return markedAt > 0 && Date.now() - markedAt < SOURCE_HEALTH_PENALTY_TTL_MS;
}

export function isRecentlyBadSourceCluster(urlOrHost?: string): boolean {
  if (!canUseBrowserStorage() || !urlOrHost) return false;
  let host = normalizeHost(urlOrHost);
  try {
    host = normalizeHost(new URL(urlOrHost).hostname);
  } catch {
    // The caller may already provide a hostname.
  }
  const cluster = getSourceCluster(host);
  if (!cluster) return false;
  const map = readJsonMap(BAD_SOURCE_HOSTS_KEY);
  const markedAt = Number(map[`cluster:${cluster}`] || 0);
  return markedAt > 0 && Date.now() - markedAt < SOURCE_HEALTH_PENALTY_TTL_MS;
}

export function markSourcePlaybackFailed(urlOrHost?: string): void {
  if (!canUseBrowserStorage() || !urlOrHost) return;
  let host = normalizeHost(urlOrHost);
  try {
    host = normalizeHost(new URL(urlOrHost).hostname);
  } catch {
    // The caller may already provide a hostname.
  }
  if (!host) return;
  const map = readJsonMap(BAD_SOURCE_HOSTS_KEY);
  map[host] = Date.now();
  writeJsonMap(BAD_SOURCE_HOSTS_KEY, map);
  window.dispatchEvent(new CustomEvent(SOURCE_HEALTH_UPDATED_EVENT));
}

export function markSourcePlaybackHealthy(urlOrHost?: string): void {
  if (!canUseBrowserStorage() || !urlOrHost) return;
  let host = normalizeHost(urlOrHost);
  try {
    host = normalizeHost(new URL(urlOrHost).hostname);
  } catch {
    // The caller may already provide a hostname.
  }
  if (!host) return;
  const map = readJsonMap(BAD_SOURCE_HOSTS_KEY);
  if (!(host in map)) return;
  delete map[host];
  writeJsonMap(BAD_SOURCE_HOSTS_KEY, map);
}
