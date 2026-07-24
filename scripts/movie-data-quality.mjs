import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const FULL_AUDIT = process.argv.includes('--full');
// Deployment checks must stay bounded. The previous 10k default downloaded
// hundreds of thousands of episode/source rows and could exceed the release
// timeout even while Supabase was healthy.
const MOVIE_LIMIT = Math.max(
  1,
  Math.min(Number(env.MOVIE_DATA_QUALITY_LIMIT || (FULL_AUDIT ? 10_000 : 500)), 20_000),
);
const QUERY_CONCURRENCY = Math.max(
  1,
  Math.min(Number(env.MOVIE_DATA_QUALITY_CONCURRENCY || (FULL_AUDIT ? 4 : 2)), 8),
);
const STRICT = env.MOVIE_DATA_QUALITY_STRICT === '1';
const FAIL_LIMIT = Number(env.MOVIE_DATA_QUALITY_MAX_SEVERE || (STRICT ? 0 : Number.POSITIVE_INFINITY));
const HOME_MIN_SECTION_ITEMS = Number(env.MOVIE_DATA_HOME_MIN_SECTION_ITEMS || 6);
const HOME_SECTIONS = [
  'trending',
  'top10-single',
  'top10-series',
  'phim-chieu-rap',
  'phim-le',
  'phim-bo',
  'hoat-hinh',
  'han-quoc',
  'au-my',
  'trung-quoc',
  'thai-lan',
];
const REQUIRED_COUNTRIES = ['trung-quoc', 'thai-lan'];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function episodeNumberFromText(value) {
  if (value == null) return 0;
  const text = String(value).toLowerCase();
  if (/\b(full|hoan tat|hoàn tất|complete|completed)\b/.test(text)) return 0;
  const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[1] || 0) || 0;
  const range = text.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
  if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
  const matches = [...text.matchAll(/(\d{1,5})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : 0;
}

function advertisedEpisode(movie) {
  return Math.max(
    Number(movie.current_episode || 0) || 0,
    episodeNumberFromText(movie.episode_current),
  );
}

function sourceLabel(movie) {
  return String(movie.source_site || movie.source_name || '').toLowerCase();
}

function isBlvietsubMovie(movie) {
  const source = sourceLabel(movie);
  return source.includes('blvietsub') || source.includes('admin-queer');
}

function isExternalQueerEpisodeRow(row) {
  const haystack = [
    row.source,
    row.server_name,
    row.link_embed,
    row.link_m3u8,
    row.embed_url,
    row.stream_url,
    row.server_data && JSON.stringify(row.server_data),
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  // BLVietsub/admin-queer catalog entries may legitimately use the configured
  // GLVietsub successor feed. Do not infer "pollution" from a downstream CDN
  // hostname (for example kkphimplayer) when the row is explicitly attributed
  // to either curated queer source.
  if (
    haystack.includes('blvietsub')
    || haystack.includes('glvietsub')
    || haystack.includes('admin-queer')
  ) {
    return false;
  }
  if (
    haystack.includes('verified') &&
    (haystack.includes('ophim') || haystack.includes('kkphim') || haystack.includes('phimapi'))
  ) {
    return false;
  }
  return /\b(ophim|kkphim|phimapi)\b/.test(haystack)
    || haystack.includes('kkphimplayer')
    || haystack.includes('#ha noi')
    || haystack.includes('ha noi');
}

function isCatalogOnlyMovie(movie) {
  return sourceLabel(movie).includes('tmdb-catalog');
}

function playableEpisodeNumber(row) {
  const hasPlayableUrl = Boolean(String(row.link_m3u8 || row.stream_url || '').trim() || String(row.link_embed || row.embed_url || '').trim());
  const directNumber = Math.max(
    Number(row.episode_number || 0) || 0,
    episodeNumberFromText(row.episode_slug),
    episodeNumberFromText(row.slug),
    episodeNumberFromText(row.episode_name),
  );
  const serverData = row.server_data;
  const nestedRows = Array.isArray(serverData) ? serverData : serverData && typeof serverData === 'object' ? [serverData] : [];
  const nestedNumber = nestedRows.reduce((max, ep) => Math.max(
    max,
    Number(ep?.episode_number || 0) || 0,
    episodeNumberFromText(ep?.slug),
    episodeNumberFromText(ep?.name),
    episodeNumberFromText(ep?.filename),
  ), 0);
  if (hasPlayableUrl) return Math.max(directNumber, nestedNumber);
  const nestedPlayable = nestedRows.some((ep) => String(ep?.link_m3u8 || '').trim() || String(ep?.link_embed || '').trim());
  return nestedPlayable ? Math.max(directNumber, nestedNumber) : 0;
}

async function auditHomeProxySections() {
  const url = new URL(`${SUPABASE_URL}/functions/v1/home-proxy`);
  url.searchParams.set('sections', HOME_SECTIONS.join(','));

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    return {
      ok: false,
      source: 'error',
      counts: {},
      failures: [`home-proxy returned HTTP ${response.status}`],
    };
  }

  const payload = await response.json();
  const sections = payload?.sections && typeof payload.sections === 'object' ? payload.sections : {};
  const counts = Object.fromEntries(
    HOME_SECTIONS.map((section) => [section, Array.isArray(sections[section]) ? sections[section].length : 0]),
  );
  const failures = [];

  for (const section of HOME_SECTIONS) {
    const count = counts[section] ?? 0;
    if (count < HOME_MIN_SECTION_ITEMS) {
      failures.push(`home-proxy section "${section}" returned ${count} items, below minimum ${HOME_MIN_SECTION_ITEMS}.`);
    }
  }

  return {
    ok: failures.length === 0,
    source: String(payload?.source || 'unknown'),
    counts,
    failures,
  };
}

async function auditCountryCoverage() {
  const results = {};
  const failures = [];

  for (const country of REQUIRED_COUNTRIES) {
    const { data, error, count } = await supabase
      .from('movies')
      .select('id, slug, name, episode_current, country', { count: 'exact' })
      .eq('is_published', true)
      .filter('country', 'cs', JSON.stringify([{ slug: country }]))
      .limit(HOME_MIN_SECTION_ITEMS)
      .abortSignal(AbortSignal.timeout(20_000));

    if (error) {
      failures.push(`country coverage query failed for "${country}": ${error.message}`);
      results[country] = { count: 0, samples: [] };
      continue;
    }

    const playableItems = (data || [])
      .filter((movie) => String(movie.episode_current || '').toLowerCase().trim() !== 'trailer');

    results[country] = {
      count: count ?? playableItems.length,
      samples: playableItems.slice(0, 3).map((movie) => movie.slug),
    };

    if ((count ?? playableItems.length) < HOME_MIN_SECTION_ITEMS) {
      failures.push(`Supabase country "${country}" has only ${count ?? playableItems.length} published movies, below minimum ${HOME_MIN_SECTION_ITEMS}.`);
    }
  }

  return { ok: failures.length === 0, results, failures };
}

async function queryByMovieIds(table, select, movieIds, { activeOnly = false } = {}) {
  const idChunks = chunk(movieIds, 100);
  const results = new Array(idChunks.length);
  let cursor = 0;
  let firstError = null;

  async function worker() {
    while (cursor < idChunks.length && !firstError) {
      const index = cursor++;
      const ids = idChunks[index];
      const rows = [];
    for (let from = 0; ; from += 1000) {
      let data = null;
      let error = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        let query = supabase
          .from(table)
          .select(select)
          .in('movie_id', ids);
        if (activeOnly) query = query.eq('is_active', true);
        const response = await query
          .order('movie_id', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + 999)
          .abortSignal(AbortSignal.timeout(40_000));
        data = response.data;
        error = response.error;
        if (!error || !/timeout|canceling statement/i.test(String(error.message || ''))) break;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 350));
      }
      if (error) {
        firstError = `${table}: ${error.message}`;
        break;
      }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
      results[index] = rows;
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(QUERY_CONCURRENCY, Math.max(1, idChunks.length)) },
    () => worker(),
  ));
  return { rows: results.filter(Boolean).flat(), error: firstError };
}

