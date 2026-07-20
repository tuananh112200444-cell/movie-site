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
const LIMIT = Math.max(1, Math.min(Number(process.env.SOURCE_BRAIN_LIMIT || 10_000), 20_000));
const QUERY_CONCURRENCY = Math.max(1, Math.min(Number(process.env.SOURCE_BRAIN_CONCURRENCY || 4), 8));

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_PUBLIC_SUPABASE_URL or VITE_PUBLIC_SUPABASE_ANON_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function episodeNumberFromText(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return 0;
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

function playableNumber(row) {
  const directNumber = Math.max(
    Number(row.episode_number || 0) || 0,
    episodeNumberFromText(row.slug),
    episodeNumberFromText(row.episode_slug),
    episodeNumberFromText(row.episode_name),
  );
  const hasUrl = Boolean(String(row.link_m3u8 || row.stream_url || '').trim() || String(row.link_embed || row.embed_url || '').trim());
  const nestedRows = Array.isArray(row.server_data)
    ? row.server_data
    : row.server_data && typeof row.server_data === 'object'
      ? [row.server_data]
      : [];
  const nestedPlayable = nestedRows.some((ep) => String(ep?.link_m3u8 || '').trim() || String(ep?.link_embed || '').trim());
  const nestedNumber = nestedRows.reduce((max, ep) => Math.max(
    max,
    Number(ep?.episode_number || 0) || 0,
    episodeNumberFromText(ep?.slug),
    episodeNumberFromText(ep?.name),
    episodeNumberFromText(ep?.filename),
  ), 0);
  if (!hasUrl && !nestedPlayable) return 0;
  return Math.max(directNumber, nestedNumber);
}

function sourceKind(row) {
  const haystack = [
    row.source,
    row.server_name,
    row.link_embed,
    row.link_m3u8,
    row.embed_url,
    row.stream_url,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  if (haystack.includes('verified') && haystack.includes('ophim')) return 'verified_ophim';
  if (haystack.includes('verified') && (haystack.includes('kkphim') || haystack.includes('phimapi'))) return 'verified_kkphim';
  if (haystack.includes('blvietsub') || haystack.includes('ssplay') || haystack.includes('abyssplayer') || haystack.includes('dailymotion')) return 'blvietsub';
  if (haystack.includes('ophim') || haystack.includes('opstream')) return 'ophim';
  if (haystack.includes('kkphim') || haystack.includes('phimapi')) return 'kkphim';
  if (haystack.includes('video.khophim.org') || haystack.includes('supabase.co')) return 'owned';
  return 'other';
}

async function fetchPublishedMovies() {
  const rows = [];
  for (let from = 0; rows.length < LIMIT; from += 1000) {
    const { data, error } = await supabase
      .from('movies')
      .select('id,slug,name,source_site,source_name,episode_current,current_episode,total_episodes,updated_at')
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .range(from, Math.min(from + 999, LIMIT - 1))
      .abortSignal(AbortSignal.timeout(40_000));
    if (error) throw new Error(`movies: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function queryRows(table, select, movieIds) {
  const idChunks = chunk(movieIds, 200);
  const chunkResults = new Array(idChunks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < idChunks.length) {
      const index = cursor++;
      const ids = idChunks[index];
      const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .in('movie_id', ids)
        .range(from, from + 999)
        .abortSignal(AbortSignal.timeout(60_000));
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
      chunkResults[index] = rows;
    }
  }

  await Promise.all(Array.from({ length: Math.min(QUERY_CONCURRENCY, idChunks.length) }, () => worker()));
  return chunkResults.flat();
}

const movies = await fetchPublishedMovies();
const movieIds = movies.map((movie) => movie.id).filter(Boolean);
const [movieEpisodes, episodes, streams] = await Promise.all([
  queryRows('movie_episodes', 'movie_id,episode_number,slug,episode_name,server_name,source,link_embed,link_m3u8', movieIds),
  queryRows('episodes', 'movie_id,episode_number,episode_slug,episode_name,server_name,link_embed,link_m3u8,server_data', movieIds),
  queryRows('streams', 'movie_id,episode_slug,server_name,source,stream_url,embed_url,is_active,health_status,failure_count,response_time_ms', movieIds),
]);

const rowsByMovie = new Map();
for (const row of [
  ...movieEpisodes,
  ...episodes.map((row) => ({ ...row, source: 'legacy' })),
  ...streams.filter((row) => row.is_active !== false),
]) {
  if (!row.movie_id) continue;
  const rows = rowsByMovie.get(row.movie_id) || [];
  rows.push(row);
  rowsByMovie.set(row.movie_id, rows);
}

const needsRepair = [];
const noBackup = [];
const unhealthyOnly = [];
const legacySingleEpisodeRechecks = [];
const backupCoverage = {
  totalPlayable: 0,
  withVerifiedBackup: 0,
  withAnyBackup: 0,
  blvietsubMovies: 0,
};

for (const movie of movies) {
  const advertised = advertisedEpisode(movie);
  const rows = rowsByMovie.get(movie.id) || [];
  const playableRows = rows.filter((row) => playableNumber(row) > 0);
  const playableMax = playableRows.reduce((max, row) => Math.max(max, playableNumber(row)), 0);
  const kinds = new Set(playableRows.map(sourceKind));
  const sourceText = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  const isBlvietsub = sourceText.includes('blvietsub') || sourceText.includes('admin-queer');

  if (isBlvietsub && advertised <= 1 && playableMax <= 1) {
    legacySingleEpisodeRechecks.push({
      slug: movie.slug,
      name: movie.name,
      advertised,
      playableMax,
      sources: [...kinds],
    });
  }

  if (playableMax > 0) backupCoverage.totalPlayable += 1;
  if (isBlvietsub) backupCoverage.blvietsubMovies += 1;
  if (kinds.has('verified_ophim') || kinds.has('verified_kkphim')) backupCoverage.withVerifiedBackup += 1;
  if (kinds.size > 1) backupCoverage.withAnyBackup += 1;

  if (advertised > playableMax && advertised > 1) {
    needsRepair.push({
      slug: movie.slug,
      name: movie.name,
      advertised,
      playableMax,
      sources: [...kinds],
    });
  }

  if (isBlvietsub && playableMax > 0 && !kinds.has('verified_ophim') && !kinds.has('verified_kkphim') && !kinds.has('owned')) {
    noBackup.push({
      slug: movie.slug,
      name: movie.name,
      playableMax,
      sources: [...kinds],
    });
  }

  const unhealthyRows = playableRows.filter((row) => ['failed', 'dead', 'blocked'].includes(String(row.health_status || '').toLowerCase()));
  if (playableRows.length > 0 && unhealthyRows.length === playableRows.length) {
    unhealthyOnly.push({
      slug: movie.slug,
      name: movie.name,
      playableMax,
      badRows: unhealthyRows.length,
    });
  }
}

const failures = [];
if (needsRepair.length > 0) failures.push(`Found ${needsRepair.length} movies advertising episodes newer than stored playable links.`);
if (unhealthyOnly.length > 0) failures.push(`Found ${unhealthyOnly.length} movies where every playable row is marked unhealthy.`);

console.log(JSON.stringify({
  checkedMovies: movies.length,
  checkedRows: movieEpisodes.length + episodes.length + streams.length,
  backupCoverage,
  needsRepairCount: needsRepair.length,
  noBackupBlvietsubCount: noBackup.length,
  unhealthyOnlyCount: unhealthyOnly.length,
  legacySingleEpisodeRecheckCount: legacySingleEpisodeRechecks.length,
  needsRepairSamples: needsRepair.slice(0, 10),
  noBackupBlvietsubSamples: noBackup.slice(0, 10),
  unhealthyOnlySamples: unhealthyOnly.slice(0, 10),
  legacySingleEpisodeRecheckSamples: legacySingleEpisodeRechecks.slice(0, 20),
  failures,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
