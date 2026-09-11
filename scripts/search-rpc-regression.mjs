import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const searchPageSource = fs.readFileSync('src/pages/search/page.tsx', 'utf8');
const suggestionsSource = fs.readFileSync('src/components/feature/SearchSuggestions.tsx', 'utf8');
const movieApiSource = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const searchHelperSource = fs.readFileSync('src/utils/searchHelper.ts', 'utf8');
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
const normalizeIdentity = (value) => String(value || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const resultIdentity = (row) => {
  const season = normalizeIdentity(`${row.name || ''} ${row.slug || ''}`).match(/\b(?:season|ss|phan|mua|part|s)\s*(\d{1,2})\b/)?.[1] || '';
  if (row.tmdb_id) return `tmdb:${row.tmdb_id}:season:${season}`;
  const title = normalizeIdentity(row.origin_name || row.title_en || row.title_vi || row.name);
  return title.length >= 5 ? `title:${title}:${Number(row.year || 0)}:season:${season}` : `slug:${row.slug}`;
};
const architectureChecks = [
  [movieApiSource.includes("new URL('/api/search', window.location.origin)"), 'Browser search must use the same-origin Cloudflare cache'],
  [cloudflareWorkerSource.includes("pathname === '/api/search'") && cloudflareWorkerSource.includes('async function proxySearch'), 'Cloudflare must own the cached search RPC and circuit breaker'],
  [movieApiSource.includes('Never bypass its open circuit with a direct browser PostgREST retry'), 'Browser search must not bypass the Cloudflare database circuit'],
  [edgeSearchSource.includes(".rpc('search_movies_smart'"), 'Edge search must use the typo-tolerant indexed RPC'],
  [edgeSearchSource.includes('MIN_SEARCH_RPC_LIMIT = 36') && edgeSearchSource.includes('result_limit: rpcResultLimit'), 'Short search requests must avoid the slow small-LIMIT Postgres plan'],
  [!edgeSearchSource.includes('const exactDetailPromise = fetchExactCanonicalDetail'), 'Search must not eagerly invoke movie detail for every query'],
  [edgeSearchSource.includes('searchFallbackSources') && edgeSearchSource.includes('home-fallback.json'), 'Edge search must retain a DB-outage fallback'],
  [edgeSearchSource.includes('tokenMatchQuality') && edgeSearchSource.includes('isOneEditAway'), 'Edge filtering must support validated prefixes and one-edit typos'],
  [searchHelperSource.includes('movieMatchesSearchIntent') && searchHelperSource.includes('isOneEditAway') && movieApiSource.includes('movieMatchesSearchIntent') && searchPageSource.includes('movieMatchesSearchIntent'), 'Browser search surfaces must share one typo-tolerant intent matcher'],
  [edgeSearchSource.includes('function isRetiredOphimItem') && edgeSearchSource.includes('void item;') && edgeSearchSource.includes('return false;'), 'Catalogue metadata must remain provider-neutral when OPhim playback is retired'],
  [edgeSearchSource.includes('mergeCanonicalSearchDuplicates') && edgeSearchSource.includes('searchIdentityKeys'), 'Edge search must merge duplicate canonical identities before ranking'],
  [cloudflareWorkerSource.includes('mergeProviderNeutralSearchRows') && cloudflareWorkerSource.includes('sameProviderNeutralSearchIdentity'), 'Search must merge provider rows into one canonical result'],
  [cloudflareWorkerSource.includes("rpcName = 'search_movies_smart'") && cloudflareWorkerSource.includes('v20-canonical-dedupe'), 'Cloudflare search must use the smart RPC and a fresh canonical-dedupe cache generation'],
  [cloudflareWorkerSource.includes('vsmov.com/api/tim-kiem') && cloudflareWorkerSource.includes('phim.nguonc.com/api/films/search'), 'Search fallback must query KKPhim, VSMov and NguonC equally'],
  [searchPageSource.includes('matchesSearchIntent') && searchPageSource.includes('.filter((movie) => matchesSearchIntent'), 'Search page must remove unrelated fuzzy results'],
  [searchPageSource.includes('search_v14_') && searchPageSource.includes("slug: 'cam'") && movieApiSource.includes("20260827-canonical-dedupe-v2") && movieApiSource.includes("cache: 'no-store'"), 'Published canonical movies must bypass stale browser search caches'],
  [movieApiSource.indexOf("new URL('/api/search', window.location.origin)") < movieApiSource.indexOf("new URL(`${SUPABASE_URL}/functions/v1/search-index-proxy`)"), 'Browser search must prefer the same-origin POP cache'],
  [suggestionsSource.includes('useDebounce(query, 180)'), 'Suggestion debounce must remain responsive'],
  [suggestionsSource.includes('searchMoviesInStaticFallback') && suggestionsSource.includes('const canonicalItemsPromise = searchMoviesInSupabase'), 'Navbar suggestions must use the same canonical plus static fail-open path as the search page'],
  [suggestionsSource.includes('Preserve any snapshot matches already shown') && !suggestionsSource.includes('catch {\n      if (!ctrl.signal.aborted) {\n        setSuggestions([]);'), 'A live-index failure must not erase navbar snapshot suggestions'],
];
for (const [passed, message] of architectureChecks) if (!passed) failures.push(message);

const cases = [
  { query: 'Backroom', expectContainsSlug: 'thuc-the-quy-quyet-hau-phong-vo-tan' },
  { query: 'Backroms', expectContainsSlug: 'thuc-the-quy-quyet-hau-phong-vo-tan' },
  { query: 'Sơn Hà Lện', expectTopSlugs: ['son-ha-lenh', 'blvietsub-5700-son-ha-lenh'] },
  { query: 'Đừng Xin Anh Jan', expectTopSlugs: ['dung-xin-anh-jane', 'blvietsub-1533-dung-xin-anh-jane', 'blvietsub-1533-dung-xin-anh-jane-don-039-t-be-too-emotional-2026', 'glvietsub-dont-be-too-emotional'] },
  { query: 'Hậu Phòng Vô Tn', expectTopSlug: 'thuc-the-quy-quyet-hau-phong-vo-tan' },
  { query: 'Thực Tể Quỷ Quyệt', expectContainsSlug: 'thuc-the-quy-quyet-hau-phong-vo-tan' },
  { query: 'Cám', expectTopSlug: 'cam', limit: 24 },
  { query: 'Mưa Đỏ', expectTopSlug: 'mua-do' },
  { query: 'Sơn Hà Lệnh', expectTopSlugs: ['son-ha-lenh', 'blvietsub-5700-son-ha-lenh'] },
  { query: 'Đừng Xin Anh Jane', expectTopSlugs: ['dung-xin-anh-jane', 'blvietsub-1533-dung-xin-anh-jane', 'blvietsub-1533-dung-xin-anh-jane-don-039-t-be-too-emotional-2026', 'glvietsub-dont-be-too-emotional'] },
  { query: 'Avengers', expectAtLeast: 5 },
];
const results = [];
for (const testCase of cases) {
  const urls = [
    {
      url: new URL('/functions/v1/search-index-proxy', supabaseUrl),
      headers: { Accept: 'application/json', apikey: anonKey, Origin: 'https://khophim.org' },
    },
    { url: new URL('/api/search', siteUrl), headers: { Accept: 'application/json' } },
  ];
  urls.forEach(({ url }) => {
    url.searchParams.set('q', testCase.query);
    url.searchParams.set('limit', String(testCase.limit ?? 12));
  });
  const started = performance.now();
  try {
    let response;
    let fallbackUsed = false;
    for (let index = 0; index < urls.length; index += 1) {
      const candidate = await fetch(urls[index].url, {
        signal: AbortSignal.timeout(12_000),
        headers: urls[index].headers,
      });
      if (candidate.ok && String(candidate.headers.get('content-type') || '').includes('application/json')) {
        response = candidate;
        fallbackUsed = index > 0;
        break;
      }
    }
    if (!response) throw new Error('No JSON search endpoint available');
    const payload = await response.json();
    const rows = Array.isArray(payload.items) ? payload.items : [];
    const elapsedMs = Math.round(performance.now() - started);
    const topSlug = rows[0]?.slug || null;
    const identities = rows.map(resultIdentity);
    if (new Set(identities).size !== identities.length) failures.push(`${testCase.query}: duplicate canonical identities returned`);
    if (!response.ok) failures.push(`${testCase.query}: HTTP ${response.status}`);
    if (testCase.expectTopSlug && topSlug !== testCase.expectTopSlug) failures.push(`${testCase.query}: expected top ${testCase.expectTopSlug}, got ${topSlug}`);
    if (testCase.expectTopSlugs && !testCase.expectTopSlugs.includes(topSlug)) failures.push(`${testCase.query}: expected one of ${testCase.expectTopSlugs.join(', ')}, got ${topSlug}`);
    if (testCase.expectContainsSlug && !rows.some((row) => row.slug === testCase.expectContainsSlug)) failures.push(`${testCase.query}: expected result ${testCase.expectContainsSlug}`);
    if (testCase.expectAtLeast && rows.length < testCase.expectAtLeast) failures.push(`${testCase.query}: expected >= ${testCase.expectAtLeast}, got ${rows.length}`);
    if (elapsedMs > 8_000) failures.push(`${testCase.query}: ${elapsedMs}ms exceeds 8000ms`);
    results.push({ query: testCase.query, elapsed_ms: elapsedMs, source: payload.source, fallback_used: fallbackUsed, count: rows.length, top: rows.slice(0, 5).map((row) => ({ slug: row.slug, name: row.name })) });
  } catch (error) {
    failures.push(`${testCase.query}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(JSON.stringify({ architectureChecks: architectureChecks.length, results, failures }, null, 2));
if (failures.length) process.exitCode = 1;
