import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') ?? '';
const TMDB_READ_ACCESS_TOKEN = Deno.env.get('TMDB_READ_ACCESS_TOKEN') ?? '';
const CRON_SECRETS = [
  Deno.env.get('TMDB_CATALOG_SECRET') ?? '',
  Deno.env.get('CRON_SECRET') ?? '',
  Deno.env.get('SYNC_SECRET') ?? '',
].filter(Boolean);
const TMDB_BASE = 'https://api.themoviedb.org/3';
const MAX_BATCH_SIZE = 15;
const TMDB_CONCURRENCY = 3;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type MediaType = 'movie' | 'tv';
type MovieRow = Record<string, unknown>;
type EnrichmentStatus = 'enriched' | 'verified_no_change' | 'skipped_identity' | 'retryable_error';

interface TmdbDetail {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  popularity?: number;
  vote_count?: number;
  vote_average?: number;
  genres?: Array<{ id: number; name: string }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  credits?: {
    cast?: Array<{ name: string }>;
    crew?: Array<{ job: string; name: string }>;
  };
  videos?: {
    results?: Array<{ site: string; type: string; key: string }>;
  };
}

interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
}

interface TmdbSeasonDetail {
  season_number?: number;
  name?: string;
  overview?: string;
  air_date?: string;
  poster_path?: string | null;
}

interface SeasonIdentity {
  number: number;
  baseTitles: string[];
}

interface VerifiedDetail {
  detail: TmdbDetail;
  englishDetail: TmdbDetail | null;
  mediaType: MediaType;
  tmdbId: number;
  season: TmdbSeasonDetail | null;
  resolvedMissingId: boolean;
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function normalize(value: unknown): string {
  return String(value || '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function visibleText(value: unknown): string {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function textLength(value: unknown): number {
  return visibleText(value).length;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function taxonomyList(value: unknown): Array<{ id?: string; name: string; slug: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({ id: String(item.id || ''), name: String(item.name || '').trim(), slug: String(item.slug || '').trim() }))
    .filter((item) => item.name && item.slug);
}

function rawTitles(movie: MovieRow): string[] {
  return [movie.origin_name, movie.title_original, movie.title_en, movie.name, movie.title_vi, movie.title_zh]
    .map((value) => String(value || '').trim())
    .filter((value, index, values) => value.length >= 3 && values.indexOf(value) === index);
}

const SEASON_SUFFIX = /(?:\s*[-–—:]?\s*)?(?:\(|\[)?(?:season|phần|mùa)\s*(\d{1,2})(?:\)|\])?\s*$/iu;

function seasonIdentity(movie: MovieRow): SeasonIdentity | null {
  const matches = rawTitles(movie)
    .map((title) => ({ title, match: title.match(SEASON_SUFFIX) }))
    .filter((item): item is { title: string; match: RegExpMatchArray } => Boolean(item.match));
  const numbers = [...new Set(matches.map((item) => Number(item.match[1])).filter((value) => value > 0 && value <= 99))];
  if (numbers.length !== 1) return null;
  const baseTitles = rawTitles(movie)
    .map((title) => title.replace(SEASON_SUFFIX, '').trim())
    .filter((title, index, values) => title.length >= 3 && values.indexOf(title) === index);
  return baseTitles.length ? { number: numbers[0], baseTitles } : null;
}

function titleKeys(movie: MovieRow): Set<string> {
  return new Set([
    movie.name, movie.origin_name, movie.title_vi, movie.title_en, movie.title_zh, movie.title_original,
  ].map(normalize).filter((value) => value.length >= 3));
}

function identityTitleKeys(movie: MovieRow, season: SeasonIdentity | null): Set<string> {
  return new Set((season?.baseTitles || rawTitles(movie)).map(normalize).filter((value) => value.length >= 3));
}

function detailTitleKeys(detail: TmdbDetail): Set<string> {
  return new Set([
    detail.title, detail.name, detail.original_title, detail.original_name,
  ].map(normalize).filter((value) => value.length >= 3));
}

function releaseYear(detail: TmdbDetail): number {
  return Number(String(detail.release_date || detail.first_air_date || '').slice(0, 4)) || 0;
}

function expectedType(movie: MovieRow): MediaType | null {
  const explicit = String(movie.tmdb_media_type || '').toLowerCase();
  if (explicit === 'movie' || explicit === 'tv') return explicit;
  const sourceType = String(movie.type || '').toLowerCase();
  if (/(series|phim-bo|tv)/.test(sourceType)) return 'tv';
  if (/(single|phim-le|movie)/.test(sourceType)) return 'movie';
  return null;
}

function identityMatches(movie: MovieRow, detail: TmdbDetail, mediaType: MediaType): boolean {
  const movieType = expectedType(movie);
  if (movieType && movieType !== mediaType) return false;
  const season = seasonIdentity(movie);
  const movieKeys = identityTitleKeys(movie, season);
  const detailKeys = detailTitleKeys(detail);
  const sameTitle = [...movieKeys].some((key) => detailKeys.has(key));
  if (!sameTitle) return false;
  if (season) return mediaType === 'tv';
  const movieYear = Number(movie.year || 0);
  const tmdbYear = releaseYear(detail);
  return Boolean(movieYear && tmdbYear && movieYear === tmdbYear);
}

function hasMetadataGap(movie: MovieRow): boolean {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  const titleVi = String(movie.title_vi || movie.name || '').trim();
  const titleEn = String(movie.title_en || '').trim();
  const missingQueerEnglishTitle = /blvietsub|glvietsub/.test(source)
    && (!titleEn || normalize(titleEn) === normalize(titleVi));
  return !Number(movie.tmdb_id || 0)
    || textLength(movie.content) < 80
    || stringList(movie.actor).length === 0
    || stringList(movie.director).length === 0
    || taxonomyList(movie.category).length === 0
    || taxonomyList(movie.country).length === 0
    || !String(movie.poster_url || movie.thumb_url || '').trim()
    || missingQueerEnglishTitle;
}

function tmdbImage(path: string | null | undefined, size = 'w500'): string {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
}

function slugify(value: string): string {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110);
}

function youtubeTrailer(detail: TmdbDetail): string {
  const videos = detail.videos?.results || [];
  const trailer = videos.find((item) => item.site === 'YouTube' && item.type === 'Trailer')
    || videos.find((item) => item.site === 'YouTube');
  return trailer?.key ? `https://www.youtube.com/watch?v=${trailer.key}` : '';
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const url = new URL(`${TMDB_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  if (TMDB_API_KEY) url.searchParams.set('api_key', TMDB_API_KEY);
  const response = await fetch(url, {
    headers: TMDB_READ_ACCESS_TOKEN ? { Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}` } : undefined,
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`TMDB ${response.status}`);
  return await response.json() as T;
}

