import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? 'https://khophim.org';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
function toOrigin(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}
function getCorsHeaders(origin: string | null): Record<string, string> {
  const configured = CORS_ORIGIN ? CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const allowed = ['https://khophim.org', 'http://localhost:5173', 'http://localhost:3000', ...configured];
  const allowedOrigins = allowed.map((a) => toOrigin(a)).filter((a): a is string => Boolean(a));
  const requestOrigin = toOrigin(origin);
  const safe = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': safe,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function hmacVerify(message: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(message));
}

async function verifyAdminToken(token: string): Promise<{ valid: boolean; expiresAt?: number }> {
  try {
    const decoded = atob(token);
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return { valid: false };
    const payload = decoded.slice(0, lastDot);
    const signature = decoded.slice(lastDot + 1);
    const [_, expiresAtStr] = payload.split('.');
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || Number.isNaN(expiresAt)) return { valid: false };

    const secret = SUPABASE_SERVICE_ROLE_KEY.slice(0, 32) || 'khophim-admin-fallback';
    const valid = await hmacVerify(payload, signature, secret);
    return { valid: valid && expiresAt > Math.floor(Date.now() / 1000), expiresAt };
  } catch {
    return { valid: false };
  }
}

interface FindResult {
  id: string;
  slug: string;
  name: string;
  title_vi: string | null;
  title_en: string | null;
  title_zh: string | null;
  title_original: string | null;
  status: string | null;
  type: string | null;
  episode_current: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  ophim_id: string | null;
  ophim_slug: string | null;
  normalized_name: string | null;
  origin_name: string | null;
  year: number | null;
  source_site: string | null;
  source_name: string | null;
  content?: string | null;
  thumb_url?: string | null;
  poster_url?: string | null;
  quality?: string | null;
  lang?: string | null;
  time?: string | null;
  category?: unknown;
  country?: unknown;
  release_at?: string | null;
  next_episode_at?: string | null;
  next_episode_name?: string | null;
  schedule_type?: string | null;
  release_time?: string | null;
  release_day?: number | null;
  schedule_timezone?: string | null;
  schedule_note?: string | null;
}

const MOVIE_MATCH_SELECT = 'id,slug,name,title_vi,title_en,title_zh,title_original,status,type,episode_current,tmdb_id,imdb_id,ophim_id,ophim_slug,normalized_name,origin_name,year,source_site,source_name,content,thumb_url,poster_url,quality,lang,time,category,country,release_at,next_episode_at,next_episode_name,schedule_type,release_time,release_day,schedule_timezone,schedule_note';
const MOVIE_MERGE_SELECT = 'id,slug,name,title_vi,title_en,title_zh,title_original,origin_name,normalized_name,type,status,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,release_at,next_episode_at,next_episode_name,schedule_note,tmdb_id,imdb_id,ophim_id,ophim_slug,source_site,source_name,is_published,year,thumb_url,poster_url';

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

function movieYear(value: Record<string, unknown> | FindResult): number {
  const year = Number((value as Record<string, unknown>).year || 0);
  return Number.isFinite(year) ? year : 0;
}

