import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      if (idx === -1) return [line, ''];
      return [line.slice(0, idx), line.slice(idx + 1).replace(/^['"]|['"]$/g, '')];
    }),
);

const SUPABASE_URL = env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_PUBLIC_SUPABASE_URL or VITE_PUBLIC_SUPABASE_ANON_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SELECT_FIELDS = [
  'id',
  'slug',
  'name',
  'origin_name',
  'title_vi',
  'title_en',
  'title_zh',
  'title_original',
  'normalized_name',
  'episode_current',
  'episode_total',
  'current_episode',
  'total_episodes',
  'source_site',
  'source_name',
  'is_published',
  'updated_at',
].join(', ');

const CASES = [
  {
    query: 'human resources season 2',
    expectSlug: 'nguon-nhan-luc-phan-2',
    description: 'English long title with season number',
  },
  {
    query: 'nguon nhan luc phan 2',
    expectSlug: 'nguon-nhan-luc-phan-2',
    description: 'Vietnamese title without accents and season',
  },
  {
    query: 'lai bi giet nua a thua tham tu',
    expectSlug: 'lai-co-an-mang-nua-roi-thua-tham-tu',
    description: 'Long Vietnamese title without accents',
  },
  {
    query: 'fourever you season 2',
    expectSlug: 'fourever-you-phan-2',
    description: 'Season query should prefer matching season',
  },
  {
    query: 'season 2',
    expectAnySeasonTwo: true,
    description: 'Broad season query should return multiple season-2 options',
  },
  {
    query: 'thien su nha ben phan 2',
    expectSlug: 'thien-su-nha-ben-phan-2',
    description: 'KKPhim synced title should be searchable without accents',
  },
  {
    query: 'fix the error',
    expectSlug: 'blvietsub-1652315128481409420-fix-the-error',
    description: 'BLVietsub title should be searchable from Supabase',
  },
];

function escapePostgrestIlike(value) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, ' ');
}

function normalizeSearchText(value = '') {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function seasonSignature(movie) {
  const text = normalizeSearchText([
    movie.name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.origin_name,
    String(movie.slug || '').replace(/-/g, ' '),
  ].filter(Boolean).join(' '));
  const patterns = [
    /\b(?:season|ss|phan|mua|part)\s*(\d{1,2})\b/,
    /\b(\d{1,2})\s*(?:season|ss|phan|mua|part)\b/,
    /\bs(\d{1,2})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return String(Number(match[1]));
  }
  return '';
}

function textScore(text, query, tokens) {
  if (!text || !query) return 0;
  if (text === query) return 1200;
  if (text.startsWith(query)) return 900;
  if (text.includes(query)) return 650;
  const parts = text.split(' ').filter(Boolean);
  const compactText = text.replace(/\s+/g, '');
  const compactQuery = query.replace(/\s+/g, '');
  let score = compactQuery.length >= 6 && compactText.includes(compactQuery) ? 520 : 0;
  let matchedTokens = 0;
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (parts.some((part) => part === token)) {
      score += 140;
      matchedTokens++;
    } else if (text.includes(token)) {
      score += 70;
      matchedTokens++;
    }
  }
  const meaningfulTokens = tokens.filter((token) => token.length >= 2);
  if (meaningfulTokens.length > 0) {
    const coverage = matchedTokens / meaningfulTokens.length;
    if (coverage === 1) score += meaningfulTokens.length >= 3 ? 420 : 180;
    else if (coverage >= 0.75) score += 180;
  }
  return score;
}

function querySeason(query) {
  return query.match(/\b(?:season|ss|phan|mua|part)\s*(\d{1,2})\b/)?.[1]
    ?? query.match(/\b(\d{1,2})\s*(?:season|ss|phan|mua|part)\b/)?.[1]
    ?? query.match(/\bs(\d{1,2})\b/)?.[1]
    ?? '';
}

function scoreMovie(movie, keyword) {
  const query = normalizeSearchText(keyword);
  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;
  score += textScore(normalizeSearchText(movie.name), query, tokens) * 5;
  score += textScore(normalizeSearchText(movie.title_vi), query, tokens) * 4;
  score += textScore(normalizeSearchText(movie.origin_name), query, tokens) * 3;
  score += textScore(normalizeSearchText(movie.title_en), query, tokens) * 3;
  score += textScore(normalizeSearchText(movie.slug), query, tokens);
  score += textScore(normalizeSearchText(movie.episode_current), query, tokens);
  score += textScore(normalizeSearchText(movie.episode_total), query, tokens);

  const wantedSeason = querySeason(query);
  const movieSeason = seasonSignature(movie);
  if (wantedSeason && movieSeason && Number(wantedSeason) === Number(movieSeason)) score += 450;
  if (wantedSeason && movieSeason && Number(wantedSeason) !== Number(movieSeason)) score -= 300;
  return score;
}