async function fetchDetail(tmdbId: number, mediaType: MediaType, language = 'vi-VN'): Promise<TmdbDetail | null> {
  return tmdbFetch<TmdbDetail>(`/${mediaType}/${tmdbId}`, {
    language,
    include_video_language: 'vi,en,null',
    append_to_response: 'credits,videos',
  });
}

async function fetchSeason(tmdbId: number, seasonNumber: number): Promise<TmdbSeasonDetail | null> {
  const vi = await tmdbFetch<TmdbSeasonDetail>(`/tv/${tmdbId}/season/${seasonNumber}`, { language: 'vi-VN' });
  if (!vi) return null;
  if (textLength(vi.overview) >= 80) return vi;
  const en = await tmdbFetch<TmdbSeasonDetail>(`/tv/${tmdbId}/season/${seasonNumber}`, { language: 'en-US' });
  return en && textLength(en.overview) > textLength(vi.overview) ? { ...vi, overview: en.overview } : vi;
}

function searchResultTitleKeys(result: TmdbSearchResult): Set<string> {
  return new Set([result.title, result.name, result.original_title, result.original_name]
    .map(normalize).filter((value) => value.length >= 3));
}

async function searchExactIdentity(movie: MovieRow, mediaType: MediaType, season: SeasonIdentity | null): Promise<number | null> {
  const queryTitles = (season?.baseTitles || rawTitles(movie)).slice(0, 3);
  const responses = await Promise.all(queryTitles.map((query) => tmdbFetch<{ results?: TmdbSearchResult[] }>(`/search/${mediaType}`, {
    query,
    language: 'vi-VN',
    include_adult: 'false',
  })));
  const resultsById = new Map<number, TmdbSearchResult>();
  responses.forEach((response) => (response?.results || []).forEach((result) => resultsById.set(result.id, result)));
  const expectedTitles = identityTitleKeys(movie, season);
  const movieYear = Number(movie.year || 0);
  const exact = [...resultsById.values()].filter((result) => {
    if (![...searchResultTitleKeys(result)].some((key) => expectedTitles.has(key))) return false;
    if (season) return mediaType === 'tv';
    const resultYear = Number(String(result.release_date || result.first_air_date || '').slice(0, 4)) || 0;
    return Boolean(movieYear && resultYear && movieYear === resultYear);
  });
  if (!season) return exact.length === 1 ? exact[0].id : null;

  const seasonChecks = await Promise.all(exact.map(async (result) => ({
    id: result.id,
    season: await fetchSeason(result.id, season.number),
  })));
  const verified = seasonChecks.filter((item) => Number(String(item.season?.air_date || '').slice(0, 4)) === movieYear);
  return verified.length === 1 ? verified[0].id : null;
}

