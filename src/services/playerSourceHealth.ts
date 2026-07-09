const BAD_SOURCE_HOSTS_KEY = 'khophim.bad-source-hosts.v1';
const SOURCE_HEALTH_LAST_FETCH_KEY = 'khophim.source-health.last-fetch.v1';
const SOURCE_HEALTH_FETCH_TTL_MS = 10 * 60 * 1000;
const SOURCE_HEALTH_TIMEOUT_MS = 3500;

type SourceHealthHost = {
  host?: string;
  cluster?: string;
  score?: number;
  critical?: number;
};

type SourceHealthResponse = {
  ok?: boolean;
  bad_hosts?: SourceHealthHost[];
};

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
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

function normalizeCluster(cluster: string | undefined): string {
  return String(cluster || '').trim().toLowerCase();
}

function shouldFetchSourceHealth(): boolean {
  if (!canUseBrowserStorage()) return false;
  const lastFetch = Number(window.localStorage.getItem(SOURCE_HEALTH_LAST_FETCH_KEY) || 0);
  return !lastFetch || Date.now() - lastFetch > SOURCE_HEALTH_FETCH_TTL_MS;
}

export async function warmPlayerSourceHealth(): Promise<void> {
  if (!shouldFetchSourceHealth()) return;
  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SOURCE_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/player-source-health?hours=6&limit=600`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;

    const payload = await response.json() as SourceHealthResponse;
    if (!payload.ok || !Array.isArray(payload.bad_hosts)) return;

    const now = Date.now();
    const map = readJsonMap(BAD_SOURCE_HOSTS_KEY);
    for (const item of payload.bad_hosts) {
      const host = normalizeHost(item.host);
      if (!host || Number(item.critical || 0) < 2 || Number(item.score || 0) < 5) continue;
      map[host] = now;
      const cluster = normalizeCluster(item.cluster);
      if (cluster) map[cluster] = now;
    }
    writeJsonMap(BAD_SOURCE_HOSTS_KEY, map);
    window.localStorage.setItem(SOURCE_HEALTH_LAST_FETCH_KEY, String(now));
  } catch {
    // Silent by design: source health is only a hint, never a startup dependency.
  } finally {
    window.clearTimeout(timeout);
  }
}
