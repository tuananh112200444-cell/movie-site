import { readFile } from 'node:fs/promises';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || 'true'];
}));
const site = String(args.get('site') || 'https://khophim.org').replace(/\/$/, '');
const requestedSection = String(args.get('section') || '').trim();
const requestedSlugs = String(args.get('slugs') || '').split(',').map((slug) => slug.trim()).filter(Boolean);
const limit = Math.max(1, Number(args.get('limit') || 500));
const concurrency = Math.max(1, Math.min(12, Number(args.get('concurrency') || 6)));
const snapshotPath = args.get('snapshot') || new URL('../public/home-fallback.json', import.meta.url);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const sections = snapshot.sections && typeof snapshot.sections === 'object' ? snapshot.sections : {};
const selected = requestedSection ? { [requestedSection]: sections[requestedSection] || [] } : sections;
const movies = [];
const seen = new Set();

for (const [section, items] of Object.entries(selected)) {
  for (const movie of Array.isArray(items) ? items : []) {
    const slug = String(movie?.slug || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    movies.push({ section, slug, source: String(movie?.source_site || '').trim().toLowerCase() });
    if (movies.length >= limit) break;
  }
  if (movies.length >= limit) break;
}

if (requestedSlugs.length > 0) {
  movies.splice(0, movies.length, ...requestedSlugs.slice(0, limit).map((slug) => ({
    section: 'explicit-slugs',
    slug,
    source: '',
  })));
}

function isPlayable(detail, slug) {
  return detail?.status === true && String(detail?.movie?.slug || '').trim() === slug &&
    Array.isArray(detail?.episodes) && detail.episodes.some((server) =>
      Array.isArray(server?.server_data) && server.server_data.some((episode) =>
        [episode?.link_m3u8, episode?.link_embed].some((candidate) => {
          try {
            const url = new URL(String(candidate || ''));
            return url.protocol === 'https:' || url.protocol === 'http:';
          } catch {
            return false;
          }
        })
      )
    );
}

const results = new Array(movies.length);
let nextIndex = 0;
async function worker() {
  while (nextIndex < movies.length) {
    const index = nextIndex++;
    const movie = movies[index];
    const query = new URLSearchParams({ slug: movie.slug });
    if (movie.source) query.set('source', movie.source === 'phimapi' ? 'kkphim' : movie.source);
    const startedAt = Date.now();
    try {
      const response = await fetch(`${site}/api/movie-detail?${query}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      const detail = await response.json().catch(() => null);
      results[index] = {
        ...movie,
        status: response.status,
        playable: response.ok && isPlayable(detail, movie.slug),
        fallback: response.headers.get('x-khophim-detail-fallback') || '',
        cache: response.headers.get('x-khophim-detail-cache') || '',
        duration_ms: Date.now() - startedAt,
      };
    } catch (error) {
      results[index] = {
        ...movie,
        status: 0,
        playable: false,
        fallback: '',
        cache: '',
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, movies.length) }, () => worker()));
const failed = results.filter((result) => !result.playable);
const fallbackCounts = Object.groupBy(results, (result) => result.fallback || 'SUPABASE');
const report = {
  site,
  snapshot_generated_at: snapshot.generated_at || '',
  section: requestedSection || 'all-home-sections',
  checked: results.length,
  playable: results.length - failed.length,
  failed: failed.length,
  fallback_counts: Object.fromEntries(Object.entries(fallbackCounts).map(([key, rows]) => [key, rows.length])),
  slowest_ms: Math.max(0, ...results.map((result) => result.duration_ms)),
  failures: failed.slice(0, 30),
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) process.exitCode = 1;
