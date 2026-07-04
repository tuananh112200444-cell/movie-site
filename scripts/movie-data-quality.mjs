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

const MOVIE_LIMIT = Number(env.MOVIE_DATA_QUALITY_LIMIT || 400);
const STRICT = env.MOVIE_DATA_QUALITY_STRICT === '1';
const FAIL_LIMIT = Number(env.MOVIE_DATA_QUALITY_MAX_SEVERE || (STRICT ? 0 : Number.POSITIVE_INFINITY));
const HOME_MIN_SECTION_ITEMS = Number(env.MOVIE_DATA_HOME_MIN_SECTION_ITEMS || 6);
const HOME_SECTIONS = [
  'trending',
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

async function queryByMovieIds(table, select, movieIds, orderColumns = []) {
  const rows = [];
  for (const ids of chunk(movieIds, 10)) {
    for (let from = 0; ; from += 1000) {
      let query = supabase
        .from(table)
        .select(select)
        .in('movie_id', ids)
        .order('movie_id', { ascending: true });

      for (const column of orderColumns) {
        query = query.order(column, { ascending: true, nullsFirst: true });
      }

      const { data, error } = await query
        .range(from, from + 999)
        .abortSignal(AbortSignal.timeout(20_000));
      if (error) {
        return { rows, error: `${table}: ${error.message}` };
      }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return { rows, error: null };
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

const { data: movies, error: movieError } = await supabase
  .from('movies')
  .select('id, slug, name, origin_name, source_site, source_name, episode_current, current_episode, total_episodes, updated_at')
  .eq('is_published', true)
  .order('updated_at', { ascending: false })
  .limit(MOVIE_LIMIT)
  .abortSignal(AbortSignal.timeout(20_000));

if (movieError) {
  throw new Error(`movies query failed: ${movieError.message}`);
}

const movieIds = (movies || []).map((movie) => movie.id).filter(Boolean);

const [movieEpisodes, episodes, streams] = await Promise.all([
  queryByMovieIds('movie_episodes', 'movie_id, episode_number, slug, episode_name, server_name, link_m3u8, link_embed, source', movieIds, ['episode_number', 'server_name']),
  queryByMovieIds('episodes', 'movie_id, episode_number, episode_slug, episode_name, server_name, link_m3u8, link_embed, server_data', movieIds, ['episode_number', 'server_name']),
  queryByMovieIds('streams', 'movie_id, episode_slug, server_name, stream_url, embed_url, is_active', movieIds, ['episode_slug', 'server_name']),
]);

for (const result of [movieEpisodes, episodes, streams]) {
  if (result.error) failures.push(result.error);
}

const playableByMovie = new Map();
const sourcesByMovie = new Map();
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
const noPlayable = [];
const catalogNoPlayable = [];
const checked = [];

for (const movie of movies || []) {
  const advertised = advertisedEpisode(movie);
  const playable = playableByMovie.get(movie.id) || 0;
  if (advertised <= 1) continue;
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

console.log(JSON.stringify({
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
  noPlayableCount: noPlayable.length,
  catalogNoPlayableCount: catalogNoPlayable.length,
  samples: severe.slice(0, 12),
  blvietsubSamples: severeBlvietsub.slice(0, 8),
  noPlayableSamples: noPlayable.slice(0, 8),
  catalogNoPlayableSamples: catalogNoPlayable.slice(0, 8),
  warnings,
  failures,
}, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