async function searchSupabase(keyword, limit = 36) {
  const normalized = normalizeSearchText(keyword);
  const safeKeyword = escapePostgrestIlike(keyword);
  const safeNormalized = escapePostgrestIlike(normalized);
  const safeSlug = escapePostgrestIlike(normalized.replace(/\s+/g, '-'));
  const tokens = Array.from(new Set(
    normalized.split(/\s+/).map((token) => token.trim()).filter((token) => token.length >= 2 || /^\d+$/.test(token)),
  )).slice(0, 8);

  const filters = Array.from(new Set([
    `name.ilike.%${safeKeyword}%`,
    `origin_name.ilike.%${safeKeyword}%`,
    `title_vi.ilike.%${safeKeyword}%`,
    `title_en.ilike.%${safeKeyword}%`,
    `title_zh.ilike.%${safeKeyword}%`,
    `title_original.ilike.%${safeKeyword}%`,
    `slug.ilike.%${safeKeyword}%`,
    `normalized_name.ilike.%${safeKeyword}%`,
    `normalized_name.ilike.%${safeNormalized}%`,
    `normalized_name.ilike.%${safeSlug}%`,
    `slug.ilike.%${safeSlug}%`,
    `name.ilike.%${safeNormalized}%`,
    `origin_name.ilike.%${safeNormalized}%`,
    `title_vi.ilike.%${safeNormalized}%`,
    `title_en.ilike.%${safeNormalized}%`,
  ])).join(',');

  const records = new Map();
  const addRecords = (rows = []) => {
    for (const row of rows) {
      const id = String(row.id || row.slug || '');
      if (id && !records.has(id)) records.set(id, row);
    }
  };

  const primary = await supabase
    .from('movies')
    .select(SELECT_FIELDS)
    .eq('is_published', true)
    .or(filters)
    .order('updated_at', { ascending: false })
    .limit(Math.max(limit * 4, 48));
  if (primary.error) throw new Error(primary.error.message);
  addRecords(primary.data);

  if (records.size < Math.min(8, limit) && tokens.length >= 3) {
    const fields = ['normalized_name', 'slug', 'title_en', 'origin_name', 'title_vi', 'name'];
    const tokenResults = await Promise.allSettled(fields.map(async (field) => {
      let query = supabase
        .from('movies')
        .select(SELECT_FIELDS)
        .eq('is_published', true)
        .limit(Math.max(limit, 24));
      for (const token of tokens) {
        query = query.ilike(field, `%${escapePostgrestIlike(token)}%`);
      }
      const result = await query;
      if (result.error) throw new Error(result.error.message);
      return result.data ?? [];
    }));
    for (const result of tokenResults) {
      if (result.status === 'fulfilled') addRecords(result.value);
    }
  }

  return Array.from(records.values())
    .sort((a, b) => scoreMovie(b, keyword) - scoreMovie(a, keyword))
    .slice(0, limit);
}

async function inspectProxy() {
  const endpoint = new URL(`${SUPABASE_URL}/functions/v1/search-index-proxy`);
  endpoint.searchParams.set('limit', '3000');
  const start = performance.now();
  const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  const json = await response.json();
  return {
    status: response.status,
    source: json.source,
    items: Array.isArray(json.items) ? json.items.length : 0,
    ms: Math.round(performance.now() - start),
    xCache: response.headers.get('x-cache'),
  };
}

const failures = [];
const results = [];

let proxy;
try {
  proxy = await inspectProxy();
  if (proxy.items < 2500) {
    failures.push(`search-index-proxy returned ${proxy.items} items for limit=3000; deploy the latest function or raise its limit.`);
  }
} catch (error) {
  failures.push(`search-index-proxy failed: ${error.message}`);
}

for (const testCase of CASES) {
  const start = performance.now();
  const items = await searchSupabase(testCase.query);
  const ms = Math.round(performance.now() - start);
  const top = items.slice(0, 5).map((movie) => ({
    slug: movie.slug,
    name: movie.name,
    origin_name: movie.origin_name,
    episode_current: movie.episode_current,
    source_site: movie.source_site,
    season: seasonSignature(movie),
  }));
  const slugs = new Set(items.map((movie) => movie.slug));
  const seasonTwoCount = items.filter((movie) => seasonSignature(movie) === '2').length;

  if (testCase.expectSlug && !slugs.has(testCase.expectSlug)) {
    failures.push(`${testCase.description}: expected ${testCase.expectSlug} for query "${testCase.query}"`);
  }
  if (testCase.expectAnySeasonTwo && seasonTwoCount < 3) {
    failures.push(`${testCase.description}: expected at least 3 season-2 results, got ${seasonTwoCount}`);
  }
  if (ms > 4_000) {
    failures.push(`${testCase.description}: query took ${ms}ms, expected <= 4000ms`);
  }

  results.push({
    query: testCase.query,
    description: testCase.description,
    ms,
    count: items.length,
    top,
  });
}

console.log(JSON.stringify({ proxy, results, failures }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