async function resolveVerifiedDetail(movie: MovieRow): Promise<VerifiedDetail | null> {
  const season = seasonIdentity(movie);
  const expected = expectedType(movie);
  const tmdbId = Number(movie.tmdb_id || 0);
  if (!tmdbId) {
    if (!expected) return null;
    const resolvedId = await searchExactIdentity(movie, expected, season);
    if (!resolvedId) return null;
    const detail = await fetchDetail(resolvedId, expected);
    if (!detail || !identityMatches(movie, detail, expected)) return null;
    const seasonDetail = season ? await fetchSeason(resolvedId, season.number) : null;
    if (season && Number(String(seasonDetail?.air_date || '').slice(0, 4)) !== Number(movie.year || 0)) return null;
    return {
      detail,
      englishDetail: await fetchDetail(resolvedId, expected, 'en-US'),
      mediaType: expected,
      tmdbId: resolvedId,
      season: seasonDetail,
      resolvedMissingId: true,
    };
  }
  const explicit = String(movie.tmdb_media_type || '').toLowerCase();
  const candidates: MediaType[] = explicit === 'movie' || explicit === 'tv'
    ? [explicit]
    : ['movie', 'tv'];
  const attempts = await Promise.all(candidates.map(async (mediaType) => ({
    mediaType,
    detail: await fetchDetail(tmdbId, mediaType),
  })));
  const verified = attempts.filter((item) => item.detail && identityMatches(movie, item.detail, item.mediaType)) as Array<{ detail: TmdbDetail; mediaType: MediaType }>;
  if (verified.length !== 1) return null;
  const seasonDetail = season ? await fetchSeason(tmdbId, season.number) : null;
  if (season && Number(String(seasonDetail?.air_date || '').slice(0, 4)) !== Number(movie.year || 0)) return null;
  return {
    ...verified[0],
    englishDetail: await fetchDetail(tmdbId, verified[0].mediaType, 'en-US'),
    tmdbId,
    season: seasonDetail,
    resolvedMissingId: false,
  };
}

