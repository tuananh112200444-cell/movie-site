import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const searchPageSource = fs.readFileSync('src/pages/search/page.tsx', 'utf8');
const suggestionsSource = fs.readFileSync('src/components/feature/SearchSuggestions.tsx', 'utf8');
const movieApiSource = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const workerSource = fs.readFileSync('functions/[[path]].js', 'utf8');
const searchMigrationSource = fs.readFileSync(
  'supabase/migrations/20260722143000_optimize_search_rpc_v8_indexed_candidates.sql',
  'utf8',
);

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
    expectTopSlug: 'glvietsub-lately-its-winter-season',
    description: 'Exact GLVietsub English title with a missing middle word',
  },
  {
    query: 'summer night',
    expectTopSlug: 'bi-mat-dem-he',
    description: 'English title after episode repair',
  },
];

const failures = [];
const results = [];

const architectureChecks = [
  [!searchPageSource.includes('fetchSupabaseSearchIndex'), 'Search page must not download the full movie index'],
  [searchPageSource.includes('if (items.length === 0 || pg > 1)'), 'External APIs must stay outside the first-page critical path'],
  [!suggestionsSource.includes('fetchSupabaseSearchIndex'), 'Mobile suggestions must not download the full movie index'],
  [suggestionsSource.includes('useDebounce(query, 180)'), 'Suggestion debounce must remain responsive'],
  [movieApiSource.includes("new URL('/api/search', window.location.origin)"), 'Browser search must use the same-origin edge cache'],
  [workerSource.includes("pathname === '/api/search'"), 'Cloudflare worker must expose the search route'],
  [workerSource.includes('/__api-cache/search/v8/'), 'Cloudflare search must use a versioned cache key'],
  [searchMigrationSource.includes('movie_search_documents_blob_trgm_idx'), 'Search documents need a trigram index'],
  [searchMigrationSource.includes('movies_refresh_search_document'), 'Movie writes must refresh search documents automatically'],
];
for (const [passed, message] of architectureChecks) {
  if (!passed) failures.push(message);
}

// Exclude one-time TLS/PostgREST connection establishment from the RPC query
// budget. The production path is additionally protected by Cloudflare cache.
await supabase.rpc('search_movies_fast', {
  search_query: 'khophim search warmup',
  result_limit: 1,
});

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
  if (ms > 12_000) {
    failures.push(`${testCase.description}: RPC took ${ms}ms, expected <= 12000ms including network variance`);
  }

  results.push({
    query: testCase.query,
    description: testCase.description,
    ms,
    count: rows.length,
    top,
  });
}

const orderedDurations = results.map((result) => result.ms).sort((a, b) => a - b);
const medianMs = orderedDurations[Math.floor(orderedDurations.length / 2)] ?? Infinity;
const fastCases = orderedDurations.filter((ms) => ms <= 2_500).length;
if (medianMs > 1_500) failures.push(`Median RPC latency was ${medianMs}ms, expected <= 1500ms`);
if (fastCases < Math.ceil(CASES.length * 0.8)) {
  failures.push(`Only ${fastCases}/${CASES.length} RPC cases completed within 2500ms`);
}

console.log(JSON.stringify({ architectureChecks: architectureChecks.length, medianMs, fastCases, results, failures }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
