import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/sync-gap-playback-providers/index.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260811150849_add_gap_playback_provider_sync.sql', import.meta.url), 'utf8');
const edgeRouter = await readFile(new URL('../functions/[[path]].js', import.meta.url), 'utf8');

assert.match(source, /identityMatches/);
assert.match(source, /candidateYear !== expectedYear/);
assert.match(source, /candidateType !== expectedType/);
assert.match(source, /Provider verification pending:/);
assert.match(source, /const DEFAULT_PROVIDERS: Provider\[\] = \['vsmov', 'nguonc'\]/);
assert.match(source, /resolveVsmovHls/);
assert.doesNotMatch(source, /\/stream\/\$\{id\}\/master\.m3u8/);
assert.match(source, /runtime_capacity_protect/);
assert.match(source, /vietnam_viewing_peak/);
assert.match(source, /if \(!dryRun && !targetSlug && \(capacity\?\.mode === 'protect' \|\| isVietnamPeak\(\)\)\)/);
assert.match(source, /targeted_gap_provider:/);
assert.match(source, /An exact provider match may publish the same URL again/);
assert.match(source, /Continue with the guarded exact-detail lookup/);
assert.match(source, /internal\/nguonc-detail/);
assert.match(source, /\^embed\\d\*\\\.streamc\\\.xyz\$/);
assert.match(source, /MOVIE_DETAIL_PROXY_SECRET/);
assert.match(edgeRouter, /pathname === '\/internal\/nguonc-detail'/);
assert.match(edgeRouter, /crypto\.subtle\.timingSafeEqual/);
assert.match(edgeRouter, /X-Robots-Tag': 'noindex, nofollow'/);
assert.doesNotMatch(source, /from\('movies'\)\s*\.insert/);
assert.doesNotMatch(source, /from\('movies'\)\s*\.upsert/);
assert.doesNotMatch(source, /is_published:\s*true/);
assert.match(migration, /'9,39 0-3,8-11,17-23 \* \* \*'/);
assert.match(migration, /providers=vsmov/);
assert.match(migration, /runtime_capacity_managed_jobs/);

const fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.json();
};

const [vsmov, nguonc] = await Promise.all([
  fetchJson('https://vsmov.com/api/tim-kiem?keyword=colony&limit=3'),
  fetchJson('https://phim.nguonc.com/api/films/search?keyword=ghostland'),
]);
assert.ok(Array.isArray(vsmov.items) && vsmov.items.length > 0, 'VSMOV search returned no candidates');
assert.ok(Array.isArray(nguonc.items) && nguonc.items.length > 0, 'NguonC search returned no candidates');

console.log(JSON.stringify({
  success: true,
  contracts: {
    no_movie_creation: true,
    strict_identity: true,
    pending_health_gate: true,
    peak_and_capacity_guard: true,
  },
  providers: {
    vsmov_candidates: vsmov.items.length,
    nguonc_candidates: nguonc.items.length,
  },
}, null, 2));
