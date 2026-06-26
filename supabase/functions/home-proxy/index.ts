import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const OPHIM_BASES = [
  'https://ophim1.com',
  'https://ophim.tv',
  'https://ophim9.cc',
  'https://ophim8.cc',
];

const EXTERNAL_BASES = [
  'https://phimapi.com',
  'https://phimapi.net',
];

/* ── CORS helpers ── */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const INTERNAL_REFRESH_HEADER = 'x-home-proxy-refresh';
const HOME_MIN_SECTION_ITEMS = 6;
function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
/* ── utils ── */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isTrailerOnly(episodeCurrent?: string): boolean {
  if (!episodeCurrent) return false;
  return episodeCurrent.toLowerCase().trim() === 'trailer';
}

function filteredSectionItems(sections: Record<string, unknown[]> | null | undefined, key: string): unknown[] {
  return ((sections?.[key] ?? []) as unknown[])
    .filter((m) => !isTrailerOnly((m as Record<string, unknown>).episode_current as string)) as unknown[];
}

function cacheHasRequestedSections(sections: Record<string, unknown[]> | null | undefined, requestedSections: string[]): boolean {
  if (!sections) return false;
  return requestedSections.every((key) => filteredSectionItems(sections, key).length >= HOME_MIN_SECTION_ITEMS);
}

function buildPayloadFromSections(sections: Record<string, unknown[]> | null | undefined, requestedSections: string[]): Record<string, unknown[]> {
  const payload: Record<string, unknown[]> = {};
  for (const key of requestedSections) {
    payload[key] = filteredSectionItems(sections, key);
  }
  return payload;
}

function mergeFreshWithStableCache(
  freshSections: Record<string, Record<string, unknown>[]>,
  cacheSections: Record<string, unknown[]> | null | undefined,
): Record<string, Record<string, unknown>[]> {
  const merged: Record<string, Record<string, unknown>[]> = {};
  const keys = Array.from(new Set([
    ...Object.keys(cacheSections ?? {}),
    ...Object.keys(freshSections),
  ]));

  for (const key of keys) {
    const fresh = freshSections[key] ?? [];
    const cached = filteredSectionItems(cacheSections, key) as Record<string, unknown>[];
    merged[key] = fresh.length >= HOME_MIN_SECTION_ITEMS || cached.length < HOME_MIN_SECTION_ITEMS
      ? fresh
      : cached;
  }

  return merged;
}

function hotScore(
  item: Record<string, unknown>,
  source: string
): number {
  const currentYear = new Date().getFullYear();
  const movieYear = Number(item.year ?? 0);
  const ep = String(item.episode_current ?? '').toLowerCase().trim();
  const isFull = ep === 'full' || ep === 'full hd' || ep.startsWith('hoàn tất');
  const isCinema = source === 'phim-chieu-rap';
  const yearDiff = currentYear - movieYear;
  const yearScore =
    yearDiff <= 0 ? 60 :
    yearDiff === 1 ? 45 :
    yearDiff === 2 ? 30 :
    yearDiff === 3 ? 15 :
    yearDiff <= 5 ? 5 : 0;
  const mtime = new Date((item.modified as { time?: string })?.time ?? 0).getTime();
  const ageHours = (Date.now() - mtime) / 3600000;
  const freshnessScore = Math.max(0, 80 - ageHours * 2);
  return yearScore + freshnessScore + (isFull ? 25 : 0) + (isCinema ? 15 : 0);
}