async function fetchPublishedMovies(limit) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; rows.length < limit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    let data = null;
    let error = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await supabase
        .from('movies')
        .select('id, slug, name, origin_name, source_site, source_name, episode_current, current_episode, total_episodes, episode_total, updated_at')
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .range(from, to)
        .abortSignal(AbortSignal.timeout(40_000));
      data = result.data;
      error = result.error;
      if (!error) break;
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }

    if (error) throw new Error(`movies query failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const failures = [];
const warnings = [];

const [homeProxyAudit, countryCoverageAudit] = await Promise.all([
  auditHomeProxySections().catch((error) => ({
    ok: false,
    source: 'error',
    counts: {},
    failures: [`home-proxy audit failed: ${error.message}`],
  })),
  auditCountryCoverage().catch((error) => ({
    ok: false,
    results: {},
    failures: [`country coverage audit failed: ${error.message}`],
  })),
]);

failures.push(...homeProxyAudit.failures, ...countryCoverageAudit.failures);

const movies = await fetchPublishedMovies(MOVIE_LIMIT);

const movieIds = (movies || []).map((movie) => movie.id).filter(Boolean);

const [movieEpisodes, episodes, streams] = await Promise.all([
  queryByMovieIds('movie_episodes', 'id, movie_id, episode_number, slug, episode_name, server_name, link_m3u8, link_embed, source', movieIds),
  queryByMovieIds('episodes', 'id, movie_id, episode_number, episode_slug, episode_name, server_name, link_m3u8, link_embed, server_data', movieIds),
  queryByMovieIds(
    'streams',
    'id, movie_id, episode_slug, server_name, source, stream_url, embed_url, is_active',
    movieIds,
    { activeOnly: true },
  ),
]);

for (const result of [movieEpisodes, episodes, streams]) {
  if (result.error) failures.push(result.error);
}

const playableByMovie = new Map();
const sourcesByMovie = new Map();
const detailRowsByMovie = new Map();

function addDetailRow(row) {
  if (!row?.movie_id) return;
  const rows = detailRowsByMovie.get(row.movie_id) || [];
  rows.push(row);
  detailRowsByMovie.set(row.movie_id, rows);
}

for (const row of movieEpisodes.rows) addDetailRow({ ...row, __table: 'movie_episodes' });
for (const row of episodes.rows) addDetailRow({ ...row, __table: 'episodes' });
for (const row of streams.rows.filter((row) => row.is_active !== false)) addDetailRow({ ...row, __table: 'streams' });

for (const row of [
  ...movieEpisodes.rows,
  ...episodes.rows,
  ...streams.rows.filter((row) => row.is_active !== false),
]) {
  const movieId = row.movie_id;
  const ep = playableEpisodeNumber(row);
  if (!movieId || ep <= 0) continue;
  playableByMovie.set(movieId, Math.max(playableByMovie.get(movieId) || 0, ep));
  const sources = sourcesByMovie.get(movieId) || new Set();
  sources.add(String(row.server_name || row.source || 'unknown'));
  sourcesByMovie.set(movieId, sources);
}

const severe = [];
const severeBlvietsub = [];
const staleLabels = [];
const invalidCompletionLabels = [];
const noPlayable = [];
const catalogNoPlayable = [];
const queerExternalRows = [];
const legacySingleEpisodeRechecks = [];
const checked = [];

for (const movie of movies || []) {
  const completionMatch = String(movie.episode_current || '').match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (
    /(?:hoàn\s*tất|hoan\s*tat)/i.test(String(movie.episode_current || '')) &&
    completionMatch &&
    Number(completionMatch[1]) > Number(completionMatch[2])
  ) {
    invalidCompletionLabels.push({
      slug: movie.slug,
      name: movie.name,
      episode_current: movie.episode_current,
      current_episode: movie.current_episode,
      total_episodes: movie.total_episodes,
      episode_total: movie.episode_total,
    });
  }
  const advertised = advertisedEpisode(movie);
  const labelEpisode = episodeNumberFromText(movie.episode_current);
  const currentEpisode = Number(movie.current_episode || 0) || 0;
  const playable = playableByMovie.get(movie.id) || 0;
  if (isBlvietsubMovie(movie)) {
    for (const row of detailRowsByMovie.get(movie.id) || []) {
      if (!isExternalQueerEpisodeRow(row)) continue;
      const hasPlayableUrl = Boolean(String(row.link_m3u8 || row.stream_url || '').trim() || String(row.link_embed || row.embed_url || '').trim());
      if (!hasPlayableUrl && row.source === 'hidden') continue;
      queerExternalRows.push({
        slug: movie.slug,
        name: movie.name,
        table_hint: row.__table,
        episode_number: row.episode_number || row.episode_slug || row.slug,
        server_name: row.server_name,
        source: row.source,
      });
    }
  }
  if (advertised <= 1) {
    if (isBlvietsubMovie(movie) && playable <= 1) {
      legacySingleEpisodeRechecks.push({
        slug: movie.slug,
        name: movie.name,
        source_site: movie.source_site || movie.source_name,
        episode_current: movie.episode_current,
        current_episode: movie.current_episode,
        playable,
        updated_at: movie.updated_at,
      });
    }
    continue;
  }
  const record = {
    slug: movie.slug,
    name: movie.name,
    source_site: movie.source_site || movie.source_name,
    episode_current: movie.episode_current,
    current_episode: movie.current_episode,
    advertised,
    playable,
    updated_at: movie.updated_at,
    servers: [...(sourcesByMovie.get(movie.id) || [])].slice(0, 5),
  };
  checked.push(record);

  if (
    playable > 1 &&
    currentEpisode === playable &&
    labelEpisode > 0 &&
    labelEpisode !== playable
  ) {
    staleLabels.push({ ...record, label_episode: labelEpisode });
  }

  if (playable === 0) {
    noPlayable.push(record);
    if (isCatalogOnlyMovie(movie)) catalogNoPlayable.push(record);
    continue;
  }

  if (playable < advertised) {
    severe.push(record);
    if (isBlvietsubMovie(movie)) severeBlvietsub.push(record);
  }
}

if (severe.length > FAIL_LIMIT) {
  failures.push(`Found ${severe.length} recent movies where card advertises a newer episode than playable data.`);
} else if (severe.length > 0) {
  warnings.push(`Found ${severe.length} recent movies where stored metadata is ahead of local playable rows; UI guards should cap displayed episode labels until sync catches up.`);
}

if (noPlayable.length > 0) {
  warnings.push(`Found ${noPlayable.length} recent movies with advertised episodes but no playable episode rows in local tables; live fallback may still cover some sources.`);
}

if (catalogNoPlayable.length > 0) {
  warnings.push(`Found ${catalogNoPlayable.length} TMDB catalog movies advertising episodes without local playable rows; catalog records should stay "Dang cap nhat" until a playable source is attached.`);
}

if (severeBlvietsub.length > 0) {
  warnings.push(`Found ${severeBlvietsub.length} BLVietsub/admin-queer movies where stored episode labels are ahead of playable local rows; run sync:blvietsub or repair the affected source rows.`);
}

if (staleLabels.length > 0) {
  failures.push(`Found ${staleLabels.length} movies where current_episode matches playable data but episode_current label is stale.`);
}

if (invalidCompletionLabels.length > 0) {
  failures.push(`Found ${invalidCompletionLabels.length} impossible completion labels where current episode exceeds total episodes.`);
}

if (queerExternalRows.length > 0) {
  failures.push(`Found ${queerExternalRows.length} BLVietsub/admin-queer playable rows polluted by external OPhim/KKPhim/PhimAPI sources.`);
}

if (legacySingleEpisodeRechecks.length > 0) {
  warnings.push(`Found ${legacySingleEpisodeRechecks.length} BLVietsub movies frozen at one episode; the source repair cron must recheck these instead of trusting completed 1/1 metadata.`);
}

console.log(JSON.stringify({
  auditMode: FULL_AUDIT ? 'full' : 'deploy-gate',
  checkedMovies: movies?.length || 0,
  checkedEpisodeMovies: checked.length,
  homeProxy: {
    source: homeProxyAudit.source,
    minSectionItems: HOME_MIN_SECTION_ITEMS,
    counts: homeProxyAudit.counts,
  },
  countryCoverage: countryCoverageAudit.results,
  severeCount: severe.length,
  severeBlvietsubCount: severeBlvietsub.length,
  staleLabelCount: staleLabels.length,
  invalidCompletionLabelCount: invalidCompletionLabels.length,
  noPlayableCount: noPlayable.length,
  catalogNoPlayableCount: catalogNoPlayable.length,
  queerExternalRowCount: queerExternalRows.length,
  legacySingleEpisodeRecheckCount: legacySingleEpisodeRechecks.length,
  samples: severe.slice(0, 12),
  blvietsubSamples: severeBlvietsub.slice(0, 8),
  staleLabelSamples: staleLabels.slice(0, 8),
  invalidCompletionLabelSamples: invalidCompletionLabels.slice(0, 8),
  legacySingleEpisodeRecheckSamples: legacySingleEpisodeRechecks.slice(0, 12),
  noPlayableSamples: noPlayable.slice(0, 8),
  catalogNoPlayableSamples: catalogNoPlayable.slice(0, 8),
  queerExternalRowSamples: queerExternalRows.slice(0, 8),
  warnings,
  failures,
}, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
