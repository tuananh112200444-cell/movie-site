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
  const endpoint = new URL(`${SUPABASE_URL}/functions/v1/search-index-proxy`);
  endpoint.searchParams.set('limit', String(limit));
  if (refresh) endpoint.searchParams.set('refresh', '1');

  const started = performance.now();
  const response = await fetch(endpoint, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    source: json.source ?? null,
    items: Array.isArray(json.items) ? json.items.length : 0,
    updated_at: json.updated_at ?? null,
    xCache: response.headers.get('x-cache'),
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
      (['HIT', 'STALE'].includes(String(verifyResult.xCache || '').toUpperCase()) || verifyResult.source === 'cache');
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
if (!['HIT', 'STALE'].includes(String(verifyResult?.xCache || '').toUpperCase()) && verifyResult?.source !== 'cache') {
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
