import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      if (idx === -1) return [line, ''];
      return [line.slice(0, idx), line.slice(idx + 1).replace(/^['"]|['"]$/g, '')];
    }),
);

const SUPABASE_URL = env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_PUBLIC_SUPABASE_URL or VITE_PUBLIC_SUPABASE_ANON_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CASES = [
  {
    query: 'ben bo',
    expectTopSlug: 'blvietsub-5861-ben-bo',
    description: 'Vietnamese no-accent exact short BLVietsub title',
  },
  {
    query: 'cam nhan tinh yeu cua chung ta',
    expectTopSlug: 'blvietsub-5792-cam-nhan-tinh-yeu-cua-chung-ta',
    description: 'Vietnamese no-accent long BLVietsub title',
  },
  {
    query: 'human resources season 2',
    expectTopSlug: 'nguon-nhan-luc-phan-2',
    description: 'English title with season',
  },
  {
    query: 'nguon nhan luc phan 2',
    expectTopSlug: 'nguon-nhan-luc-phan-2',
    description: 'Vietnamese no-accent title with season',
  },
  {
    query: 'lai bi giet nua a thua tham tu',
    expectTopSlug: 'lai-co-an-mang-nua-roi-thua-tham-tu',
    description: 'Long Vietnamese fuzzy title',
  },
  {
    query: 'song trinh',
    expectTopSlug: 'double-helix',
    description: 'Queer universe title from admin source',
  },
  {
    query: 'fix the error',
    expectTopSlug: 'blvietsub-1652315128481409420-fix-the-error',
    description: 'English BLVietsub title',
  },
  {
    query: 'season 2',
    expectAtLeast: 8,
    description: 'Broad season search returns a useful set',
  },
  {
    query: 'lately winter season',
    expectTopSlug: 'fourever-you-phan-2',
    description: 'Alternative English title with a missing middle word',
  },
  {
    query: 'summer night',
    expectTopSlug: 'bi-mat-dem-he',
    description: 'English title after episode repair',
  },
];

async function inspectProxy() {
  const endpoint = new URL(`${SUPABASE_URL}/functions/v1/search-index-proxy`);
  endpoint.searchParams.set('limit', '3000');
  const start = performance.now();
  const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  const json = await response.json();
  return {
    status: response.status,
    source: json.source,
    items: Array.isArray(json.items) ? json.items.length : 0,
    ms: Math.round(performance.now() - start),
    xCache: response.headers.get('x-cache'),
  };
}

const failures = [];
const results = [];

let proxy;
try {
  proxy = await inspectProxy();
  if (proxy.status !== 200 || proxy.items < 3000) {
    failures.push(`search-index-proxy returned status=${proxy.status}, items=${proxy.items}`);
  }
} catch (error) {
  failures.push(`search-index-proxy failed: ${error.message}`);
}

for (const testCase of CASES) {
  const start = performance.now();
  const { data, error } = await supabase.rpc('search_movies_fast', {
    search_query: testCase.query,
    result_limit: 12,
  });
  const ms = Math.round(performance.now() - start);
  if (error) {
    failures.push(`${testCase.description}: RPC error ${error.message}`);
    continue;
  }

  const rows = Array.isArray(data) ? data : [];
  const top = rows.slice(0, 5).map((movie) => ({
    slug: movie.slug,
    name: movie.name,
    origin_name: movie.origin_name,
    episode_current: movie.episode_current,
    source_site: movie.source_site,
    score: Number(movie.search_score || 0).toFixed(1),
  }));
  const topSlug = rows[0]?.slug ?? null;

  if (testCase.expectTopSlug && topSlug !== testCase.expectTopSlug) {
    failures.push(`${testCase.description}: expected top ${testCase.expectTopSlug}, got ${topSlug}`);
  }
  if (testCase.expectAtLeast && rows.length < testCase.expectAtLeast) {
    failures.push(`${testCase.description}: expected at least ${testCase.expectAtLeast} results, got ${rows.length}`);
  }
  if (ms > 1_500) {
    failures.push(`${testCase.description}: RPC took ${ms}ms, expected <= 1500ms`);
  }

  results.push({
    query: testCase.query,
    description: testCase.description,
    ms,
    count: rows.length,
    top,
  });
}

console.log(JSON.stringify({ proxy, results, failures }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
