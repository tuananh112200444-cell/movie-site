import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') ?? '';
const TMDB_READ_ACCESS_TOKEN = Deno.env.get('TMDB_READ_ACCESS_TOKEN') ?? '';
const CRON_SECRET = Deno.env.get('TMDB_CATALOG_SECRET') ?? Deno.env.get('CRON_SECRET') ?? Deno.env.get('SYNC_SECRET') ?? '';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type MediaType = 'movie' | 'tv';

interface TmdbListItem {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  media_type?: string;
}

interface TmdbDetail extends TmdbListItem {
  status?: string;
  runtime?: number;
  number_of_episodes?: number;
  genres?: Array<{ id: number; name: string }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  credits?: {
    cast?: Array<{ name: string }>;
    crew?: Array<{ job: string; name: string }>;
  };
  videos?: {
    results?: Array<{ site: string; type: string; key: string }>;
  };
  imdb_id?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}

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

function compactTitle(value: unknown): string {
  return normalizeTitle(value).replace(/\s+/g, '');
}

function titleKeysFromMovie(movie: Record<string, unknown>): Set<string> {
  return new Set(
    [
      movie.name,
      movie.origin_name,
      movie.title_vi,
      movie.title_en,
      movie.title_original,
      String(movie.slug || '').replace(/-/g, ' '),
    ]
      .map(compactTitle)
      .filter((value) => value.length >= 8),
  );
}