/* ── Fetch with short timeout ── */
async function fetchOPhim(
  endpoint: string,
  timeoutMs = 3000
): Promise<Record<string, unknown> | null> {
  const urls = OPHIM_BASES.map((b) => `${b}${endpoint}`);

  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, unknown>;
      const items =
        ((data.data as Record<string, unknown>)?.items as unknown[]) ??
        (data.items as unknown[]) ??
        [];
      if (items.length > 0) return data;
    } catch {
      /* next mirror */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function fetchExternal(
  endpoint: string,
  timeoutMs = 3000
): Promise<Record<string, unknown> | null> {
  for (const base of EXTERNAL_BASES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${endpoint}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, unknown>;
      const items =
        ((data.data as Record<string, unknown>)?.items as unknown[]) ??
        (data.items as unknown[]) ??
        [];
      if (items.length > 0) return data;
    } catch {
      /* next */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function extractItems(data: Record<string, unknown>): unknown[] {
  return (
    ((data.data as Record<string, unknown>)?.items as unknown[]) ??
    (data.items as unknown[]) ??
    []
  );
}

function cleanMovieItem(raw: unknown, sourceSite = ''): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!m.slug || !m.name) return null;

  // Chỉ giữ fields cần thiết cho trang chủ để giảm payload size
  return {
    _id: String(m._id ?? m.id ?? ''),
    name: String(m.name),
    slug: String(m.slug),
    origin_name: String(m.origin_name ?? ''),
    type: String(m.type ?? 'single'),
    thumb_url: String(m.thumb_url ?? ''),
    poster_url: String(m.poster_url ?? ''),
    quality: String(m.quality ?? 'HD'),
    lang: String(m.lang ?? 'Vietsub'),
    year: Number(m.year ?? 0),
    episode_current: String(m.episode_current ?? ''),
    episode_total: String(m.episode_total ?? ''),
    current_episode: Number(m.current_episode ?? 0) || undefined,
    total_episodes: Number(m.total_episodes ?? 0) || undefined,
    schedule_type: String(m.schedule_type ?? ''),
    release_time: String(m.release_time ?? ''),
    release_day: m.release_day === null || m.release_day === undefined ? undefined : Number(m.release_day),
    schedule_timezone: String(m.schedule_timezone ?? ''),
    release_at: String(m.release_at ?? ''),
    next_episode_at: String(m.next_episode_at ?? ''),
    next_episode_name: String(m.next_episode_name ?? ''),
    schedule_note: String(m.schedule_note ?? ''),
    time: String(m.time ?? ''),
    modified: m.modified ?? { time: new Date().toISOString() },
    category: Array.isArray(m.category) ? m.category : [],
    country: Array.isArray(m.country) ? m.country : [],
    chieurap: Boolean(m.chieurap ?? false),
    sub_docquyen: Boolean(m.sub_docquyen ?? false),
    source_site: String(m.source_site ?? sourceSite),
    source_name: String(m.source_name ?? (sourceSite === 'ophim' ? 'OPhim' : sourceSite)),
  };
}

/* ── Build trending list from new-movies ── */
const HOME_OVERRIDE_SELECT = 'id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,poster_url,thumb_url,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,release_at,next_episode_at,next_episode_name,schedule_note,status,source_site,source_name,year,type,tmdb_id,ophim_id,ophim_slug,is_published';
const HOME_SUPABASE_SELECT = 'id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,poster_url,thumb_url,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,release_at,next_episode_at,next_episode_name,schedule_note,source_site,source_name,year,type,category,country,updated_at,is_published';

function normalizeTitle(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function movieMatchKeys(movie: Record<string, unknown>): string[] {
  const year = Number(movie.year || 0);
  const keys: string[] = [];
  const slug = String(movie.slug || '').trim();
  const ophimSlug = String(movie.ophim_slug || '').trim();
  const ophimId = String(movie.ophim_id || movie._id || '').trim();
  const tmdbId = String(movie.tmdb_id || '').trim();
  if (slug) keys.push(`slug:${slug}`);
  if (ophimSlug) keys.push(`slug:${ophimSlug}`);
  if (ophimId) keys.push(`ophim:${ophimId}`);
  if (tmdbId) keys.push(`tmdb:${tmdbId}`);

  const titles = Array.from(new Set([
    movie.name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.title_original,
    movie.origin_name,
    slug.replace(/-/g, ' '),
    ophimSlug.replace(/-/g, ' '),
  ]
    .map(normalizeTitle)
    .filter((title) => title.length >= 3)));

  for (const title of titles) {
    if (year > 0) keys.push(`title-year:${title}:${year}`);
    else if (title.length >= 8) keys.push(`title:${title}`);
  }

  return Array.from(new Set(keys));
}

function overridePriority(movie: Record<string, unknown>): number {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  let score = 0;
  if (source.includes('admin')) score += 1000;
  else if (!source.includes('ophim') && !source.includes('phimapi')) score += 300;
  if (movie.tmdb_id) score += 100;
  if (movie.is_published) score += 20;
  return score;
}

function applyMovieOverride(item: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    _id: override.id || item._id,
    slug: override.slug || item.slug,
    name: override.name || override.title_vi || item.name,
    origin_name: override.origin_name || item.origin_name,
    poster_url: override.poster_url || item.poster_url,
    thumb_url: override.thumb_url || item.thumb_url,
    episode_current: override.episode_current || item.episode_current,
    episode_total: override.episode_total || item.episode_total,
    current_episode: override.current_episode ?? item.current_episode,
    total_episodes: override.total_episodes ?? item.total_episodes,
    schedule_type: override.schedule_type ?? item.schedule_type,
    release_time: override.release_time ?? item.release_time,
    release_day: override.release_day ?? item.release_day,
    schedule_timezone: override.schedule_timezone ?? item.schedule_timezone,
    release_at: override.release_at ?? item.release_at,
    next_episode_at: override.next_episode_at ?? item.next_episode_at,
    next_episode_name: override.next_episode_name ?? item.next_episode_name,
    schedule_note: override.schedule_note ?? item.schedule_note,
    source_site: override.source_site || 'supabase',
    source_name: override.source_name || 'Supabase',
  };
}

function extractEpisodeNumber(value: unknown): number {
  const text = String(value ?? '').toLowerCase();
  if (!text || /\b(trailer|teaser)\b/.test(text)) return 0;
  const matches = [...text.matchAll(/(\d{1,5})/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : 0;
}

function advertisedEpisode(item: Record<string, unknown>): number {
  return Math.max(
    Number(item.current_episode || 0) || 0,
    extractEpisodeNumber(item.episode_current),
  );
}

function capEpisodeToPlayable(item: Record<string, unknown>, playableMax: number): Record<string, unknown> {
  const advertised = advertisedEpisode(item);
  if (!playableMax || !advertised || playableMax === advertised) return item;
  return {
    ...item,
    episode_current: `Tập ${playableMax}`,
    current_episode: playableMax,
    episode_total: Number(item.total_episodes || 0) >= playableMax ? item.episode_total : '',
    total_episodes: Number(item.total_episodes || 0) >= playableMax ? item.total_episodes : undefined,
  };
}

async function enrichWithPlayableEpisodeCounts(
  supabase: ReturnType<typeof createClient>,
  sections: Record<string, Record<string, unknown>[]>,
): Promise<Record<string, Record<string, unknown>[]>> {
  const ids = Array.from(new Set(
    Object.values(sections)
      .flat()
      .map((item) => String(item._id || ''))
      .filter((id) => /^[0-9a-f-]{24,36}$/i.test(id)),
  ));
  if (ids.length === 0) return sections;

  const maxByMovieId = new Map<string, number>();
  const setMax = (movieId: unknown, episodeNumber: unknown) => {
    const id = String(movieId || '');
    const num = Number(episodeNumber || 0) || extractEpisodeNumber(episodeNumber);
    if (!id || !Number.isFinite(num) || num <= 0) return;
    maxByMovieId.set(id, Math.max(maxByMovieId.get(id) || 0, num));
  };

  try {
    const chunkSize = 80;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const [movieEpisodes, episodes, streams] = await Promise.all([
        supabase
          .from('movie_episodes')
          .select('movie_id, episode_number, slug, episode_name, link_m3u8, link_embed, source')
          .in('movie_id', chunk)
          .abortSignal(timeoutSignal(1200)),
        supabase
          .from('episodes')
          .select('movie_id, episode_number, episode_slug, episode_name, link_m3u8, link_embed')
          .in('movie_id', chunk)
          .abortSignal(timeoutSignal(1200)),
        supabase
          .from('streams')
          .select('movie_id, episode_slug, stream_url, embed_url, is_active')
          .in('movie_id', chunk)
          .eq('is_active', true)
          .abortSignal(timeoutSignal(1200)),
      ]);

      for (const row of (movieEpisodes.data ?? []) as Record<string, unknown>[]) {
        if (String(row.source || '').toLowerCase() === 'hidden') continue;
        if (!String(row.link_m3u8 || row.link_embed || '').trim()) continue;
        setMax(row.movie_id, row.episode_number || row.slug || row.episode_name);
      }
      for (const row of (episodes.data ?? []) as Record<string, unknown>[]) {
        if (!String(row.link_m3u8 || row.link_embed || '').trim()) continue;
        setMax(row.movie_id, row.episode_number || row.episode_slug || row.episode_name);
      }
      for (const row of (streams.data ?? []) as Record<string, unknown>[]) {
        if (!String(row.stream_url || row.embed_url || '').trim()) continue;
        setMax(row.movie_id, row.episode_slug);
      }
    }
  } catch {
    return sections;
  }

  if (maxByMovieId.size === 0) return sections;
  const normalized: Record<string, Record<string, unknown>[]> = {};
  for (const [section, items] of Object.entries(sections)) {
    normalized[section] = items.map((item) => capEpisodeToPlayable(item, maxByMovieId.get(String(item._id || '')) || 0));
  }
  return normalized;
}

async function buildSupabaseOverrideMap(
  supabase: ReturnType<typeof createClient>,
  items: Record<string, unknown>[],
): Promise<Map<string, Record<string, unknown>> | null> {
  if (items.length === 0) return null;

  const itemKeys = new Set(items.flatMap(movieMatchKeys));
  const slugs = Array.from(new Set(items.map((m) => String(m.slug || '')).filter(Boolean)));
  const ophimIds = Array.from(new Set(items.map((m) => String(m._id || m.ophim_id || '')).filter(Boolean)));
  const years = Array.from(new Set(items.map((m) => Number(m.year || 0)).filter((year) => Number.isFinite(year) && year > 0)));
  const rows: Record<string, unknown>[] = [];
try {
    const chunkSize = 80;
    for (let i = 0; i < slugs.length; i += chunkSize) {
      const chunk = slugs.slice(i, i + chunkSize);
      const [{ data: bySlug }, { data: byOphimSlug }] = await Promise.all([
        supabase.from('movies').select(HOME_OVERRIDE_SELECT).in('slug', chunk).eq('is_published', true).abortSignal(timeoutSignal(1000)),
        supabase.from('movies').select(HOME_OVERRIDE_SELECT).in('ophim_slug', chunk).eq('is_published', true).abortSignal(timeoutSignal(1000)),
      ]);
      if (bySlug) rows.push(...bySlug as unknown as Record<string, unknown>[]);
      if (byOphimSlug) rows.push(...byOphimSlug as unknown as Record<string, unknown>[]);
    }

    for (let i = 0; i < ophimIds.length; i += chunkSize) {
      const chunk = ophimIds.slice(i, i + chunkSize);
      const { data } = await supabase
        .from('movies')
        .select(HOME_OVERRIDE_SELECT)
        .in('ophim_id', chunk)
        .eq('is_published', true)
        .abortSignal(timeoutSignal(1000));
      if (data) rows.push(...data as unknown as Record<string, unknown>[]);
    }

    if (years.length > 0) {
      const { data } = await supabase
        .from('movies')
        .select(HOME_OVERRIDE_SELECT)
        .in('year', years.slice(0, 12))
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(500)
        .abortSignal(timeoutSignal(1200));
      if (data) rows.push(...data as unknown as Record<string, unknown>[]);
    }
  } catch {
    return null;
  }

  const overrideMap = new Map<string, Record<string, unknown>>();
  const uniqueRows = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = `${row.slug || ''}:${row.ophim_slug || ''}:${row.ophim_id || ''}`;
    uniqueRows.set(id, row);
  }

  for (const row of uniqueRows.values()) {
    const keys = movieMatchKeys(row).filter((key) => itemKeys.has(key));
    if (keys.length === 0) continue;
    for (const key of keys) {
      const current = overrideMap.get(key);
      if (!current || overridePriority(row) > overridePriority(current)) {
        overrideMap.set(key, row);
      }
    }
  }

  return overrideMap.size > 0 ? overrideMap : null;
}
async function buildTrending(
  limit: number
): Promise<Record<string, unknown>[]> {
  const ophimNew = await fetchOPhim('/v1/api/danh-sach/phim-moi-cap-nhat?page=1&sort_field=modified.time&sort_type=desc', 3000);
  const extNew = await fetchExternal('/v1/api/danh-sach/phim-moi-cap-nhat?page=1&sort_field=modified.time&sort_type=desc', 3000);

  const seen = new Set<string>();
  const scored: { item: Record<string, unknown>; score: number }[] = [];

  for (const source of [
    { data: ophimNew, name: 'ophim' },
    { data: extNew, name: 'phimapi' },
  ]) {
    if (!source.data) continue;
    for (const raw of extractItems(source.data)) {
      const m = cleanMovieItem(raw, source.name);
      if (!m) continue;
      if (seen.has(m.slug as string)) continue;
      if (isTrailerOnly(m.episode_current as string)) continue;
      seen.add(m.slug as string);
      scored.push({ item: m, score: hotScore(m, source.name) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

/* ── Fetch a category / type list ── */
function supabaseTypeValues(section: string): string[] {
  if (section === 'phim-le') return ['single', 'phim-le'];
  if (section === 'phim-bo') return ['series', 'phim-bo'];
  if (section === 'hoat-hinh') return ['hoathinh'];
  if (section === 'phim-chieu-rap') return ['single'];
  return [section];
}

async function fetchSupabaseSection(
  supabase: ReturnType<typeof createClient>,
  typeOrCategory: string,
  isCountry = false,
  limit = 18,
): Promise<Record<string, unknown>[]> {
  try {
    let query = supabase
      .from('movies')
      .select(HOME_SUPABASE_SELECT)
      .eq('is_published', true);

    if (isCountry) {
      query = query.filter('country', 'cs', JSON.stringify([{ slug: typeOrCategory }]));
    } else {
      const types = supabaseTypeValues(typeOrCategory);
      query = types.length === 1 ? query.eq('type', types[0]) : query.in('type', types);
    }

    const { data, error } = await query
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(limit * 2)
      .abortSignal(timeoutSignal(1500));

    if (error || !data) return [];

    return (data as Record<string, unknown>[])
      .map((row) => cleanMovieItem({
        ...row,
        _id: row.id,
        modified: { time: row.updated_at || new Date().toISOString() },
      }, 'supabase'))
      .filter(Boolean)
      .filter((m) => !isTrailerOnly((m as Record<string, unknown>).episode_current as string))
      .slice(0, limit) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function fetchSection(
  supabase: ReturnType<typeof createClient>,
  typeOrCategory: string,
  isCountry = false,
  limit = 18
): Promise<Record<string, unknown>[]> {
  const endpoint = isCountry
    ? `/v1/api/danh-sach/phim-moi-cap-nhat?country=${encodeURIComponent(typeOrCategory)}&page=1`
    : `/v1/api/danh-sach/${encodeURIComponent(typeOrCategory)}?page=1`;

  // OPhim ưu tiên
  const ophimData = await fetchOPhim(endpoint, 3000);
  if (ophimData) {
    const items = extractItems(ophimData)
      .map((raw) => cleanMovieItem(raw, 'ophim'))
      .filter(Boolean)
      .filter((m) => !isTrailerOnly((m as Record<string, unknown>).episode_current as string))
      .slice(0, limit);
    if (items.length > 0) return items as Record<string, unknown>[];
  }

  // Fallback external
  const extData = await fetchExternal(endpoint, 3000);
  if (extData) {
    return extractItems(extData)
      .map((raw) => cleanMovieItem(raw, 'phimapi'))
      .filter(Boolean)
      .filter((m) => !isTrailerOnly((m as Record<string, unknown>).episode_current as string))
      .slice(0, limit) as Record<string, unknown>[];
  }

  return fetchSupabaseSection(supabase, typeOrCategory, isCountry, limit);
}

/* ── Supabase custom overrides ── */
async function applySupabaseOverrides(
  supabase: ReturnType<typeof createClient>,
  items: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (items.length === 0) return items;
  const slugs = items.map((m) => m.slug as string).filter(Boolean);
  if (slugs.length === 0) return items;

  try {
    const { data: overrides } = await supabase
      .from('movies')
      .select('slug, name, poster_url, thumb_url, episode_current, episode_total, current_episode, total_episodes, schedule_type, release_time, release_day, schedule_timezone, release_at, next_episode_at, next_episode_name, schedule_note, status')
      .in('slug', slugs)
      .eq('is_published', true);

    if (!overrides || overrides.length === 0) return items;

    const overrideMap = new Map<string, Record<string, unknown>>();
    for (const o of overrides) {
      overrideMap.set(o.slug as string, o as Record<string, unknown>);
    }

    return items.map((item) => {
      const ov = overrideMap.get(item.slug as string);
      if (!ov) return item;
      return {
        ...item,
        name: ov.name || item.name,
        poster_url: ov.poster_url || item.poster_url,
        thumb_url: ov.thumb_url || item.thumb_url,
        episode_current: ov.episode_current || item.episode_current,
        episode_total: ov.episode_total || item.episode_total,
        current_episode: ov.current_episode ?? item.current_episode,
        total_episodes: ov.total_episodes ?? item.total_episodes,
        schedule_type: ov.schedule_type ?? item.schedule_type,
        release_time: ov.release_time ?? item.release_time,
        release_day: ov.release_day ?? item.release_day,
        schedule_timezone: ov.schedule_timezone ?? item.schedule_timezone,
        release_at: ov.release_at ?? item.release_at,
        next_episode_at: ov.next_episode_at ?? item.next_episode_at,
        next_episode_name: ov.next_episode_name ?? item.next_episode_name,
        schedule_note: ov.schedule_note ?? item.schedule_note,
      };
    });
  } catch {
    return items;
  }
}

/* ── Main ── */
serve(async (req) => {
  /* Handle OPTIONS preflight immediately */
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  const url = new URL(req.url);
  const sectionsParam = url.searchParams.get('sections') ?? 'trending,phim-le,phim-bo,hoat-hinh,han-quoc,au-my';
  const requestedSections = sectionsParam.split(',').map((s) => s.trim()).filter(Boolean);
  const forceRefresh = url.searchParams.get('refresh') === '1' && req.headers.get(INTERNAL_REFRESH_HEADER) === '1';
  const CACHE_KEY = 'homepage_v3';
  const CACHE_TTL_MIN = 30;


  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /* 1. Try cache first */
  let cacheRow: { sections: Record<string, unknown>; updated_at: string; expires_at: string } | null = null;
  try {
    const { data } = await supabase
      .from('home_page_cache')
      .select('sections, updated_at, expires_at')
      .eq('id', CACHE_KEY)
      .abortSignal(timeoutSignal(1200))
      .maybeSingle();
    if (data) {
      cacheRow = data as unknown as typeof cacheRow;
    }
  } catch {
    /* ignore cache read errors */
  }

  const now = new Date().toISOString();
  const cacheValid = cacheRow && cacheRow.expires_at > now;
  const cachedSections = (cacheRow?.sections as Record<string, unknown[]> | undefined) ?? undefined;
  const cacheCompleteForRequest = cacheHasRequestedSections(cachedSections, requestedSections);

  /* 2. If cache valid → return immediately (fast path <300ms) */
  if (cacheValid && cacheCompleteForRequest && !forceRefresh) {
    const payload = buildPayloadFromSections(cachedSections, requestedSections);
    return jsonResponse({ status: true, source: 'cache', sections: payload }, 200, {
      'Cache-Control': 'public, max-age=60',
      'X-Cache': 'HIT',
    });
  }
/* 2b. Expired cache is still better than blocking first paint.
     Trigger a background refresh; the foreground request returns stale data fast. */
  if (cacheRow && cacheCompleteForRequest && !forceRefresh) {
    try {
      const refreshUrl = new URL(req.url);
      refreshUrl.searchParams.set('refresh', '1');
      const runtime = globalThis as unknown as {
        EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
      };
      const lockExpiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      runtime.EdgeRuntime?.waitUntil?.(
        (async () => {
          try {
            await supabase
              .from('home_page_cache')
              .update({ expires_at: lockExpiresAt })
              .eq('id', CACHE_KEY)
              .abortSignal(timeoutSignal(800));
          } catch {
            /* cache refresh lock is best-effort */
          }

          await fetch(refreshUrl.toString(), {
            headers: {
              Authorization: req.headers.get('authorization') ?? '',
              apikey: req.headers.get('apikey') ?? '',
              [INTERNAL_REFRESH_HEADER]: '1',
            },
          });
        })().then(() => undefined).catch(() => undefined)
      );
    } catch {
      /* background refresh best-effort */
    }

    const payload = buildPayloadFromSections(cachedSections, requestedSections);
    return jsonResponse({ status: true, source: 'stale', sections: payload }, 200, {
      'Cache-Control': 'public, max-age=60',
      'X-Cache': 'STALE',
    });
  }
  /* 3. Build requested sections in parallel with 3s timeout each */
  const limit = 18;

  const sectionPromises: Record<string, Promise<Record<string, unknown>[]>> = {};

  if (requestedSections.includes('trending')) {
    sectionPromises.trending = buildTrending(limit);
  }
  if (requestedSections.includes('phim-chieu-rap')) {
    sectionPromises['phim-chieu-rap'] = fetchSection(supabase, 'phim-chieu-rap', false, limit);
  }
  if (requestedSections.includes('phim-le')) {
    sectionPromises['phim-le'] = fetchSection(supabase, 'phim-le', false, limit);
  }
  if (requestedSections.includes('phim-bo')) {
    sectionPromises['phim-bo'] = fetchSection(supabase, 'phim-bo', false, limit);
  }
  if (requestedSections.includes('hoat-hinh')) {
    sectionPromises['hoat-hinh'] = fetchSection(supabase, 'hoat-hinh', false, limit);
  }
  if (requestedSections.includes('han-quoc')) {
    sectionPromises['han-quoc'] = fetchSection(supabase, 'han-quoc', true, limit);
  }
  if (requestedSections.includes('au-my')) {
    sectionPromises['au-my'] = fetchSection(supabase, 'au-my', true, limit);
  }
  if (requestedSections.includes('thai-lan')) {
    sectionPromises['thai-lan'] = fetchSection(supabase, 'thai-lan', true, limit);
  }
  if (requestedSections.includes('trung-quoc')) {
    sectionPromises['trung-quoc'] = fetchSection(supabase, 'trung-quoc', true, limit);
  }

  // Race: all sections must finish within 5s total
  const entries = Object.entries(sectionPromises);
  const sectionEntries = await Promise.all(
    entries.map(async ([key, promise]) => {
      try {
        const result = await promise;
        return [key, result] as [string, Record<string, unknown>[]];
      } catch {
        return [key, []] as [string, Record<string, unknown>[]];
      }
    })
  );

  const freshSections: Record<string, Record<string, unknown>[]> = {};
  for (const [key, items] of sectionEntries) {
    freshSections[key] = items;
  }

  /* 4. Apply Supabase overrides in one batch query */
  const allFreshItems = Object.values(freshSections).flat();
  const overrideMap = await buildSupabaseOverrideMap(supabase, allFreshItems);
  if (overrideMap) {
    for (const key of Object.keys(freshSections)) {
      freshSections[key] = freshSections[key].map((item) => {
        const ov = movieMatchKeys(item)
          .map((matchKey) => overrideMap.get(matchKey))
          .find((row): row is Record<string, unknown> => Boolean(row));
        if (!ov) return item;
        return applyMovieOverride(item, ov);
      });
    }
  }

  /* 4b. Filter out trailer-only movies from all sections */
  for (const key of Object.keys(freshSections)) {
    freshSections[key] = freshSections[key].filter(
      (m) => !isTrailerOnly(m.episode_current as string)
    );
  }

  const safeFreshSections = await enrichWithPlayableEpisodeCounts(supabase, freshSections);

  /* 5. Stale-while-revalidate: if OPhim returned nothing but cache exists, return stale */
  const hasAnyFresh = Object.values(safeFreshSections).some((arr) => arr.length > 0);

  if (!hasAnyFresh && cacheRow && cacheCompleteForRequest) {
    const payload = buildPayloadFromSections(cachedSections, requestedSections);
    return jsonResponse({ status: true, source: 'stale', sections: payload }, 200, {
      'Cache-Control': 'public, max-age=30',
      'X-Cache': 'STALE',
    });
  }

  /* 6. Persist to cache.
     Avoid PostgREST upsert here: the large JSONB sections payload has shown high
     temp I/O on small Supabase instances. Updating the fixed cache row is cheaper. */
  const responseSections = mergeFreshWithStableCache(safeFreshSections, cachedSections);
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MIN * 60 * 1000).toISOString();
    const payload = {
      sections: responseSections as unknown as object,
      updated_at: now,
      expires_at: expiresAt,
      source: 'ophim',
    };
    const { data: updatedRows, error: updateError } = await supabase
      .from('home_page_cache')
      .update(payload)
      .eq('id', CACHE_KEY)
      .select('id')
      .abortSignal(timeoutSignal(1000));

    if (!updateError && (!updatedRows || updatedRows.length === 0)) {
      await supabase
        .from('home_page_cache')
        .insert({ id: CACHE_KEY, ...payload })
        .abortSignal(timeoutSignal(1000));
    }
  } catch {
    /* ignore cache write errors */
  }

  /* 7. Return fresh */
  const payload: Record<string, unknown[]> = {};
  for (const key of requestedSections) {
    payload[key] = responseSections[key] ?? [];
  }

  return jsonResponse({ status: true, source: 'fresh', sections: payload }, 200, {
    'Cache-Control': 'public, max-age=60',
    'X-Cache': 'MISS',
  });
});
