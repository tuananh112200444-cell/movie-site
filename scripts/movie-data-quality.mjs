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
  const matches = [...text.matchAll(/(\d{1,5})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : 0;
}

function advertisedEpisode(movie) {
  return Math.max(
    Number(movie.current_episode || 0) || 0,
    episodeNumberFromText(movie.episode_current),
  );
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

async function queryByMovieIds(table, select, movieIds) {
  const rows = [];
  for (const ids of chunk(movieIds, 10)) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .in('movie_id', ids)
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
  queryByMovieIds('movie_episodes', 'movie_id, episode_number, slug, episode_name, server_name, link_m3u8, link_embed, source', movieIds),
  queryByMovieIds('episodes', 'movie_id, episode_number, episode_slug, episode_name, server_name, link_m3u8, link_embed, server_data', movieIds),
  queryByMovieIds('streams', 'movie_id, episode_slug, server_name, stream_url, embed_url, is_active', movieIds),
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
const noPlayable = [];
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
    continue;
  }

  if (playable < advertised) {
    severe.push(record);
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

console.log(JSON.stringify({
  checkedMovies: movies?.length || 0,
  checkedEpisodeMovies: checked.length,
  severeCount: severe.length,
  noPlayableCount: noPlayable.length,
  samples: severe.slice(0, 12),
  noPlayableSamples: noPlayable.slice(0, 8),
  warnings,
  failures,
}, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