function metadataPatch(movie: MovieRow, resolved: VerifiedDetail, replaceDuplicateSeasonContent: boolean): Record<string, unknown> {
  const { detail, englishDetail, mediaType, season } = resolved;
  const patch: Record<string, unknown> = {};
  const overview = String((season && replaceDuplicateSeasonContent ? season.overview : '') || detail.overview || '').trim();
  const actors = (detail.credits?.cast || []).map((item) => String(item.name || '').trim()).filter(Boolean).slice(0, 16);
  const directors = (detail.credits?.crew || [])
    .filter((item) => item.job === 'Director' || (mediaType === 'tv' && item.job === 'Creator'))
    .map((item) => String(item.name || '').trim()).filter(Boolean).slice(0, 8);
  const genres = (detail.genres || []).map((item) => ({ id: String(item.id), name: item.name, slug: slugify(item.name) })).filter((item) => item.name && item.slug);
  const countries = (detail.production_countries || []).map((item) => ({ id: item.iso_3166_1 || slugify(item.name), name: item.name, slug: slugify(item.name) })).filter((item) => item.name && item.slug).slice(0, 4);
  const poster = tmdbImage(season?.poster_path) || tmdbImage(detail.poster_path) || tmdbImage(detail.backdrop_path, 'w780');
  const backdrop = tmdbImage(detail.backdrop_path, 'w780') || poster;
  const vietnameseTitle = String(detail.title || detail.name || '').trim();
  const englishTitle = String(englishDetail?.title || englishDetail?.name || detail.original_title || detail.original_name || '').trim();
  const originalTitle = String(englishDetail?.original_title || englishDetail?.original_name || detail.original_title || detail.original_name || '').trim();
  const currentVietnameseTitle = String(movie.title_vi || movie.name || '').trim();
  const currentEnglishTitle = String(movie.title_en || '').trim();

  if ((textLength(movie.content) < 80 || replaceDuplicateSeasonContent) && textLength(overview) >= 80 && visibleText(movie.content) !== visibleText(overview)) patch.content = overview;
  if (stringList(movie.actor).length === 0 && actors.length) patch.actor = actors;
  if (stringList(movie.director).length === 0 && directors.length) patch.director = directors;
  if (taxonomyList(movie.category).length === 0 && genres.length) patch.category = genres;
  if (taxonomyList(movie.country).length === 0 && countries.length) patch.country = countries;
  if (!String(movie.poster_url || '').trim() && poster) patch.poster_url = poster;
  if (!String(movie.thumb_url || '').trim() && backdrop) patch.thumb_url = backdrop;
  if (!String(movie.trailer_url || '').trim() && youtubeTrailer(detail)) patch.trailer_url = youtubeTrailer(detail);
  if (!String(movie.title_vi || '').trim() && vietnameseTitle) patch.title_vi = vietnameseTitle;
  if (englishTitle && (!currentEnglishTitle || normalize(currentEnglishTitle) === normalize(currentVietnameseTitle))
    && normalize(englishTitle) !== normalize(currentVietnameseTitle)) patch.title_en = englishTitle;
  if (!String(movie.title_original || '').trim() && originalTitle) patch.title_original = originalTitle;
  if (!String(movie.origin_name || '').trim() && originalTitle) patch.origin_name = originalTitle;
  if (!Number(movie.tmdb_id || 0)) patch.tmdb_id = resolved.tmdbId;
  if (!String(movie.tmdb_media_type || '').trim()) patch.tmdb_media_type = mediaType;
  if (Number.isFinite(Number(detail.popularity))) patch.tmdb_popularity = Number(detail.popularity || 0);
  if (Number.isFinite(Number(detail.vote_count))) patch.tmdb_vote_count = Number(detail.vote_count || 0);
  if (Number.isFinite(Number(detail.vote_average))) patch.tmdb_vote_average = Number(detail.vote_average || 0);
  return patch;
}