function sourceText(value: Record<string, unknown> | FindResult): string {
  const record = value as Record<string, unknown>;
  return `${record.source_site || ''} ${record.source_name || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isQueerSource(value: Record<string, unknown> | FindResult): boolean {
  const source = sourceText(value);
  return source.includes('admin queer') ||
    source.includes('blvietsub') ||
    source.includes('vu tru dam my') ||
    source.includes('dam my') ||
    source.includes('bach hop') ||
    source.includes('boy love') ||
    source.includes('girl love') ||
    source.includes('thai bl') ||
    /\bbl\b/.test(source) ||
    /\bgl\b/.test(source);
}

function titleCandidates(value: Record<string, unknown> | FindResult): string[] {
  const record = value as Record<string, unknown>;
  return Array.from(new Set([
    record.name,
    record.title_vi,
    record.title_en,
    record.title_zh,
    record.title_original,
    record.origin_name,
    String(record.slug || '').replace(/-/g, ' '),
    String(record.ophim_slug || '').replace(/-/g, ' '),
    record.normalized_name,
  ]
    .map(normalizeTitle)
    .filter((title) => title.length >= 3)));
}

function canonicalDuplicateTitle(value: unknown): string {
  return normalizeTitle(value)
    .replace(/\b(18|19|20)\d{2}\b/g, ' ')
    .replace(/\b(tap|ep|episode|phan|season|trailer|vietsub|thuyet minh|long tieng|full|hd|fhd|4k)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function canonicalTitleCandidates(value: Record<string, unknown> | FindResult): string[] {
  const record = value as Record<string, unknown>;
  return Array.from(new Set([
    record.name,
    record.title_vi,
    record.title_en,
    record.title_zh,
    record.title_original,
    record.origin_name,
    record.normalized_name,
  ]
    .map(canonicalDuplicateTitle)
    .filter((title) => title.length >= 6)));
}

function rawTitleTerms(value: Record<string, unknown>): string[] {
  return Array.from(new Set([
    value.name,
    value.title_vi,
    value.title_en,
    value.title_zh,
    value.title_original,
    value.origin_name,
    String(value.slug || '').replace(/-/g, ' '),
    String(value.ophim_slug || '').replace(/-/g, ' '),
  ]
    .map((term) => String(term || '').trim())
    .filter((term) => term.length >= 3)
    .slice(0, 6)));
}

function escapePostgrestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, ' ');
}

function hasSharedTitle(existing: FindResult, payload: Record<string, unknown>): boolean {
  const incomingTitles = titleCandidates(payload);
  const existingTitles = titleCandidates(existing);
  const strictMatch = incomingTitles.some((incoming) =>
    existingTitles.some((existingTitle) =>
      incoming === existingTitle ||
      (incoming.length >= 8 && existingTitle.includes(incoming)) ||
      (existingTitle.length >= 8 && incoming.includes(existingTitle))
    )
  );
  if (strictMatch) return true;

  const incomingCanonical = canonicalTitleCandidates(payload);
  const existingCanonical = canonicalTitleCandidates(existing);
  if (incomingCanonical.length === 0 || existingCanonical.length === 0) return false;

  return incomingCanonical.some((incoming) =>
    existingCanonical.some((existingTitle) =>
      incoming === existingTitle ||
      (incoming.length >= 10 && existingTitle.includes(incoming)) ||
      (existingTitle.length >= 10 && incoming.includes(existingTitle))
    )
  );
}
function isLikelySameMovie(existing: FindResult, payload: Record<string, unknown>): boolean {
  const incomingYear = movieYear(payload);
  const existingYear = movieYear(existing);
  if (incomingYear > 0 && existingYear > 0 && incomingYear !== existingYear) return false;
  if (!hasSharedTitle(existing, payload)) return false;

  const incomingType = String(payload.type || '').trim();
  const existingType = String(existing.type || '').trim();
  if (incomingType && existingType && incomingType !== existingType) {
    const movieLike = new Set(['phim-le', 'phim-chieu-rap']);
    if (!(movieLike.has(incomingType) && movieLike.has(existingType))) return false;
  }

  return true;
}

async function findExistingMovieByTitle(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
): Promise<FindResult | null> {
  const year = movieYear(payload);
  const terms = rawTitleTerms(payload);

  for (const term of terms) {
    const safeTerm = escapePostgrestIlike(term);
    let query = supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .or(`name.ilike.%${safeTerm}%,title_vi.ilike.%${safeTerm}%,title_en.ilike.%${safeTerm}%,title_zh.ilike.%${safeTerm}%,title_original.ilike.%${safeTerm}%,origin_name.ilike.%${safeTerm}%,slug.ilike.%${safeTerm}%,ophim_slug.ilike.%${safeTerm}%`);

    const { data } = await query.limit(10);
    const match = ((data ?? []) as unknown as FindResult[]).find((item) => isLikelySameMovie(item, payload));
    if (match) return match;
  }

  if (year > 0 && titleCandidates(payload).length > 0) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .eq('year', year)
      .order('updated_at', { ascending: false })
      .limit(200);
    const match = ((data ?? []) as unknown as FindResult[]).find((item) => isLikelySameMovie(item, payload));
    if (match) return match;
  }

  return null;
}
async function findExistingMovie(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
): Promise<FindResult | null> {
  // Priority 1: exact tmdb_id match
  const tmdbId = payload.tmdb_id ? Number(payload.tmdb_id) : null;
  if (tmdbId && !Number.isNaN(tmdbId)) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .eq('tmdb_id', tmdbId)
      .maybeSingle();
    if (data) return data as unknown as FindResult;
  }

  // Priority 2: exact canonical slug match
  const slug = payload.slug ? String(payload.slug).trim() : null;
  if (slug) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .eq('slug', slug)
      .maybeSingle();
    if (data) return data as unknown as FindResult;
  }

  // Priority 3: exact imdb_id match
  const imdbId = payload.imdb_id ? String(payload.imdb_id).trim() : null;
  if (imdbId) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .eq('imdb_id', imdbId)
      .maybeSingle();
    if (data) return data as unknown as FindResult;
  }

  // Priority 4: exact ophim_slug match
  const ophimSlug = payload.ophim_slug ? String(payload.ophim_slug).trim() : null;
  if (ophimSlug) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .eq('ophim_slug', ophimSlug)
      .maybeSingle();
    if (data) return data as unknown as FindResult;
  }

  // Priority 5: ophim_id match
  const ophimId = payload.ophim_id ? String(payload.ophim_id).trim() : null;
  if (ophimId) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .eq('ophim_id', ophimId)
      .maybeSingle();
    if (data) return data as unknown as FindResult;
  }

  // Priority 6: normalized_name + year
  const normalizedName = payload.normalized_name ? String(payload.normalized_name).trim() : null;
  const year = payload.year ? Number(payload.year) : null;
  if (normalizedName && year && !Number.isNaN(year)) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .eq('normalized_name', normalizedName)
      .eq('year', year)
      .limit(1)
      .maybeSingle();
    if (data) return data as unknown as FindResult;
  }

  // Priority 7: origin_name + year
  const originName = payload.origin_name ? String(payload.origin_name).trim() : null;
  if (originName && originName.length > 2 && year && !Number.isNaN(year)) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_MATCH_SELECT)
      .ilike('origin_name', originName)
      .eq('year', year)
      .limit(1)
      .maybeSingle();
    if (data) return data as unknown as FindResult;
  }
// Priority 8: title/name + compatible year. This catches admin vs OPhim
  // duplicates where slug or provider IDs are different.
  const titleMatch = await findExistingMovieByTitle(supabase, payload);
  if (titleMatch) return titleMatch;
  return null;
}

function mergeMovieData(
  existing: FindResult,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...incoming };

  // Never overwrite a playable movie with TMDB-only "updating" status
  const existingStatus = (existing.status ?? '').toString().toLowerCase();
  const incomingStatus = (incoming.status ?? '').toString().toLowerCase();
  const existingHasEpisodes = !!(existing.episode_current && existing.episode_current !== '' && existing.episode_current !== 'trailer');

  if (existingHasEpisodes && (incomingStatus === 'trailer' || incomingStatus === '')) {
    // Keep existing status if incoming has no real status
    delete merged.status;
  } else if (existingStatus === 'completed' && (incomingStatus === 'ongoing' || incomingStatus === 'trailer' || incomingStatus === '')) {
    // Never downgrade from completed
    delete merged.status;
  }

  // If existing already has episodes, keep episode_current unless incoming explicitly has more
  const incomingEpCurrent = incoming.episode_current ? String(incoming.episode_current).trim() : '';
  if (existingHasEpisodes && (!incomingEpCurrent || incomingEpCurrent === 'trailer')) {
    delete merged.episode_current;
    delete merged.episode_total;
  }

  // Preserve source tracking: if incoming has ophim_slug, always save it
  if (incoming.ophim_slug && !existing.ophim_slug) {
    merged.ophim_slug = incoming.ophim_slug;
  }

  // Preserve existing IDs if incoming doesn't have them
  if (!incoming.tmdb_id && existing.tmdb_id) merged.tmdb_id = existing.tmdb_id;
  if (!incoming.imdb_id && existing.imdb_id) merged.imdb_id = existing.imdb_id;
  if (!incoming.ophim_id && existing.ophim_id) merged.ophim_id = existing.ophim_id;
  if (!incoming.ophim_slug && existing.ophim_slug) merged.ophim_slug = existing.ophim_slug;

  const preserveIfIncomingEmpty = [
    'name',
    'title_vi',
    'title_en',
    'title_zh',
    'title_original',
    'origin_name',
    'normalized_name',
    'content',
    'thumb_url',
    'poster_url',
    'type',
    'status',
    'quality',
    'lang',
    'time',
    'category',
    'country',
    'release_at',
    'next_episode_at',
    'next_episode_name',
    'schedule_type',
    'release_time',
    'release_day',
    'schedule_timezone',
    'schedule_note',
    'year',
  ];
  for (const key of preserveIfIncomingEmpty) {
    if (!hasValue(incoming[key]) && hasValue((existing as unknown as Record<string, unknown>)[key])) {
      delete merged[key];
    }
  }

  const existingSource = sourceText(existing);
  const incomingSource = sourceText(incoming);
  const existingIsManaged = existingSource.includes('admin') || isQueerSource(existing);
  const incomingIsManaged = incomingSource.includes('admin') || isQueerSource(incoming);

  // Keep manually curated/BL catalog ownership when an API sync touches the same movie.
  if (existingIsManaged && !incomingIsManaged) {
    delete merged.source_site;
    delete merged.source_name;
    delete merged.name;
    delete merged.title_vi;
    delete merged.origin_name;
    delete merged.content;
    delete merged.thumb_url;
    delete merged.poster_url;
  }
  if (isQueerSource(existing) && !isQueerSource(incoming)) {
    delete merged.category;
  }

  // Remove fields that shouldn't be overwritten on merge
  merged.id = existing.id;
  merged.slug = existing.slug; // keep canonical slug
  merged.created_at = undefined;

  return merged;
}

type SupabaseClient = ReturnType<typeof createClient>;

interface MergeMovieRow {
  id: string;
  slug: string;
  name: string | null;
  title_vi: string | null;
  title_en: string | null;
  title_zh: string | null;
  title_original: string | null;
  origin_name: string | null;
  normalized_name: string | null;
  type: string | null;
  status: string | null;
  episode_current: string | null;
  episode_total: string | null;
  current_episode: number | null;
  total_episodes: number | null;
  schedule_type: string | null;
  release_time: string | null;
  release_day: number | null;
  schedule_timezone: string | null;
  release_at: string | null;
  next_episode_at: string | null;
  next_episode_name: string | null;
  schedule_note: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  ophim_id: string | null;
  ophim_slug: string | null;
  source_site: string | null;
  source_name: string | null;
  is_published: boolean | null;
  year: number | null;
  thumb_url: string | null;
  poster_url: string | null;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function chooseFilled<T>(current: T | null | undefined, incoming: T | null | undefined): T | null | undefined {
  return hasValue(current) ? current : incoming;
}

function mergeMovieFields(target: MergeMovieRow, sources: MergeMovieRow[]): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const source of sources) {
    update.title_vi = chooseFilled(update.title_vi ?? target.title_vi, source.title_vi);
    update.title_en = chooseFilled(update.title_en ?? target.title_en, source.title_en);
    update.title_zh = chooseFilled(update.title_zh ?? target.title_zh, source.title_zh);
    update.title_original = chooseFilled(update.title_original ?? target.title_original, source.title_original);
    update.origin_name = chooseFilled(update.origin_name ?? target.origin_name, source.origin_name);
    update.normalized_name = chooseFilled(update.normalized_name ?? target.normalized_name, source.normalized_name);
    update.thumb_url = chooseFilled(update.thumb_url ?? target.thumb_url, source.thumb_url);
    update.poster_url = chooseFilled(update.poster_url ?? target.poster_url, source.poster_url);
    update.tmdb_id = chooseFilled(update.tmdb_id ?? target.tmdb_id, source.tmdb_id);
    update.imdb_id = chooseFilled(update.imdb_id ?? target.imdb_id, source.imdb_id);
    update.ophim_id = chooseFilled(update.ophim_id ?? target.ophim_id, source.ophim_id);
    update.ophim_slug = chooseFilled(update.ophim_slug ?? target.ophim_slug, source.ophim_slug);
    update.episode_current = chooseFilled(update.episode_current ?? target.episode_current, source.episode_current);
    update.episode_total = chooseFilled(update.episode_total ?? target.episode_total, source.episode_total);
    update.current_episode = chooseFilled(update.current_episode ?? target.current_episode, source.current_episode);
    update.total_episodes = chooseFilled(update.total_episodes ?? target.total_episodes, source.total_episodes);
    update.schedule_type = chooseFilled(update.schedule_type ?? target.schedule_type, source.schedule_type);
    update.release_time = chooseFilled(update.release_time ?? target.release_time, source.release_time);
    update.release_day = chooseFilled(update.release_day ?? target.release_day, source.release_day);
    update.schedule_timezone = chooseFilled(update.schedule_timezone ?? target.schedule_timezone, source.schedule_timezone);
    update.release_at = chooseFilled(update.release_at ?? target.release_at, source.release_at);
    update.next_episode_at = chooseFilled(update.next_episode_at ?? target.next_episode_at, source.next_episode_at);
    update.next_episode_name = chooseFilled(update.next_episode_name ?? target.next_episode_name, source.next_episode_name);
    update.schedule_note = chooseFilled(update.schedule_note ?? target.schedule_note, source.schedule_note);
  }

  for (const key of Object.keys(update)) {
    if (!hasValue(update[key]) || update[key] === (target as unknown as Record<string, unknown>)[key]) {
      delete update[key];
    }
  }

  if (Object.keys(update).length > 0) update.updated_at = new Date().toISOString();
  return update;
}

async function moveMovieEpisodes(
  supabase: SupabaseClient,
  sourceId: string,
  targetId: string,
): Promise<{ moved: number; deduped: number }> {
  const { data: rows, error } = await supabase
    .from('movie_episodes')
    .select('id,movie_id,server_name,episode_number')
    .eq('movie_id', sourceId);
  if (error) throw new Error(`movie_episodes: ${error.message}`);

  let moved = 0;
  let deduped = 0;
  for (const row of (rows ?? []) as Array<{ id: number; server_name: string; episode_number: number }>) {
    const { data: existing } = await supabase
      .from('movie_episodes')
      .select('id')
      .eq('movie_id', targetId)
      .eq('server_name', row.server_name || '')
      .eq('episode_number', Number(row.episode_number || 0))
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error: deleteError } = await supabase.from('movie_episodes').delete().eq('id', row.id);
      if (deleteError) throw new Error(`movie_episodes dedupe: ${deleteError.message}`);
      deduped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('movie_episodes')
      .update({ movie_id: targetId, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updateError) throw new Error(`movie_episodes move: ${updateError.message}`);
    moved++;
  }
  return { moved, deduped };
}

async function moveEpisodes(
  supabase: SupabaseClient,
  sourceId: string,
  targetId: string,
): Promise<{ moved: number; deduped: number }> {
  const { data: rows, error } = await supabase
    .from('episodes')
    .select('id,server_name,episode_slug')
    .eq('movie_id', sourceId);
  if (error) throw new Error(`episodes: ${error.message}`);

  let moved = 0;
  let deduped = 0;
  for (const row of (rows ?? []) as Array<{ id: string; server_name: string; episode_slug: string }>) {
    const { data: existing } = await supabase
      .from('episodes')
      .select('id')
      .eq('movie_id', targetId)
      .eq('server_name', row.server_name || '')
      .eq('episode_slug', row.episode_slug || '')
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error: deleteError } = await supabase.from('episodes').delete().eq('id', row.id);
      if (deleteError) throw new Error(`episodes dedupe: ${deleteError.message}`);
      deduped++;
      continue;
    }

    const { error: updateError } = await supabase.from('episodes').update({ movie_id: targetId }).eq('id', row.id);
    if (updateError) throw new Error(`episodes move: ${updateError.message}`);
    moved++;
  }
  return { moved, deduped };
}

async function moveStreams(
  supabase: SupabaseClient,
  sourceId: string,
  targetId: string,
): Promise<{ moved: number; deduped: number }> {
  const { data: rows, error } = await supabase
    .from('streams')
    .select('id,episode_slug,source,server_name')
    .eq('movie_id', sourceId);
  if (error) throw new Error(`streams: ${error.message}`);

  let moved = 0;
  let deduped = 0;
  for (const row of (rows ?? []) as Array<{ id: string; episode_slug: string; source: string; server_name: string }>) {
    const { data: existing } = await supabase
      .from('streams')
      .select('id')
      .eq('movie_id', targetId)
      .eq('episode_slug', row.episode_slug || '')
      .eq('source', row.source || '')
      .eq('server_name', row.server_name || '')
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error: deleteError } = await supabase.from('streams').delete().eq('id', row.id);
      if (deleteError) throw new Error(`streams dedupe: ${deleteError.message}`);
      deduped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('streams')
      .update({ movie_id: targetId, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updateError) throw new Error(`streams move: ${updateError.message}`);
    moved++;
  }
  return { moved, deduped };
}

async function moveSimpleTable(
  supabase: SupabaseClient,
  table: string,
  sourceId: string,
  targetId: string,
  withUpdatedAt = true,
): Promise<number> {
  const updatePayload: Record<string, unknown> = { movie_id: targetId };
  if (withUpdatedAt) updatePayload.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from(table)
    .update(updatePayload)
    .eq('movie_id', sourceId)
    .select('id');
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []).length;
}

async function cleanupCaches(supabase: SupabaseClient, slugs: string[]): Promise<void> {
  const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean)));
  if (uniqueSlugs.length > 0) {
    await supabase.from('movie_api_cache').delete().in('slug', uniqueSlugs);
    const sourceSlugs = uniqueSlugs.slice(1);
    if (sourceSlugs.length > 0) {
      await supabase.from('movie_reviews').delete().in('slug', sourceSlugs);
    }
  }
  await supabase.from('home_page_cache').delete().neq('id', '__never__');
}

async function mergeDuplicateMovies(
  supabase: SupabaseClient,
  targetId: string,
  sourceIds: string[],
): Promise<Record<string, unknown>> {
  const uniqueSourceIds = Array.from(new Set(sourceIds.filter((id) => id && id !== targetId)));
  if (!targetId || uniqueSourceIds.length === 0) {
    throw new Error('Chọn 1 phim chính và ít nhất 1 phim phụ để gộp');
  }

  const ids = [targetId, ...uniqueSourceIds];
  const { data: rows, error: fetchError } = await supabase
    .from('movies')
    .select(MOVIE_MERGE_SELECT)
    .in('id', ids);
  if (fetchError) throw new Error(`movies: ${fetchError.message}`);

  const movies = (rows ?? []) as unknown as MergeMovieRow[];
  const target = movies.find((movie) => movie.id === targetId);
  const sources = uniqueSourceIds
    .map((id) => movies.find((movie) => movie.id === id))
    .filter((movie): movie is MergeMovieRow => Boolean(movie));

  if (!target) throw new Error('Không tìm thấy phim chính');
  if (sources.length !== uniqueSourceIds.length) throw new Error('Một hoặc nhiều phim phụ không tồn tại');

  const summary = {
    movie_episodes: { moved: 0, deduped: 0 },
    episodes: { moved: 0, deduped: 0 },
    streams: { moved: 0, deduped: 0 },
    movie_sources: 0,
    stream_health_logs: 0,
  };

  for (const source of sources) {
    const me = await moveMovieEpisodes(supabase, source.id, targetId);
    summary.movie_episodes.moved += me.moved;
    summary.movie_episodes.deduped += me.deduped;

    const eps = await moveEpisodes(supabase, source.id, targetId);
    summary.episodes.moved += eps.moved;
    summary.episodes.deduped += eps.deduped;

    const streams = await moveStreams(supabase, source.id, targetId);
    summary.streams.moved += streams.moved;
    summary.streams.deduped += streams.deduped;

    summary.movie_sources += await moveSimpleTable(supabase, 'movie_sources', source.id, targetId);
    summary.stream_health_logs += await moveSimpleTable(supabase, 'stream_health_logs', source.id, targetId, false);
  }

  for (const source of sources) {
    const { error } = await supabase
      .from('movies')
      .update({
        is_published: false,
        source_site: 'merged',
        source_name: `Merged into ${target.slug}`,
        tmdb_id: null,
        imdb_id: '',
        ophim_id: '',
        ophim_slug: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', source.id);
    if (error) throw new Error(`hide source movie: ${error.message}`);
  }

  const targetUpdate = mergeMovieFields(target, sources);
  if (Object.keys(targetUpdate).length > 0) {
    const { error } = await supabase.from('movies').update(targetUpdate).eq('id', targetId);
    if (error) throw new Error(`update target movie: ${error.message}`);
  }

  await cleanupCaches(supabase, [target.slug, ...sources.map((source) => source.slug)]);

  await supabase.from('movie_merge_audit').insert({
    target_movie_id: target.id,
    target_slug: target.slug,
    source_movie_ids: sources.map((source) => source.id),
    source_slugs: sources.map((source) => source.slug),
    reason: 'admin-merge',
    summary,
  }).throwOnError();

  return {
    target: { id: target.id, slug: target.slug, name: target.name },
    sources: sources.map((source) => ({ id: source.id, slug: source.slug, name: source.name })),
    summary,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as {
      token?: string;
      action?: 'insert' | 'update' | 'merge';
      movie?: Record<string, unknown>;
      id?: string;
      target_id?: string;
      source_ids?: string[];
    };

    if (!body.token) {
      return new Response(JSON.stringify({ error: 'Missing admin token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { valid } = await verifyAdminToken(body.token);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid or expired admin token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    if (body.action === 'merge') {
      const result = await mergeDuplicateMovies(
        supabase,
        String(body.target_id || ''),
        Array.isArray(body.source_ids) ? body.source_ids.map(String) : [],
      );

      return new Response(JSON.stringify({ success: true, action: 'merge', ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UPDATE existing by explicit ID
    if (body.action === 'update' && body.id) {
      const { created_at, id, ...updateData } = body.movie || {};
      const { data, error } = await supabase
        .from('movies')
        .update(updateData)
        .eq('id', body.id)
        .select('id, slug, name, poster_url, thumb_url, type')
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, movie: data, action: 'update' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // INSERT with deduplication
    const payload = body.movie || {};

    // Step 1: Find existing movie by any identifier
    const existing = await findExistingMovie(supabase, payload);

    if (existing) {
      // Step 2: Merge and UPDATE instead of INSERT
      const merged = mergeMovieData(existing, payload);
      const { created_at: _c, id: _i, slug: _s, ...updatePayload } = merged;

      const { data, error } = await supabase
        .from('movies')
        .update(updatePayload)
        .eq('id', existing.id)
        .select('id, slug, name, poster_url, thumb_url, type')
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ success: true, movie: data, action: 'dedup_update', existingId: existing.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: No duplicate found — INSERT new
    const { data, error } = await supabase
      .from('movies')
      .insert(payload)
      .select('id, slug, name, poster_url, thumb_url, type')
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, movie: data, action: 'insert' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