function safeIlikeTerm(value: unknown): string {
  const term = String(value || '').trim();
  if (term.length < 3 || /[,()]/.test(term)) return '';
  return term.replace(/[%*_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function episodeNumber(value: unknown): number {
  const matches = Array.from(String(value || '').matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : 0;
}

function hasPlayableMarker(movie: Record<string, unknown>): boolean {
  const current = Math.max(episodeNumber(movie.current_episode), episodeNumber(movie.episode_current));
  if (current > 0) return true;
  const episode = normalizeTitle(movie.episode_current);
  return Boolean(episode && !['trailer', 'sap chieu', 'dang cap nhat', 'coming soon', 'updating'].includes(episode));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function youtubeTrailerUrl(detail: TmdbDetail): string {
  const videos = detail.videos?.results ?? [];
  const trailer = videos.find((item) => item.site === 'YouTube' && item.type === 'Trailer') ??
    videos.find((item) => item.site === 'YouTube');
  return trailer?.key ? `https://www.youtube.com/watch?v=${trailer.key}` : '';
}

function toImage(path?: string | null, size = 'w500'): string {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
}

function toType(mediaType: MediaType): string {
  return mediaType === 'tv' ? 'phim-bo' : 'phim-le';
}

function toCatalogStatus(detail: TmdbDetail, mediaType: MediaType): string {
  const status = String(detail.status || '').toLowerCase();
  const releaseDate = String(detail.release_date || detail.first_air_date || '');
  if (releaseDate && new Date(releaseDate).getTime() > Date.now()) return 'upcoming';
  if (status.includes('planned') || status.includes('production') || status.includes('post')) return 'upcoming';
  if (mediaType === 'tv' && (status.includes('returning') || status.includes('in production'))) return 'catalog';
  return 'catalog';
}

function toEpisodeCurrent(status: string): string {
  return status === 'upcoming' ? 'Sap chieu' : 'Dang cap nhat';
}

function buildMoviePayload(detail: TmdbDetail, mediaType: MediaType, windowStart: string, windowEnd: string) {
  const title = String(detail.title || detail.name || detail.original_title || detail.original_name || '').trim();
  const originalTitle = String(detail.original_title || detail.original_name || title).trim();
  const releaseDate = String(detail.release_date || detail.first_air_date || '');
  const year = Number(releaseDate.slice(0, 4)) || new Date().getFullYear();
  const baseSlug = slugify(`${title || originalTitle}-${year}`);
  const slug = baseSlug || `tmdb-${mediaType}-${detail.id}`;
  const catalogStatus = toCatalogStatus(detail, mediaType);
  const actors = (detail.credits?.cast ?? []).slice(0, 16).map((item) => item.name).filter(Boolean);
  const directors = (detail.credits?.crew ?? [])
    .filter((item) => item.job === 'Director' || (mediaType === 'tv' && item.job === 'Creator'))
    .map((item) => item.name)
    .filter(Boolean)
    .slice(0, 8);
  const genres = (detail.genres ?? []).map((genre) => ({ id: String(genre.id), name: genre.name, slug: slugify(genre.name) }));
  const countries = (detail.production_countries ?? []).slice(0, 4).map((country) => ({
    id: country.iso_3166_1 || slugify(country.name),
    name: country.name,
    slug: slugify(country.name),
  }));

  return {
    slug,
    name: title || originalTitle || `TMDB ${detail.id}`,
    origin_name: originalTitle || title,
    title_vi: title || originalTitle,
    title_en: originalTitle || title,
    title_original: originalTitle || title,
    normalized_name: normalizeTitle(`${title} ${originalTitle}`),
    content: String(detail.overview || ''),
    type: toType(mediaType),
    status: catalogStatus === 'upcoming' ? 'trailer' : 'ongoing',
    thumb_url: toImage(detail.backdrop_path, 'w780') || toImage(detail.poster_path, 'w500'),
    poster_url: toImage(detail.poster_path, 'w500') || toImage(detail.backdrop_path, 'w780'),
    trailer_url: youtubeTrailerUrl(detail),
    time: detail.runtime ? `${detail.runtime} phut` : '',
    episode_current: toEpisodeCurrent(catalogStatus),
    episode_total: mediaType === 'tv' && detail.number_of_episodes ? String(detail.number_of_episodes) : '',
    current_episode: 0,
    total_episodes: mediaType === 'tv' ? Number(detail.number_of_episodes || 0) : 0,
    quality: 'HD',
    lang: 'Vietsub',
    year,
    actor: actors,
    director: directors,
    category: genres,
    country: countries,
    release_at: releaseDate || null,
    schedule_note: catalogStatus === 'upcoming'
      ? 'Phim sap chieu, KhoPhim se cap nhat khi co nguon xem.'
      : 'Phim dang duoc cap nhat.',
    tmdb_id: detail.id,
    imdb_id: String(detail.imdb_id || ''),
    tmdb_media_type: mediaType,
    tmdb_popularity: Number(detail.popularity || 0),
    tmdb_vote_count: Number(detail.vote_count || 0),
    tmdb_vote_average: Number(detail.vote_average || 0),
    seo_catalog_status: catalogStatus,
    catalog_source: 'tmdb-hot-6m',
    catalog_synced_at: new Date().toISOString(),
    catalog_window_start: windowStart,
    catalog_window_end: windowEnd,
    source_site: 'tmdb-catalog',
    source_name: 'TMDB Catalog',
    is_published: true,
    updated_at: new Date().toISOString(),
  };
}

async function tmdbFetch<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T | null> {
  if (!TMDB_API_KEY && !TMDB_READ_ACCESS_TOKEN) throw new Error('TMDB credentials not available');
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  if (TMDB_API_KEY) url.searchParams.set('api_key', TMDB_API_KEY);
  const res = await fetch(url.toString(), {
    headers: TMDB_READ_ACCESS_TOKEN ? { Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}` } : undefined,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMDB ${res.status}: ${text.slice(0, 180)}`);
  }
  return await res.json() as T;
}

async function fetchDetail(item: TmdbListItem, mediaType: MediaType): Promise<TmdbDetail | null> {
  const append = mediaType === 'movie' ? 'credits,videos,release_dates' : 'credits,videos,content_ratings';
  return await tmdbFetch<TmdbDetail>(`/${mediaType}/${item.id}`, {
    language: 'en-US',
    append_to_response: append,
  });
}

async function collectCandidates(pages: number, windowStart: string, windowEnd: string): Promise<Array<{ item: TmdbListItem; mediaType: MediaType }>> {
  const candidates: Array<{ item: TmdbListItem; mediaType: MediaType }> = [];
  const push = (items: TmdbListItem[] = [], mediaType: MediaType) => {
    for (const item of items) {
      if (!item.id) continue;
      candidates.push({ item, mediaType });
    }
  };

  for (let page = 1; page <= pages; page++) {
    const [movieDiscover, tvDiscover, movieUpcoming, trending] = await Promise.all([
      tmdbFetch<{ results?: TmdbListItem[] }>('/discover/movie', {
        language: 'en-US',
        include_adult: false,
        include_video: false,
        sort_by: 'popularity.desc',
        'primary_release_date.gte': windowStart,
        'primary_release_date.lte': windowEnd,
        page,
      }),
      tmdbFetch<{ results?: TmdbListItem[] }>('/discover/tv', {
        language: 'en-US',
        include_adult: false,
        sort_by: 'popularity.desc',
        'first_air_date.gte': windowStart,
        'first_air_date.lte': windowEnd,
        page,
      }),
      tmdbFetch<{ results?: TmdbListItem[] }>('/movie/upcoming', {
        language: 'en-US',
        region: 'US',
        page,
      }),
      page <= 2
        ? tmdbFetch<{ results?: TmdbListItem[] }>('/trending/all/week', { language: 'en-US', page })
        : Promise.resolve(null),
    ]);
    push(movieDiscover?.results, 'movie');
    push(tvDiscover?.results, 'tv');
    push(movieUpcoming?.results, 'movie');
    for (const item of trending?.results ?? []) {
      if (item.media_type === 'movie' || item.media_type === 'tv') {
        push([item], item.media_type);
      }
    }
  }

  const seen = new Set<string>();
  return candidates
    .filter(({ item, mediaType }) => {
      const key = `${mediaType}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const title = item.title || item.name || item.original_title || item.original_name;
      return Boolean(title && (item.poster_path || item.backdrop_path));
    })
    .sort((a, b) => Number(b.item.popularity || 0) - Number(a.item.popularity || 0));
}

async function upsertCatalogMovie(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
): Promise<'inserted' | 'updated' | 'skipped'> {
  const tmdbId = Number(payload.tmdb_id || 0);
  const mediaType = String(payload.tmdb_media_type || '');
  const payloadYear = Number(payload.year || 0);
  const payloadKeys = titleKeysFromMovie(payload);
  let playableDuplicate: Record<string, unknown> | null = null;

  if (payloadKeys.size > 0 && payloadYear > 0) {
    const terms = [
      payload.name,
      payload.origin_name,
      payload.title_vi,
      payload.title_en,
      payload.title_original,
    ]
      .map(safeIlikeTerm)
      .filter(Boolean)
      .slice(0, 4);

    let query = supabase
      .from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_original,episode_current,current_episode,source_site,is_published,year')
      .eq('is_published', true)
      .eq('year', payloadYear)
      .neq('source_site', 'tmdb-catalog')
      .limit(80);

    if (terms.length > 0) {
      const filters = terms.flatMap((term) => [
        `name.ilike.%${term}%`,
        `origin_name.ilike.%${term}%`,
        `title_vi.ilike.%${term}%`,
        `title_en.ilike.%${term}%`,
        `title_original.ilike.%${term}%`,
      ]);
      query = query.or(filters.join(','));
    }

    const { data, error } = await query;
    if (error) throw error;
    playableDuplicate = ((data ?? []) as unknown as Record<string, unknown>[]).find((movie) => {
      if (!hasPlayableMarker(movie)) return false;
      const movieKeys = titleKeysFromMovie(movie);
      for (const key of payloadKeys) {
        if (movieKeys.has(key)) return true;
      }
      return false;
    }) ?? null;
  }

  const existing = await supabase
    .from('movies')
    .select('id,slug,episode_current,source_site,is_published')
    .eq('tmdb_id', tmdbId)
    .eq('tmdb_media_type', mediaType)
    .limit(1)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data?.id) {
    const episode = String(existing.data.episode_current || '').toLowerCase().trim();
    const existingSource = String(existing.data.source_site || '').toLowerCase().trim();
    if (existingSource === 'tmdb-catalog' && playableDuplicate?.id) {
      const { error } = await supabase.from('movies').update({
        is_published: false,
        seo_catalog_status: 'superseded',
        schedule_note: `Da co ban phim co nguon xem: ${String(playableDuplicate.slug || '')}`,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.data.id);
      if (error) throw error;
      return 'skipped';
    }
    const hasPlayableMarker = existingSource !== 'tmdb-catalog' && episode && !['trailer', 'sap chieu', 'dang cap nhat'].includes(episode);
    const { slug: _slug, episode_current: _episodeCurrent, source_site: _sourceSite, ...updatePayload } = payload;
    if (hasPlayableMarker) {
      delete updatePayload.status;
      delete updatePayload.episode_total;
      delete updatePayload.current_episode;
      delete updatePayload.total_episodes;
      delete updatePayload.quality;
      delete updatePayload.lang;
      updatePayload.seo_catalog_status = 'published';
    }
    const { error } = await supabase.from('movies').update(updatePayload).eq('id', existing.data.id);
    if (error) throw error;
    return 'updated';
  }

  if (playableDuplicate?.id) return 'skipped';

  const { error } = await supabase.from('movies').insert(payload);
  if (error) {
    if (String(error.message || '').toLowerCase().includes('duplicate')) return 'skipped';
    throw error;
  }
  return 'inserted';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const providedSecret = url.searchParams.get('secret') || req.headers.get('x-sync-secret') || '';
  if (!CRON_SECRET) return jsonResponse({ error: 'Sync authentication is not configured' }, 503);
  if (providedSecret !== CRON_SECRET) return jsonResponse({ error: 'Unauthorized' }, 401);

  const startedAt = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const pages = Math.max(1, Math.min(Number(body.pages ?? url.searchParams.get('pages') ?? 3), 8));
  const limit = Math.max(20, Math.min(Number(body.limit ?? url.searchParams.get('limit') ?? 180), 500));
  const windowMonths = Math.max(1, Math.min(Number(body.months ?? url.searchParams.get('months') ?? 6), 12));
  const now = new Date();
  const windowStart = isoDate(addMonths(now, -windowMonths));
  const windowEnd = isoDate(addMonths(now, 6));
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ id?: number; mediaType?: string; message: string }> = [];

  try {
    const candidates = (await collectCandidates(pages, windowStart, windowEnd)).slice(0, limit);
    for (const candidate of candidates) {
      scanned++;
      try {
        const detail = await fetchDetail(candidate.item, candidate.mediaType);
        if (!detail) {
          skipped++;
          continue;
        }
        const payload = buildMoviePayload(detail, candidate.mediaType, windowStart, windowEnd);
        const result = await upsertCatalogMovie(supabase, payload);
        if (result === 'inserted') inserted++;
        else if (result === 'updated') updated++;
        else skipped++;
      } catch (err) {
        errors.push({
          id: candidate.item.id,
          mediaType: candidate.mediaType,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await supabase.from('home_page_cache').delete().in('id', ['search_index_v1']);
    await supabase.from('sync_logs').insert({
      function_name: 'sync-tmdb-catalog',
      scanned,
      added: inserted,
      skipped,
      errors: errors.length,
      details: errors.slice(0, 20),
      elapsed_ms: Date.now() - startedAt,
      success: errors.length === 0,
      metadata: { pages, limit, windowMonths, windowStart, windowEnd, updated },
    });

    return jsonResponse({
      success: true,
      scanned,
      inserted,
      updated,
      skipped,
      errors: errors.length,
      windowStart,
      windowEnd,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('sync_logs').insert({
      function_name: 'sync-tmdb-catalog',
      scanned,
      added: inserted,
      skipped,
      errors: errors.length + 1,
      details: [{ message }, ...errors].slice(0, 20),
      elapsed_ms: Date.now() - startedAt,
      success: false,
      metadata: { pages, limit, windowMonths, windowStart, windowEnd, updated },
    }).catch(() => undefined);
    return jsonResponse({ success: false, error: message, scanned, inserted, updated, skipped }, 500);
  }
});

