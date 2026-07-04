import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

function loadEnv() {
  if (!fs.existsSync('.env')) return {};
  return Object.fromEntries(
    fs.readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=');
        if (idx === -1) return [line, ''];
        return [line.slice(0, idx), line.slice(idx + 1).replace(/^['"]|['"]$/g, '')];
      }),
  );
}

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_PUBLIC_SUPABASE_URL or VITE_PUBLIC_SUPABASE_ANON_KEY in .env');
}

const REFRESH_LIMIT = Number(env.SEARCH_WARM_LIMIT || 5000);
const VERIFY_LIMIT = Number(env.SEARCH_WARM_VERIFY_LIMIT || 3000);
const MIN_ITEMS = Number(env.SEARCH_WARM_MIN_ITEMS || 2500);
const ATTEMPTS = Number(env.SEARCH_WARM_ATTEMPTS || 3);
const TIMEOUT_MS = Number(env.SEARCH_WARM_TIMEOUT_MS || 25_000);

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callProxy({ limit, refresh }) {
  if (refresh) {
    const endpoint = new URL(`${SUPABASE_URL}/rest/v1/rpc/refresh_search_index_cache`);
    const started = performance.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_limit: limit }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const count = await response.json().catch(() => 0);
    return {
      ok: response.ok,
      status: response.status,
      source: 'postgres-rpc',
      items: Number(count) || 0,
      updated_at: new Date().toISOString(),
      xCache: response.headers.get('x-cache') ?? 'RPC',
      ms: Math.round(performance.now() - started),
    };
  }

  const started = performance.now();
  let status = 200;
  let ok = true;
  let xCache = 'REST';
  let itemCount = 0;
  const pageSize = 1000;
  for (let from = 0; from < limit; from += pageSize) {
    const endpoint = new URL(`${SUPABASE_URL}/rest/v1/search_index_cache_items`);
    endpoint.searchParams.set('select', 'item');
    endpoint.searchParams.set('order', 'rank.asc');
    const to = Math.min(from + pageSize - 1, limit - 1);
    const response = await fetch(endpoint, {
      headers: {
        ...headers,
        Range: `${from}-${to}`,
        'Range-Unit': 'items',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = response.status;
    ok = ok && response.ok;
    xCache = response.headers.get('x-cache') ?? xCache;
    const json = await response.json().catch(() => []);
    const batchCount = Array.isArray(json) ? json.length : 0;
    itemCount += batchCount;
    if (!response.ok || batchCount < pageSize) break;
  }
  return {
    ok,
    status,
    source: 'rest-cache-table',
    items: itemCount,
    updated_at: new Date().toISOString(),
    xCache,
    ms: Math.round(performance.now() - started),
  };
}

const attempts = [];
let refreshResult = null;

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  try {
    refreshResult = await callProxy({ limit: REFRESH_LIMIT, refresh: true });
    attempts.push({ attempt, phase: 'refresh', ...refreshResult });
    if (refreshResult.ok && refreshResult.items >= MIN_ITEMS) break;
  } catch (error) {
    attempts.push({ attempt, phase: 'refresh', ok: false, error: error.message });
  }
  await sleep(750 * attempt);
}

let verifyResult = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  try {
    verifyResult = await callProxy({ limit: VERIFY_LIMIT, refresh: false });
    attempts.push({ attempt: attempts.length + 1, phase: 'verify-cache', ...verifyResult });
    const cacheReady =
      verifyResult.ok &&
      verifyResult.items >= MIN_ITEMS &&
      (verifyResult.source === 'rest-cache-table' || ['HIT', 'STALE'].includes(String(verifyResult.xCache || '').toUpperCase()) || verifyResult.source === 'cache');
    if (cacheReady) break;
  } catch (error) {
    attempts.push({ attempt: attempts.length + 1, phase: 'verify-cache', ok: false, error: error.message });
  }
  await sleep(1000 * attempt);
}

const failures = [];
if (!refreshResult?.ok) failures.push('search-index-proxy refresh failed');
if ((refreshResult?.items ?? 0) < MIN_ITEMS) {
  failures.push(`search-index-proxy refreshed only ${refreshResult?.items ?? 0} items; expected at least ${MIN_ITEMS}`);
}
if (!verifyResult?.ok) failures.push('search-index-proxy cache verification failed');
if ((verifyResult?.items ?? 0) < MIN_ITEMS) {
  failures.push(`search-index-proxy cache returned ${verifyResult?.items ?? 0} items; expected at least ${MIN_ITEMS}`);
}
if (!['HIT', 'STALE'].includes(String(verifyResult?.xCache || '').toUpperCase()) && !['cache', 'rest-cache-table'].includes(String(verifyResult?.source || ''))) {
  failures.push(`search-index-proxy cache did not verify as warm; source=${verifyResult?.source}, xCache=${verifyResult?.xCache}`);
}

console.log(JSON.stringify({
  refresh: refreshResult,
  verify: verifyResult,
  attempts,
  failures,
}, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
