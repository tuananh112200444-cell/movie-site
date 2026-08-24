import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const env = Object.fromEntries((await readFile('.env', 'utf8')).split(/\r?\n/)
  .map((line) => line.match(/^([^#=]+)=(.*)$/)).filter(Boolean)
  .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]));
const baseUrl = String(env.VITE_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = String(env.VITE_PUBLIC_SUPABASE_ANON_KEY || '');
if (!baseUrl || !anonKey) throw new Error('Missing public Supabase configuration');

const fields = [
  'id','slug','name','origin_name','title_vi','title_en','title_original','normalized_name',
  'year','type','thumb_url','poster_url','quality','lang','episode_current','episode_total',
  'current_episode','total_episodes','source_site','source_name','tmdb_id','updated_at',
].join(',');

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function shardFor(movie) {
  const first = normalize(movie.name || movie.title_vi || movie.origin_name || movie.slug).charAt(0);
  return /^[a-z0-9]$/.test(first) ? first : '_';
}

async function fetchPage(offset, attempts = 3) {
  const url = new URL(`${baseUrl}/rest/v1/movies`);
  url.searchParams.set('select', fields);
  url.searchParams.set('is_published', 'eq.true');
  url.searchParams.set('superseded_by_movie_id', 'is.null');
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', '1000');
  url.searchParams.set('offset', String(offset));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

const shards = new Map();
let offset = 0;
while (true) {
  const rows = await fetchPage(offset);
  for (const row of rows) {
    const shard = shardFor(row);
    if (!shards.has(shard)) shards.set(shard, []);
    shards.get(shard).push(row);
  }
  offset += rows.length;
  if (rows.length < 1000) break;
  await new Promise((resolve) => setTimeout(resolve, 150));
}

const outputDir = path.resolve('public/search-fallback');
await mkdir(outputDir, { recursive: true });
for (const [shard, rows] of shards) {
  await writeFile(path.join(outputDir, `${shard}.json`), JSON.stringify({ items: rows }), 'utf8');
}
await writeFile(path.join(outputDir, 'meta.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  movies: offset,
  shards: Object.fromEntries([...shards].map(([key, rows]) => [key, rows.length])),
}), 'utf8');

console.log(JSON.stringify({ success: true, movies: offset, shards: shards.size, output: outputDir }));
