import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') ?? '';
const TMDB_READ_ACCESS_TOKEN = Deno.env.get('TMDB_READ_ACCESS_TOKEN') ?? '';
const TMDB_BASE = 'https://api.themoviedb.org/3';

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
const HOME_FRESH_EPISODE_DAYS = 14;
const STATIC_HOME_FALLBACK_URL = 'https://khophim.org/home-fallback.json';
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

function homeCacheControl(maxAge = 60): string {
  return `public, max-age=${maxAge}, stale-while-revalidate=600, stale-if-error=86400`;
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

async function readStaticHomeFallback(requestedSections: string[]): Promise<Record<string, unknown[]> | null> {
  try {
    const response = await fetch(STATIC_HOME_FALLBACK_URL, {
      signal: timeoutSignal(1200),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const payload = await response.json() as { sections?: Record<string, unknown[]> };
    if (!payload.sections) return null;
    const sections = buildPayloadFromSections(payload.sections, requestedSections);
    return cacheHasRequestedSections(sections, requestedSections) ? sections : null;
  } catch {
    return null;
  }
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

function movieModifiedAt(item: Record<string, unknown>): number {
  const raw = (item.modified as { time?: string } | undefined)?.time
    ?? item.updated_at
    ?? item.last_episode_change_at
    ?? 0;
  const value = new Date(String(raw)).getTime();
  return Number.isFinite(value) ? value : 0;
}

async function fetchFreshEpisodeMovies(
  supabase: ReturnType<typeof createClient>,
  limit: number,
): Promise<Record<string, unknown>[]> {
  try {
    const { data: changes, error: changesError } = await supabase
      .from('movie_seo_quality_status')
      .select('movie_id,last_episode_change_at')
      .not('last_episode_change_at', 'is', null)
      .gte('last_episode_change_at', new Date(Date.now() - HOME_FRESH_EPISODE_DAYS * 86400000).toISOString())
      .order('last_episode_change_at', { ascending: false, nullsFirst: false })
      .limit(limit)
      .abortSignal(timeoutSignal(1200));

    if (changesError || !changes?.length) return [];
    const changedAtById = new Map<string, string>();
    for (const row of changes as Record<string, unknown>[]) {
      const movieId = String(row.movie_id || '');
      const changedAt = String(row.last_episode_change_at || '');
      if (movieId && changedAt) changedAtById.set(movieId, changedAt);
    }

    const ids = Array.from(changedAtById.keys());
    const { data: movies, error: moviesError } = await supabase
      .from('movies')
      .select(`${HOME_SUPABASE_SELECT},tmdb_popularity,quality,lang`)
      .in('id', ids)
      .eq('is_published', true)
      .not('poster_url', 'is', null)
      .abortSignal(timeoutSignal(1400));

    if (moviesError || !movies?.length) return [];
    const currentYear = new Date().getFullYear();
    return (movies as Record<string, unknown>[])
      .filter((movie) => {
        const currentEpisode = Math.max(
          Number(movie.current_episode || 0) || 0,
          extractEpisodeNumber(movie.episode_current),
        );
        const totalEpisodes = Math.max(
          Number(movie.total_episodes || 0) || 0,
          extractEpisodeNumber(movie.episode_total),
        );
        const label = String(movie.episode_current || '').toLowerCase();
        const explicitlyCompleted = label.includes('hoàn tất') || label === 'full' || label === 'full hd';
        const stillAiring = currentEpisode > 0 && (!totalEpisodes || currentEpisode < totalEpisodes) && !explicitlyCompleted;
        const recentRelease = Number(movie.year || 0) >= currentYear - 1;
        return stillAiring || recentRelease;
      })
      .map((movie) => {
        const changedAt = changedAtById.get(String(movie.id || '')) || String(movie.updated_at || '');
        return cleanMovieItem({
          ...movie,
          _id: movie.id,
          last_episode_change_at: changedAt,
          modified: { time: changedAt },
        }, 'supabase-episode');
      })
      .filter(Boolean)
      .filter((movie) => !isTrailerOnly((movie as Record<string, unknown>).episode_current as string))
      .sort((a, b) => movieModifiedAt(b as Record<string, unknown>) - movieModifiedAt(a as Record<string, unknown>))
      .slice(0, limit) as Record<string, unknown>[];
  } catch {
    // Older schemas may not have the episode-freshness table yet. Upstream
    // feeds remain a safe compatibility fallback.
    return [];
  }
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
    tmdb_id: String(m.tmdb_id ?? ((m.tmdb as Record<string, unknown> | undefined)?.id ?? '')),
    hero_backdrop_url: String(m.hero_backdrop_url ?? ''),
    hero_poster_url: String(m.hero_poster_url ?? ''),
    tmdb_popularity: Number(m.tmdb_popularity ?? 0) || 0,
  };
}

/* ── Build trending list from new-movies ── */
const HOME_OVERRIDE_SELECT = 'id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,poster_url,thumb_url,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,release_at,next_episode_at,next_episode_name,schedule_note,status,source_site,source_name,year,type,tmdb_id,ophim_id,ophim_slug,is_published';
const HOME_SUPABASE_SELECT = 'id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,poster_url,thumb_url,hero_backdrop_url,hero_poster_url,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,release_at,next_episode_at,next_episode_name,schedule_note,source_site,source_name,year,type,category,country,updated_at,is_published,tmdb_id';

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

function tmdbMediaType(item: Record<string, unknown>): 'movie' | 'tv' {
  const type = String(item.type || '').toLowerCase();
  return ['series', 'tvshows', 'hoathinh'].includes(type) ? 'tv' : 'movie';
}

async function fetchVerifiedTmdbHeroArtwork(
  item: Record<string, unknown>,
): Promise<{ tmdbId: string; backdropUrl: string; posterUrl: string } | null> {
  if (!TMDB_API_KEY && !TMDB_READ_ACCESS_TOKEN) return null;

  const mediaType = tmdbMediaType(item);
  const existingId = String(item.tmdb_id || '').trim();
  const queryTitle = String(item.origin_name || item.name || '').trim();
  const expectedYear = Number(item.year || 0);
  const headers = TMDB_READ_ACCESS_TOKEN
    ? { Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}` }
    : undefined;
  const addAuth = (url: URL) => {
    if (TMDB_API_KEY) url.searchParams.set('api_key', TMDB_API_KEY);
    url.searchParams.set('language', 'en-US');
  };

  try {
    let selected: Record<string, unknown> | null = null;
    if (existingId) {
      const detailUrl = new URL(`${TMDB_BASE}/${mediaType}/${existingId}`);
      addAuth(detailUrl);
      const response = await fetch(detailUrl, { headers, signal: timeoutSignal(1400) });
      if (response.ok) selected = await response.json() as Record<string, unknown>;
    } else if (queryTitle) {
      const searchUrl = new URL(`${TMDB_BASE}/search/${mediaType}`);
      addAuth(searchUrl);
      searchUrl.searchParams.set('query', queryTitle);
      if (expectedYear > 0) {
        searchUrl.searchParams.set(mediaType === 'tv' ? 'first_air_date_year' : 'year', String(expectedYear));
      }
      const response = await fetch(searchUrl, { headers, signal: timeoutSignal(1400) });
      if (!response.ok) return null;
      const payload = await response.json() as { results?: Record<string, unknown>[] };
      const expectedTitles = new Set([
        normalizeTitle(item.name),
        normalizeTitle(item.origin_name),
        normalizeTitle(item.title_original),
        normalizeTitle(item.title_en),
      ].filter(Boolean));
      selected = (payload.results ?? []).find((candidate) => {
        const candidateTitle = normalizeTitle(candidate.title || candidate.name || candidate.original_title || candidate.original_name);
        const candidateYear = Number(String(candidate.release_date || candidate.first_air_date || '').slice(0, 4)) || 0;
        const titleMatches = expectedTitles.has(candidateTitle);
        const yearMatches = !expectedYear || !candidateYear || Math.abs(expectedYear - candidateYear) <= 1;
        return titleMatches && yearMatches;
      }) ?? null;
    }

    const tmdbId = String(selected?.id || existingId || '').trim();
    const backdropPath = String(selected?.backdrop_path || '').trim();
    const posterPath = String(selected?.poster_path || '').trim();
    if (!tmdbId || !backdropPath) return null;
    return {
      tmdbId,
      backdropUrl: `https://image.tmdb.org/t/p/w1280${backdropPath}`,
      posterUrl: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : '',
    };
  } catch {
    return null;
  }
}

async function enrichTrendingHeroArtwork(
  supabase: ReturnType<typeof createClient>,
  items: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const heroWindow = items.slice(0, 8);
  const enriched = await Promise.all(heroWindow.map(async (item) => {
    if (String(item.hero_backdrop_url || '').trim()) return item;
    const artwork = await fetchVerifiedTmdbHeroArtwork(item);
    if (!artwork) return item;

    const next = {
      ...item,
      tmdb_id: artwork.tmdbId,
      hero_backdrop_url: artwork.backdropUrl,
      hero_poster_url: artwork.posterUrl,
    };
    const slug = String(item.slug || '').trim();
    if (slug) {
      await supabase
        .from('movies')
        .update({
          tmdb_id: artwork.tmdbId,
          hero_backdrop_url: artwork.backdropUrl,
          hero_poster_url: artwork.posterUrl || null,
        })
        .eq('slug', slug)
        .abortSignal(timeoutSignal(900))
        .then(() => undefined)
        .catch(() => undefined);
    }
    return next;
  }));
  return [...enriched, ...items.slice(heroWindow.length)];
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
  const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[1] || 0) || 0;
  const range = text.match(/(?:tap|ep|episode|tập)?\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
  if (range) return Number(range[2] || 0) || Number(range[1] || 0) || 0;
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
  supabase: ReturnType<typeof createClient>,
  limit: number
): Promise<Record<string, unknown>[]> {
  const [ophimNew, extNew, popularResult, freshEpisodeMovies] = await Promise.all([
    fetchOPhim('/v1/api/danh-sach/phim-moi-cap-nhat?page=1&sort_field=modified.time&sort_type=desc', 3000),
    fetchExternal('/danh-sach/phim-moi-cap-nhat?page=1&sort_field=modified.time&sort_type=desc', 3000),
    supabase
      .from('movies')
      .select(`${HOME_SUPABASE_SELECT},tmdb_popularity,quality,lang`)
      .eq('is_published', true)
      .not('poster_url', 'is', null)
      .gte('updated_at', new Date(Date.now() - 90 * 86400000).toISOString())
      .order('tmdb_popularity', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(limit * 3)
      .abortSignal(timeoutSignal(1800)),
    fetchFreshEpisodeMovies(supabase, limit * 2),
  ]);

  const scored = new Map<string, { item: Record<string, unknown>; score: number }>();
  const freshUpstream: Record<string, unknown>[] = [];

  for (const source of [
    { data: ophimNew, name: 'ophim' },
    { data: extNew, name: 'phimapi' },
    {
      data: popularResult.data?.length
        ? { items: popularResult.data.map((movie) => ({ ...movie, _id: movie.id, modified: { time: movie.updated_at } })) }
        : null,
      name: 'supabase-popular',
    },
    {
      data: freshEpisodeMovies.length ? { items: freshEpisodeMovies } : null,
      name: 'supabase-episode',
    },
  ]) {
    if (!source.data) continue;
    for (const raw of extractItems(source.data)) {
      const m = cleanMovieItem(raw, source.name);
      if (!m) continue;
      if (isTrailerOnly(m.episode_current as string)) continue;
      if (source.name === 'ophim' || source.name === 'phimapi' || source.name === 'supabase-episode') {
        freshUpstream.push(m);
      }
      const popularity = Math.max(0, Number(m.tmdb_popularity || 0));
      const score = hotScore(m, source.name) + Math.log1p(popularity) * 18;
      const key = String(m.slug);
      const current = scored.get(key);
      if (!current || score > current.score) scored.set(key, { item: m, score });
    }
  }

  const hot = [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  // The first viewport must visibly change when real releases or playable
  // episodes arrive. Keep popularity as a second-stage signal; alternating
  // old and new items hid today's releases below stale titles.
  const recent = freshUpstream
    .sort((a, b) => movieModifiedAt(b) - movieModifiedAt(a));
  const result: Record<string, unknown>[] = [];
  const used = new Set<string>();
  const add = (movie: Record<string, unknown> | undefined) => {
    if (!movie) return;
    const key = String(movie.slug || movie._id || movie.name || '');
    if (!key || used.has(key)) return;
    used.add(key);
    result.push(movie);
  };
  let recentIndex = 0;
  let hotIndex = 0;
  const freshFirstViewport = Math.min(8, limit);
  while (result.length < freshFirstViewport && recentIndex < recent.length) add(recent[recentIndex++]);

  // Beyond the first viewport, blend two hot titles with one recent title.
  // Dedupe means a genuinely fresh and popular movie is never repeated.
  let blendTurn = 0;
  while (result.length < limit && (recentIndex < recent.length || hotIndex < hot.length)) {
    const preferRecent = blendTurn++ % 3 === 2;
    if (preferRecent && recentIndex < recent.length) add(recent[recentIndex++]);
    else if (hotIndex < hot.length) add(hot[hotIndex++]);
    else if (recentIndex < recent.length) add(recent[recentIndex++]);
  }
  while (result.length < limit && hotIndex < hot.length) add(hot[hotIndex++]);
  while (result.length < limit && recentIndex < recent.length) add(recent[recentIndex++]);
  return enrichTrendingHeroArtwork(supabase, result.slice(0, limit));
}

function isAdultTop10Candidate(item: Record<string, unknown>): boolean {
  const categoryText = ((item.category as unknown[]) ?? [])
    .map((value) => {
      if (value && typeof value === 'object') {
        const row = value as Record<string, unknown>;
        return `${row.slug || ''} ${row.name || ''}`;
      }
      return String(value || '');
    })
    .join(' ');
  const haystack = normalizeTitle([
    item.name,
    item.origin_name,
    item.slug,
    categoryText,
  ].filter(Boolean).join(' '));
  return /\b(phim 18|18 plus|adult|sex|erotic|tinh duc|loan luan)\b/.test(haystack);
}

function top10CountryKey(item: Record<string, unknown>): string {
  const countries = Array.isArray(item.country) ? item.country : [];
  const first = countries[0];
  if (first && typeof first === 'object') {
    const row = first as Record<string, unknown>;
    return normalizeTitle(row.slug || row.name || 'unknown') || 'unknown';
  }
  return normalizeTitle(first || 'unknown') || 'unknown';
}

function top10FranchiseKey(item: Record<string, unknown>): string {
  return normalizeTitle(item.origin_name || item.name || item.slug || '')
    .replace(/\b(phan|season|movie|chapter|part)\s*\d+\b/g, '')
    .replace(/\b\d{4}\b/g, '')
    .trim()
    .slice(0, 48);
}

async function fetchPlayableCandidateIds(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
): Promise<Set<string>> {
  const playable = new Set<string>();
  const addRows = (rows: Record<string, unknown>[] | null | undefined, streamTable = false) => {
    for (const row of rows ?? []) {
      const hasLink = streamTable
        ? Boolean(String(row.stream_url || row.embed_url || '').trim())
        : Boolean(String(row.link_m3u8 || row.link_embed || '').trim());
      if (hasLink) playable.add(String(row.movie_id || ''));
    }
  };

  for (let index = 0; index < ids.length; index += 80) {
    const chunk = ids.slice(index, index + 80);
    const [movieEpisodes, episodes, streams] = await Promise.all([
      supabase
        .from('movie_episodes')
        .select('movie_id,link_m3u8,link_embed,source')
        .in('movie_id', chunk)
        .abortSignal(timeoutSignal(1000)),
      supabase
        .from('episodes')
        .select('movie_id,link_m3u8,link_embed')
        .in('movie_id', chunk)
        .abortSignal(timeoutSignal(1000)),
      supabase
        .from('streams')
        .select('movie_id,stream_url,embed_url,is_active')
        .in('movie_id', chunk)
        .eq('is_active', true)
        .abortSignal(timeoutSignal(1000)),
    ]);
    addRows(
      ((movieEpisodes.data ?? []) as Record<string, unknown>[])
        .filter((row) => String(row.source || '').toLowerCase() !== 'hidden'),
    );
    addRows((episodes.data ?? []) as Record<string, unknown>[]);
    addRows((streams.data ?? []) as Record<string, unknown>[], true);
  }
  return playable;
}

async function buildTop10Singles(
  supabase: ReturnType<typeof createClient>,
  limit = 10,
  movieTypes: string[] = ['single', 'phim-le'],
): Promise<Record<string, unknown>[]> {
  const currentYear = new Date().getFullYear();
  const select = `${HOME_SUPABASE_SELECT},view,tmdb_popularity,quality,lang,status`;
  try {
    const baseQuery = () => supabase
      .from('movies')
      .select(select)
      .eq('is_published', true)
      .in('type', movieTypes)
      .not('poster_url', 'is', null);

    const [popularResult, viewedResult, recentResult] = await Promise.all([
      baseQuery()
        .order('tmdb_popularity', { ascending: false, nullsFirst: false })
        .limit(60)
        .abortSignal(timeoutSignal(1600)),
      baseQuery()
        .gt('view', 0)
        .order('view', { ascending: false, nullsFirst: false })
        .limit(60)
        .abortSignal(timeoutSignal(1600)),
      baseQuery()
        .gte('year', currentYear - 1)
        .order('year', { ascending: false, nullsFirst: false })
        .order('tmdb_popularity', { ascending: false, nullsFirst: false })
        .limit(60)
        .abortSignal(timeoutSignal(1600)),
    ]);

    const candidatesById = new Map<string, Record<string, unknown>>();
    for (const row of [
      ...(popularResult.data ?? []),
      ...(viewedResult.data ?? []),
      ...(recentResult.data ?? []),
    ] as Record<string, unknown>[]) {
      const id = String(row.id || '');
      if (!id || isAdultTop10Candidate(row)) continue;
      candidatesById.set(id, row);
    }
    const ids = Array.from(candidatesById.keys());
    if (ids.length === 0) return [];

    const [{ data: qualityRows }, directlyPlayableIds] = await Promise.all([
      supabase
        .from('movie_seo_quality_status')
        .select('movie_id,quality_score,has_playable_episode,eligible_for_index,index_tier')
        .in('movie_id', ids)
        .eq('has_playable_episode', true)
        .eq('eligible_for_index', true)
        .abortSignal(timeoutSignal(1400)),
      // Candidate insertion order is popularity, views, then recency, so this
      // bounded probe covers the most valuable rows without multiplying reads.
      fetchPlayableCandidateIds(supabase, ids.slice(0, 80)),
    ]);

    const qualityById = new Map<string, Record<string, unknown>>();
    for (const row of (qualityRows ?? []) as Record<string, unknown>[]) {
      qualityById.set(String(row.movie_id || ''), row);
    }
    const playableIds = new Set([...qualityById.keys(), ...directlyPlayableIds]);
    const enforcePlayableGate = playableIds.size >= limit;

    const scored = Array.from(candidatesById.values())
      .filter((movie) => !enforcePlayableGate || playableIds.has(String(movie.id || '')))
      .map((movie) => {
        const qualityRow = qualityById.get(String(movie.id || ''));
        const popularity = Math.max(0, Number(movie.tmdb_popularity || 0));
        const legacyViews = Math.min(10000, Math.max(0, Number(movie.view || 0)));
        const year = Number(movie.year || 0);
        const recency =
          year >= currentYear ? 24 :
          year === currentYear - 1 ? 20 :
          year >= currentYear - 3 ? 15 :
          year >= currentYear - 8 ? 9 : 4;
        const metadataQuality = Math.max(0, Math.min(100, Number(qualityRow?.quality_score || 0)));
        const language = normalizeTitle(movie.lang || '');
        const videoQuality = normalizeTitle(movie.quality || '');
        const score =
          Math.log1p(popularity) * 15
          + Math.log1p(legacyViews) * 7.5
          + recency
          + metadataQuality * 0.45
          + (/(vietsub|thuyet minh|long tieng)/.test(language) ? 8 : 0)
          + (/(4k|fhd|hd)/.test(videoQuality) ? 5 : 0);
        return { movie, score };
      })
      .sort((a, b) => b.score - a.score);

    const result: Record<string, unknown>[] = [];
    const selectedIds = new Set<string>();
    const countryCounts = new Map<string, number>();
    const franchiseCounts = new Map<string, number>();
    const add = (movie: Record<string, unknown>, enforceDiversity: boolean) => {
      const id = String(movie.id || '');
      if (!id || selectedIds.has(id)) return;
      const country = top10CountryKey(movie);
      const franchise = top10FranchiseKey(movie);
      if (enforceDiversity && (countryCounts.get(country) || 0) >= 4) return;
      if (enforceDiversity && franchise && (franchiseCounts.get(franchise) || 0) >= 2) return;
      selectedIds.add(id);
      countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
      if (franchise) franchiseCounts.set(franchise, (franchiseCounts.get(franchise) || 0) + 1);
      result.push(cleanMovieItem({
        ...movie,
        _id: movie.id,
        modified: { time: movie.updated_at || new Date().toISOString() },
      }, String(movie.source_site || 'supabase-top10')) as Record<string, unknown>);
    };

    for (const entry of scored) {
      if (result.length >= limit) break;
      add(entry.movie, true);
    }
    for (const entry of scored) {
      if (result.length >= limit) break;
      add(entry.movie, false);
    }
    return result.filter(Boolean).slice(0, limit);
  } catch {
    return [];
  }
}

async function buildTop10Series(
  supabase: ReturnType<typeof createClient>,
  limit = 10,
): Promise<Record<string, unknown>[]> {
  return buildTop10Singles(supabase, limit, ['series', 'phim-bo']);
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

function mergeSectionWithPriority(
  priorityItems: Record<string, unknown>[],
  sectionItems: Record<string, unknown>[],
  limit: number,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];

  for (const item of [...priorityItems, ...sectionItems]) {
    const slug = String(item.slug || '').trim();
    const id = String(item._id || '').trim();
    const key = slug || id;
    if (!key || seen.has(key)) continue;
    if (isTrailerOnly(item.episode_current as string)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged;
}

function mergeSectionWithReservedTail(
  sectionItems: Record<string, unknown>[],
  supplementalItems: Record<string, unknown>[],
  limit: number,
  supplementalSlots = 4,
): Record<string, unknown>[] {
  if (supplementalItems.length === 0) return sectionItems.slice(0, limit);
  const primarySlots = Math.max(HOME_MIN_SECTION_ITEMS, limit - supplementalSlots);
  return mergeSectionWithPriority(
    [
      ...sectionItems.slice(0, primarySlots),
      ...supplementalItems,
      ...sectionItems.slice(primarySlots),
    ],
    [],
    limit,
  );
}

function mergeTrendingWithSourceDiversity(
  trendingItems: Record<string, unknown>[],
  supplementalItems: Record<string, unknown>[],
  limit: number,
): Record<string, unknown>[] {
  if (supplementalItems.length === 0) return trendingItems.slice(0, limit);

  const seen = new Set<string>();
  const result: Record<string, unknown>[] = [];
  const add = (item: Record<string, unknown> | undefined) => {
    if (!item || isTrailerOnly(item.episode_current as string)) return;
    const key = String(item.slug || item._id || item.name || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  };

  // Protect the hero and the first mobile shelf for real latest-feed results.
  let primaryIndex = 0;
  let supplementalIndex = 0;
  while (result.length < Math.min(8, limit) && primaryIndex < trendingItems.length) {
    add(trendingItems[primaryIndex++]);
  }

  // Supplemental playable sources improve resilience, but may occupy at most
  // one of every four remaining positions instead of taking over the shelf.
  let turn = 0;
  while (
    result.length < limit
    && (primaryIndex < trendingItems.length || supplementalIndex < supplementalItems.length)
  ) {
    const useSupplemental = turn++ % 4 === 3;
    if (useSupplemental && supplementalIndex < supplementalItems.length) add(supplementalItems[supplementalIndex++]);
    else if (primaryIndex < trendingItems.length) add(trendingItems[primaryIndex++]);
    else if (supplementalIndex < supplementalItems.length) add(supplementalItems[supplementalIndex++]);
  }
  return result.slice(0, limit);
}

function movieLooksAnimated(item: Record<string, unknown>): boolean {
  const haystack = [
    item.type,
    item.name,
    item.origin_name,
    ...((item.category as unknown[]) ?? []),
  ]
    .map((value) => {
      if (value && typeof value === 'object') {
        const row = value as Record<string, unknown>;
        return `${row.slug || ''} ${row.name || ''}`;
      }
      return String(value || '');
    })
    .join(' ')
    .toLowerCase();

  return /hoat[-\s]?hinh|animation|anime|cartoon|phim-hoat-hinh/.test(haystack);
}

async function fetchPlayableCobephimMovies(
  supabase: ReturnType<typeof createClient>,
  limit = 12,
): Promise<Record<string, unknown>[]> {
  try {
    const normalizeRows = (movies: Record<string, unknown>[]): Record<string, unknown>[] => (
      movies
        .map((row) => cleanMovieItem({
          ...row,
          _id: row.id,
          modified: { time: row.updated_at || new Date().toISOString() },
          source_site: row.source_site || 'cobephim',
          source_name: row.source_name || 'CobePhim StreamVSMov',
        }, 'cobephim'))
        .filter(Boolean)
        .filter((movie) => !isTrailerOnly((movie as Record<string, unknown>).episode_current as string))
    ) as Record<string, unknown>[];

    const { data: taggedMovies, error: taggedError } = await supabase
      .from('movies')
      .select(HOME_SUPABASE_SELECT)
      .eq('is_published', true)
      .or('source_site.eq.cobephim,source_name.ilike.*CobePhim*,source_url.ilike.*cobephim*,showtimes.ilike.*cobephim*,source_url.ilike.*streamvsmov*,showtimes.ilike.*streamvsmov*')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(limit * 2)
      .abortSignal(timeoutSignal(1500));

    if (taggedError || !taggedMovies?.length) return [];

    return mergeSectionWithPriority(normalizeRows(taggedMovies as Record<string, unknown>[]), [], limit);
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
  const externalEndpoint = isCountry
    ? `/danh-sach/phim-moi-cap-nhat?country=${encodeURIComponent(typeOrCategory)}&page=1`
    : endpoint;

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
  const extData = await fetchExternal(externalEndpoint, 3000);
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
      'Cache-Control': homeCacheControl(60),
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
      'Cache-Control': homeCacheControl(60),
      'X-Cache': 'STALE',
    });
  }

  /* 3. Build requested sections in parallel with 3s timeout each */
  const limit = 18;

  const sectionPromises: Record<string, Promise<Record<string, unknown>[]>> = {};

  if (requestedSections.includes('trending')) {
    sectionPromises.trending = buildTrending(supabase, limit);
  }
  if (requestedSections.includes('top10-single')) {
    sectionPromises['top10-single'] = buildTop10Singles(supabase, 10);
  }
  if (requestedSections.includes('top10-series')) {
    sectionPromises['top10-series'] = buildTop10Series(supabase, 10);
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

  const playableCobephimMovies = await fetchPlayableCobephimMovies(supabase, 12);
  if (playableCobephimMovies.length > 0) {
    if (requestedSections.includes('trending')) {
      freshSections.trending = mergeTrendingWithSourceDiversity(
        freshSections.trending ?? [],
        playableCobephimMovies,
        limit,
      );
    }

    if (requestedSections.includes('phim-le')) {
      freshSections['phim-le'] = mergeSectionWithReservedTail(
        freshSections['phim-le'] ?? [],
        playableCobephimMovies.filter((movie) => ['single', 'phim-le'].includes(String(movie.type || '').toLowerCase())),
        limit,
      );
    }

    if (requestedSections.includes('phim-bo')) {
      freshSections['phim-bo'] = mergeSectionWithReservedTail(
        freshSections['phim-bo'] ?? [],
        playableCobephimMovies.filter((movie) => ['series', 'phim-bo'].includes(String(movie.type || '').toLowerCase())),
        limit,
      );
    }

    if (requestedSections.includes('hoat-hinh')) {
      freshSections['hoat-hinh'] = mergeSectionWithReservedTail(
        freshSections['hoat-hinh'] ?? [],
        playableCobephimMovies.filter(movieLooksAnimated),
        limit,
      );
    }
  }

  const safeFreshSections = await enrichWithPlayableEpisodeCounts(supabase, freshSections);

  /* 5. Stale-while-revalidate: if OPhim returned nothing but cache exists, return stale */
  const hasAnyFresh = Object.values(safeFreshSections).some((arr) => arr.length > 0);

  if (!hasAnyFresh && cacheRow && cacheCompleteForRequest) {
    const payload = buildPayloadFromSections(cachedSections, requestedSections);
    return jsonResponse({ status: true, source: 'stale', sections: payload }, 200, {
      'Cache-Control': homeCacheControl(30),
      'X-Cache': 'STALE',
    });
  }

  if (!hasAnyFresh && !forceRefresh) {
    const staticFallback = await readStaticHomeFallback(requestedSections);
    if (staticFallback) {
      return jsonResponse({ status: true, source: 'static-fallback', sections: staticFallback }, 200, {
        'Cache-Control': homeCacheControl(45),
        'X-Cache': 'STATIC-FALLBACK',
      });
    }
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
        .upsert({ id: CACHE_KEY, ...payload }, { onConflict: 'id' })
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
    'Cache-Control': homeCacheControl(60),
    'X-Cache': 'MISS',
  });
});
