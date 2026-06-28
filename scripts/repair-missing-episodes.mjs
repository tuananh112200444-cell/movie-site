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

function arg(name, fallback = '') {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const CRON_SECRET = env.CRON_SECRET || env.SUPABASE_CRON_SECRET || '';
const APPLY = process.argv.includes('--apply');
const SQL_FILE = arg('sql-file', '');
const LIMIT = Math.max(1, Math.min(Number(arg('limit', '12')) || 12, 50));
const SCAN_LIMIT = Math.max(LIMIT, Math.min(Number(arg('scan-limit', '400')) || 400, 1000));
const MIN_ADVERTISED = Math.max(2, Number(arg('min-advertised', '2')) || 2);
const MAX_ADVERTISED = Math.max(MIN_ADVERTISED, Number(arg('max-advertised', '120')) || 120);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_PUBLIC_SUPABASE_URL or VITE_PUBLIC_SUPABASE_ANON_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function episodeNumberFromText(value) {
  if (value == null) return 0;
  const text = String(value).toLowerCase();
  if (/\b(full|hoan tat|hoàn tất|complete|completed)\b/.test(text)) {
    const matches = [...text.matchAll(/(\d{1,5})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
    return matches.length ? Math.max(...matches) : 0;
  }
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
  if (!hasPlayableUrl) return 0;
  return Math.max(
    Number(row.episode_number || 0) || 0,
    episodeNumberFromText(row.episode_slug),
    episodeNumberFromText(row.slug),
    episodeNumberFromText(row.episode_name),
  );
}

function isOphimLike(movie) {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  return source.includes('ophim') || Boolean(movie.ophim_id || movie.ophim_slug);
}

function normalizeTitle(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function queryRows(table, select, movieIds) {
  const rows = [];
  for (let i = 0; i < movieIds.length; i += 10) {
    const ids = movieIds.slice(i, i + 10);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .in('movie_id', ids)
        .range(from, from + 999)
        .abortSignal(AbortSignal.timeout(20_000));
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

async function findRepairTargets() {
  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, slug, name, origin_name, source_site, source_name, ophim_id, ophim_slug, episode_current, current_episode, updated_at')
    .eq('is_published', true)
    .order('updated_at', { ascending: false })
    .limit(SCAN_LIMIT)
    .abortSignal(AbortSignal.timeout(20_000));
  if (error) throw new Error(`movies: ${error.message}`);

  const ids = (movies || []).map((movie) => movie.id).filter(Boolean);
  const [movieEpisodes, episodes, streams] = await Promise.all([
    queryRows('movie_episodes', 'movie_id, episode_number, slug, episode_name, link_m3u8, link_embed, source', ids),
    queryRows('episodes', 'movie_id, episode_number, episode_slug, episode_name, link_m3u8, link_embed', ids),
    queryRows('streams', 'movie_id, episode_slug, stream_url, embed_url, is_active', ids),
  ]);

  const playableByMovie = new Map();
  for (const row of [
    ...movieEpisodes.filter((row) => String(row.source || '').toLowerCase() !== 'hidden'),
    ...episodes,
    ...streams.filter((row) => row.is_active !== false),
  ]) {
    const ep = playableEpisodeNumber(row);
    if (!row.movie_id || ep <= 0) continue;
    playableByMovie.set(row.movie_id, Math.max(playableByMovie.get(row.movie_id) || 0, ep));
  }

  return (movies || [])
    .map((movie) => ({
      id: movie.id,
      slug: movie.slug,
      name: movie.name,
      origin_name: movie.origin_name,
      source_site: movie.source_site || movie.source_name,
      ophim_id: movie.ophim_id || '',
      ophim_slug: movie.ophim_slug || '',
      advertised: advertisedEpisode(movie),
      playable: playableByMovie.get(movie.id) || 0,
      updated_at: movie.updated_at,
      isOphim: isOphimLike(movie),
    }))
    .filter((movie) =>
      movie.isOphim &&
      movie.advertised >= MIN_ADVERTISED &&
      movie.advertised <= MAX_ADVERTISED &&
      movie.playable < movie.advertised
    )
    .sort((a, b) => (b.advertised - b.playable) - (a.advertised - a.playable))
    .slice(0, LIMIT);
}

async function callOphimRepair(slug) {
  const endpoint = new URL(`${SUPABASE_URL}/functions/v1/auto-sync-ophim-episodes`);
  endpoint.searchParams.set('slug', slug);
  endpoint.searchParams.set('limit', '1');
  endpoint.searchParams.set('delay_ms', '0');
  if (CRON_SECRET) endpoint.searchParams.set('secret', CRON_SECRET);

  const response = await fetch(endpoint, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function sqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? {}))}::jsonb`;
}

function getEpisodeNumber(ep) {
  return episodeNumberFromText(ep?.name) || episodeNumberFromText(ep?.slug);
}

async function fetchOphimDetail(slug) {
  const bases = ['https://ophim1.com', 'https://ophim.tv', 'https://ophim9.cc', 'https://ophim8.cc'];
  for (const base of bases) {
    try {
      const response = await fetch(`${base}/v1/api/phim/${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) continue;
      const json = await response.json();
      const item = json.data?.item || json.item || json.movie || null;
      const episodes = json.data?.item?.episodes || json.item?.episodes || json.episodes || [];
      if (item && Array.isArray(episodes) && episodes.length > 0) {
        return {
          id: String(item._id || slug),
          slug: String(item.slug || slug),
          episodeCurrent: String(item.episode_current || ''),
          episodes,
        };
      }
    } catch {
      /* try next mirror */
    }
  }
  return null;
}

async function searchOphimSlug(target) {
  const keyword = [target.origin_name, target.name].map((value) => String(value || '').trim()).find(Boolean);
  if (!keyword) return '';
  const bases = ['https://ophim1.com', 'https://ophim.tv', 'https://ophim9.cc', 'https://ophim8.cc'];
  const wanted = new Set([target.name, target.origin_name].map(normalizeTitle).filter(Boolean));
  for (const base of bases) {
    try {
      const response = await fetch(`${base}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=8`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) continue;
      const json = await response.json();
      const items = json.data?.items || json.items || [];
      if (!Array.isArray(items)) continue;
      const exact = items.find((item) => [item.name, item.origin_name].map(normalizeTitle).some((title) => wanted.has(title)));
      const fallback = exact || items[0];
      if (fallback?.slug) return String(fallback.slug);
    } catch {
      /* try next mirror */
    }
  }
  return '';
}

async function resolveOphimDetail(target) {
  const candidates = [
    target.ophim_slug,
    target.ophim_id,
    target.slug,
    await searchOphimSlug(target),
  ].map((value) => String(value || '').trim()).filter(Boolean);
  for (const candidate of Array.from(new Set(candidates))) {
    const detail = await fetchOphimDetail(candidate);
    if (detail) return detail;
  }
  return null;
}

function buildRepairSql(targets, detailsBySlug) {
  const statements = [
    '-- Generated by scripts/repair-missing-episodes.mjs',
    'begin;',
  ];

  for (const target of targets) {
    const detail = detailsBySlug.get(target.slug);
    if (!detail) continue;
    let maxEpisode = 0;
    for (const server of detail.episodes) {
      const serverName = String(server.server_name || 'OPhim');
      for (const ep of server.server_data || []) {
        const episodeNumber = getEpisodeNumber(ep);
        if (!episodeNumber) continue;
        maxEpisode = Math.max(maxEpisode, episodeNumber);
        const episodeName = String(ep.name || `Tập ${episodeNumber}`);
        const episodeSlug = String(ep.slug || `tap-${episodeNumber}`);
        const linkM3u8 = String(ep.link_m3u8 || '');
        const linkEmbed = String(ep.link_embed || '');
        if (!linkM3u8 && !linkEmbed) continue;

        statements.push(`
insert into public.movie_episodes (
  movie_id, ophim_id, episode_number, episode_name, slug, server_name,
  link_m3u8, link_embed, subtitle_url, thumbnail_url, duration, source, is_backup
)
select
  m.id, ${sqlString(detail.id || detail.slug)}, ${episodeNumber}, ${sqlString(episodeName)}, ${sqlString(episodeSlug)}, ${sqlString(serverName)},
  ${sqlString(linkM3u8)}, ${sqlString(linkEmbed)}, '', '', '', 'ophim', false
from public.movies m
where m.id = ${sqlString(target.id)}
  and not exists (
    select 1 from public.movie_episodes me
    where me.movie_id = m.id
      and me.server_name = ${sqlString(serverName)}
      and me.episode_number = ${episodeNumber}
  );`);

        statements.push(`
insert into public.episodes (
  movie_id, ophim_id, server_name, episode_number, episode_name, episode_slug,
  link_m3u8, link_embed, subtitle_url, server_data
)
select
  m.id, ${sqlString(detail.id || detail.slug)}, ${sqlString(serverName)}, ${episodeNumber}, ${sqlString(episodeName)}, ${sqlString(episodeSlug)},
  ${sqlString(linkM3u8)}, ${sqlString(linkEmbed)}, '', ${sqlJson(ep)}
from public.movies m
where m.id = ${sqlString(target.id)}
  and not exists (
    select 1 from public.episodes e
    where e.movie_id = m.id
      and e.server_name = ${sqlString(serverName)}
      and e.episode_number = ${episodeNumber}
  );`);

        statements.push(`
insert into public.streams (
  movie_id, ophim_id, server_name, episode_slug, stream_url, embed_url, source, is_active
)
select
  m.id, ${sqlString(detail.id || detail.slug)}, ${sqlString(serverName)}, ${sqlString(episodeSlug)},
  ${sqlString(linkM3u8)}, ${sqlString(linkEmbed)}, 'ophim', true
from public.movies m
where m.id = ${sqlString(target.id)}
  and not exists (
    select 1 from public.streams s
    where s.movie_id = m.id
      and s.server_name = ${sqlString(serverName)}
      and s.episode_slug = ${sqlString(episodeSlug)}
  );`);
      }
    }

    if (maxEpisode > 0) {
      statements.push(`
update public.movies
set
  ophim_id = coalesce(nullif(ophim_id, ''), ${sqlString(detail.id || '')}),
  ophim_slug = coalesce(nullif(ophim_slug, ''), ${sqlString(detail.slug || target.slug)}),
  current_episode = ${maxEpisode},
  total_episodes = greatest(coalesce(total_episodes, 0), ${maxEpisode}),
  episode_current = case
    when greatest(coalesce(current_episode, 0), ${maxEpisode}) >= ${maxEpisode} then episode_current
    else ${sqlString(`Tập ${maxEpisode}`)}
  end,
  last_synced_at = now(),
  updated_at = now()
where id = ${sqlString(target.id)};`);
      statements.push(`
update public.movies
set
  current_episode = ${maxEpisode},
  episode_current = ${sqlString(`Tap ${maxEpisode}`)},
  last_synced_at = now(),
  updated_at = now()
where id = ${sqlString(target.id)};`);
    }
  }

  statements.push('commit;');
  return statements.join('\n');
}

async function refreshCaches() {
  const searchEndpoint = new URL(`${SUPABASE_URL}/functions/v1/search-index-proxy`);
  searchEndpoint.searchParams.set('limit', '5000');
  searchEndpoint.searchParams.set('refresh', '1');

  const homeEndpoint = new URL(`${SUPABASE_URL}/functions/v1/home-proxy`);
  homeEndpoint.searchParams.set('sections', 'trending,phim-le,phim-bo,phim-chieu-rap,hoat-hinh,han-quoc,au-my,thai-lan,trung-quoc');
  homeEndpoint.searchParams.set('refresh', '1');

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  const [search, home] = await Promise.allSettled([
    fetch(searchEndpoint, { headers, signal: AbortSignal.timeout(30_000) }),
    fetch(homeEndpoint, { headers: { ...headers, 'x-home-proxy-refresh': '1' }, signal: AbortSignal.timeout(30_000) }),
  ]);
  return {
    search: search.status === 'fulfilled' ? search.value.status : search.reason?.message,
    home: home.status === 'fulfilled' ? home.value.status : home.reason?.message,
  };
}

const targets = await findRepairTargets();
const repairs = [];
const failures = [];
const details = new Map();

if (SQL_FILE || APPLY) {
  for (const target of targets) {
    const detail = await resolveOphimDetail(target);
    if (detail) details.set(target.slug, detail);
    else failures.push(`${target.slug}: OPhim detail not found`);
  }
}

if (SQL_FILE) {
  fs.writeFileSync(SQL_FILE, buildRepairSql(targets, details), 'utf8');
}

if (APPLY && !SQL_FILE) {
  for (const target of targets) {
    try {
      const result = await callOphimRepair(target.slug);
      repairs.push({ ...target, repair: result.body, status: result.status, ok: result.ok });
      if (!result.ok || result.body?.success === false) failures.push(`${target.slug}: repair returned ${result.status}`);
    } catch (error) {
      repairs.push({ ...target, error: error.message });
      failures.push(`${target.slug}: ${error.message}`);
    }
  }
}

const cacheRefresh = APPLY ? await refreshCaches().catch((error) => ({ error: error.message })) : null;

console.log(JSON.stringify({
  apply: APPLY,
  scan_limit: SCAN_LIMIT,
  min_advertised: MIN_ADVERTISED,
  max_advertised: MAX_ADVERTISED,
  target_count: targets.length,
  targets,
  sql_file: SQL_FILE || null,
  fetched_details: [...details.entries()].map(([slug, detail]) => ({
    slug,
    servers: detail.episodes.length,
    episodes: detail.episodes.reduce((sum, server) => sum + (server.server_data?.length || 0), 0),
  })),
  repairs,
  cache_refresh: cacheRefresh,
  failures,
}, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