async function recordStatus(
  supabase: ReturnType<typeof createClient>,
  movieId: string,
  status: EnrichmentStatus,
  metadata: Record<string, unknown>,
  error = '',
) {
  await supabase.from('movie_tmdb_enrichment_status').upsert({
    movie_id: movieId,
    status,
    attempted_at: new Date().toISOString(),
    enriched_at: status === 'enriched' ? new Date().toISOString() : null,
    last_error: error || null,
    metadata,
  }, { onConflict: 'movie_id' });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || (!TMDB_API_KEY && !TMDB_READ_ACCESS_TOKEN)) return reply({ error: 'Metadata enrichment is not configured' }, 503);
  const providedSecret = req.headers.get('x-cron-secret') || req.headers.get('x-sync-secret') || '';
  if (!CRON_SECRETS.length || !CRON_SECRETS.includes(providedSecret)) return reply({ error: 'Unauthorized' }, 401);

  const startedAt = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const limit = Math.max(1, Math.min(Number(body.limit || MAX_BATCH_SIZE), MAX_BATCH_SIZE));
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: rows, error: candidateError } = await supabase
    .rpc('get_tmdb_metadata_enrichment_candidates', { p_limit: limit });
  if (candidateError) return reply({ error: candidateError.message }, 500);
  const candidates = ((rows || []) as MovieRow[])
    .filter(hasMetadataGap)
    .slice(0, limit);

  let enriched = 0;
  let verifiedNoChange = 0;
  let skippedIdentity = 0;
  const errors: string[] = [];
  const changedSlugs: string[] = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < candidates.length) {
      const movie = candidates[cursor++];
      const movieId = String(movie.id);
      try {
        const resolved = await resolveVerifiedDetail(movie);
        if (!resolved) {
          skippedIdentity++;
          await recordStatus(supabase, movieId, 'skipped_identity', { tmdb_id: movie.tmdb_id, reason: 'strict_identity_not_confirmed' });
          continue;
        }
        let replaceDuplicateSeasonContent = false;
        if (resolved.season && textLength(resolved.season.overview) >= 80) {
          const { data, error } = await supabase.rpc('is_duplicate_series_season_content', { p_movie_id: movieId });
          if (error) throw new Error(error.message);
          replaceDuplicateSeasonContent = Boolean(data);
        }
        const patch = metadataPatch(movie, resolved, replaceDuplicateSeasonContent);
        if (Object.keys(patch).length === 0) {
          verifiedNoChange++;
          await recordStatus(supabase, movieId, 'verified_no_change', { tmdb_id: resolved.tmdbId, media_type: resolved.mediaType });
          continue;
        }
        const resolvedTmdbId = Number(patch.tmdb_id || resolved.tmdbId || 0) || 0;
        if (resolvedTmdbId > 0) {
          const { data: existingOwner, error: ownerError } = await supabase
            .from('movies')
            .select('id,slug')
            .eq('tmdb_id', resolvedTmdbId)
            .neq('id', movieId)
            .limit(1)
            .maybeSingle();
          if (ownerError) throw new Error(ownerError.message);
          if (existingOwner?.id) {
            skippedIdentity++;
            await recordStatus(supabase, movieId, 'skipped_identity', {
              tmdb_id: resolvedTmdbId,
              reason: 'tmdb_id_owned_by_canonical_movie',
              canonical_movie_id: existingOwner.id,
              canonical_slug: existingOwner.slug,
            });
            continue;
          }
        }
        patch.updated_at = new Date().toISOString();
        const { error } = await supabase.from('movies').update(patch).eq('id', movieId);
        if (error?.code === '23505' && /movies_tmdb_id_unique/i.test(error.message || '')) {
          skippedIdentity++;
          await recordStatus(supabase, movieId, 'skipped_identity', {
            tmdb_id: resolvedTmdbId || resolved.tmdbId,
            reason: 'tmdb_id_unique_race',
          });
          continue;
        }
        if (error) throw new Error(error.message);
        enriched++;
        changedSlugs.push(String(movie.slug));
        await recordStatus(supabase, movieId, 'enriched', {
          tmdb_id: resolved.tmdbId,
          media_type: resolved.mediaType,
          season_number: resolved.season?.season_number ?? null,
          resolved_missing_id: resolved.resolvedMissingId,
          replaced_duplicate_season_content: replaceDuplicateSeasonContent,
          fields: Object.keys(patch).filter((key) => key !== 'updated_at'),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${movieId}:${message}`);
        await recordStatus(supabase, movieId, 'retryable_error', { tmdb_id: movie.tmdb_id }, message).catch(() => undefined);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(TMDB_CONCURRENCY, candidates.length) }, () => worker()));
  if (changedSlugs.length) {
    await Promise.all([
      supabase.from('movie_api_cache').update({ expires_at: new Date().toISOString() }).in('slug', changedSlugs),
      supabase.from('home_page_cache').update({ expires_at: new Date().toISOString() }).eq('id', 'search_index_v4_rows'),
    ]);
  }
  await supabase.from('sync_logs').insert({
    function_name: 'enrich-tmdb-metadata',
    scanned: candidates.length,
    added: 0,
    skipped: skippedIdentity + verifiedNoChange,
    errors: errors.length,
    elapsed_ms: Date.now() - startedAt,
    success: errors.length === 0,
    details: errors.slice(0, 20),
    metadata: { enriched, verified_no_change: verifiedNoChange, skipped_identity: skippedIdentity, limit, concurrency: TMDB_CONCURRENCY },
  });

  return reply({ success: errors.length === 0, scanned: candidates.length, enriched, verified_no_change: verifiedNoChange, skipped_identity: skippedIdentity, errors: errors.slice(0, 20), elapsed_ms: Date.now() - startedAt });
});
