import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const searchPageSource = fs.readFileSync('src/pages/search/page.tsx', 'utf8');
const suggestionsSource = fs.readFileSync('src/components/feature/SearchSuggestions.tsx', 'utf8');
const movieApiSource = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const edgeSearchSource = fs.readFileSync('supabase/functions/search-index-proxy/index.ts', 'utf8');
const cloudflareWorkerSource = fs.readFileSync('functions/[[path]].js', 'utf8');
const envText = fs.readFileSync('.env', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#')).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
  }));

const supabaseUrl = env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = env.VITE_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) throw new Error('Missing public Supabase configuration');
const siteUrl = String(process.env.SITE_URL || 'https://khophim.org').replace(/\/$/, '');

const failures = [];
const architectureChecks = [
  [movieApiSource.includes("new URL('/api/search', window.location.origin)"), 'Browser search must use the same-origin Cloudflare cache'],
  [cloudflareWorkerSource.includes("pathname === '/api/search'") && cloudflareWorkerSource.includes('async function proxySearch'), 'Cloudflare must own the cached search RPC and circuit breaker'],
  [movieApiSource.includes('Never bypass its open circuit with a direct browser PostgREST retry'), 'Browser search must not bypass the Cloudflare database circuit'],
  [edgeSearchSource.includes(".rpc('search_movies_fast'"), 'Edge search must retain the indexed canonical RPC'],
  [!edgeSearchSource.includes('const exactDetailPromise = fetchExactCanonicalDetail'), 'Search must not eagerly invoke movie detail for every query'],
  [edgeSearchSource.includes('searchFallbackSources') && edgeSearchSource.includes('home-fallback.json'), 'Edge search must retain a DB-outage fallback'],
  [edgeSearchSource.includes('tokens.length >= 3') && edgeSearchSource.includes('phraseMatch'), 'Short queries must match a phrase instead of unrelated token fragments'],
  [edgeSearchSource.includes('function isRetiredOphimItem') && edgeSearchSource.includes('void item;') && edgeSearchSource.includes('return false;'), 'Catalogue metadata must remain provider-neutral when OPhim playback is retired'],
  [cloudflareWorkerSource.includes('mergeProviderNeutralSearchRows') && cloudflareWorkerSource.includes('sameProviderNeutralSearchIdentity'), 'Search must merge provider rows into one canonical result'],
  [cloudflareWorkerSource.includes('vsmov.com/api/tim-kiem') && cloudflareWorkerSource.includes('phim.nguonc.com/api/films/search'), 'Search fallback must query KKPhim, VSMov and NguonC equally'],
  [searchPageSource.includes('matchesSearchIntent') && searchPageSource.includes('.filter((movie) => matchesSearchIntent'), 'Search page must remove unrelated fuzzy results'],
  [suggestionsSource.includes('useDebounce(query, 180)'), 'Suggestion debounce must remain responsive'],
];
for (const [passed, message] of architectureChecks) if (!passed) failures.push(message);

const cases = [
  { query: 'Mưa Đỏ', expectTopSlug: 'mua-do' },
  { query: 'Sơn Hà Lệnh', expectTopSlug: 'son-ha-lenh' },
  { query: 'Đừng Xin Anh Jane', expectTopSlug: 'blvietsub-1533-dung-xin-anh-jane' },
  { query: 'Avengers', expectAtLeast: 5 },
];
const results = [];
for (const testCase of cases) {
  const url = new URL('/api/search', siteUrl);
  url.searchParams.set('q', testCase.query);
  url.searchParams.set('limit', '12');
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json();
    const rows = Array.isArray(payload.items) ? payload.items : [];
    const elapsedMs = Math.round(performance.now() - started);
    const topSlug = rows[0]?.slug || null;
    if (!response.ok) failures.push(`${testCase.query}: HTTP ${response.status}`);
    if (testCase.expectTopSlug && topSlug !== testCase.expectTopSlug) failures.push(`${testCase.query}: expected top ${testCase.expectTopSlug}, got ${topSlug}`);
    if (testCase.expectAtLeast && rows.length < testCase.expectAtLeast) failures.push(`${testCase.query}: expected >= ${testCase.expectAtLeast}, got ${rows.length}`);
    if (elapsedMs > 8_000) failures.push(`${testCase.query}: ${elapsedMs}ms exceeds 8000ms`);
    results.push({ query: testCase.query, elapsed_ms: elapsedMs, source: payload.source, count: rows.length, top: rows.slice(0, 5).map((row) => ({ slug: row.slug, name: row.name })) });
  } catch (error) {
    failures.push(`${testCase.query}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(JSON.stringify({ architectureChecks: architectureChecks.length, results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
