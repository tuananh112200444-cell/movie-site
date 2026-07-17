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
const SUPABASE_URL = env.VITE_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const LIMIT = Math.max(1, Math.min(Number(env.SOURCE_BRAIN_WARM_LIMIT || 80), 500));
const CONCURRENCY = Math.max(1, Math.min(Number(env.SOURCE_BRAIN_WARM_CONCURRENCY || 4), 12));

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

function isVerifiedBackup(row) {
  const text = `${row.source || ''} ${row.server_name || ''}`.toLowerCase();
  return text.includes('verified') && (text.includes('ophim') || text.includes('kkphim') || text.includes('phimapi'));
}

async function fetchBlvietsubMovies() {
  const { data, error } = await supabase
    .from('movies')
    .select('id,slug,name,updated_at,source_site,source_name')
    .eq('is_published', true)
    .or('source_site.ilike.%blvietsub%,source_name.ilike.%blvietsub%,source_site.ilike.%admin-queer%,source_name.ilike.%admin-queer%')
    .order('updated_at', { ascending: false })
    .limit(LIMIT)
    .abortSignal(AbortSignal.timeout(40_000));
  if (error) throw new Error(`movies: ${error.message}`);
  return data || [];
}

async function fetchBackupRows(movieIds) {
  const rows = [];
  for (const ids of chunk(movieIds, 200)) {
    const { data, error } = await supabase
      .from('movie_episodes')
      .select('movie_id,server_name,source,episode_number,link_embed,link_m3u8')
      .in('movie_id', ids)
      .abortSignal(AbortSignal.timeout(60_000));
    if (error) throw new Error(`movie_episodes: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function warmMovie(movie) {
  const endpoint = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/movie-detail-proxy`);
  endpoint.searchParams.set('slug', movie.slug);
  endpoint.searchParams.set('refresh', '1');
  endpoint.searchParams.set('__kp_source_brain_warm', String(Date.now()));

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const response = await fetch(endpoint, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: ctrl.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    const servers = Array.isArray(data?.episodes) ? data.episodes : [];
    const verifiedServers = servers
      .map((server) => String(server?.server_name || ''))
      .filter((name) => isVerifiedBackup({ server_name: name, source: name }));
    return {
      slug: movie.slug,
      name: movie.name,
      ok: response.ok && Boolean(data?.status),
      status: response.status,
      verifiedServers: [...new Set(verifiedServers)],
    };
  } finally {
    clearTimeout(t);
  }
}

const movies = await fetchBlvietsubMovies();
const backupRows = await fetchBackupRows(movies.map((movie) => movie.id).filter(Boolean));
const hasVerifiedBackup = new Set(backupRows.filter(isVerifiedBackup).map((row) => row.movie_id));
const targets = movies.filter((movie) => !hasVerifiedBackup.has(movie.id));

const results = [];
for (const batch of chunk(targets, CONCURRENCY)) {
  const settled = await Promise.allSettled(batch.map(warmMovie));
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      results.push(item.value);
    } else {
      results.push({ ok: false, error: item.reason instanceof Error ? item.reason.message : String(item.reason) });
    }
  }
}

const warmedWithVerified = results.filter((item) => item.ok && item.verifiedServers?.length > 0);
const stillMissing = results.filter((item) => !item.verifiedServers?.length);

console.log(JSON.stringify({
  checkedBlvietsubMovies: movies.length,
  alreadyHadVerifiedBackup: hasVerifiedBackup.size,
  warmed: results.length,
  warmedWithVerified: warmedWithVerified.length,
  stillMissingVerifiedBackup: stillMissing.length,
  warmedSamples: warmedWithVerified.slice(0, 10),
  stillMissingSamples: stillMissing.slice(0, 10),
}, null, 2));
