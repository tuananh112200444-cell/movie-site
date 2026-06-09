import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') ?? 'https://khophim.org';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUBTITLE_BUCKET = 'subtitles';
const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

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
function safePathPart(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeVttText(text: string): string {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\s*WEBVTT[^\n]*\n*/i, '')
    .replace(/^\s*\d+\s*\n(?=\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+)/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${normalized}\n`;
}

function srtToVtt(text: string): string {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\s*\d+\s*\n(?=\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+)/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${normalized}\n`;
}

function cleanEpisodePayload(episode: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...episode };
  delete cleaned.subtitle_file_name;
  delete cleaned.subtitle_file_base64;
  delete cleaned.subtitle_file_type;
  return cleaned;
}
interface MovieRow {
  id: string;
  slug: string | null;
  name: string | null;
  title_vi: string | null;
  title_en: string | null;
  title_zh: string | null;
  title_original: string | null;
  origin_name: string | null;
  normalized_name: string | null;
  year: number | null;
  type: string | null;
  source_site: string | null;
  source_name: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  ophim_id: string | null;
  ophim_slug: string | null;
  is_published: boolean | null;
}

const MOVIE_CANONICAL_SELECT = 'id,slug,name,title_vi,title_en,title_zh,title_original,origin_name,normalized_name,year,type,source_site,source_name,tmdb_id,imdb_id,ophim_id,ophim_slug,is_published';

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

function sourceText(movie: MovieRow): string {
  return `${movie.source_site || ''} ${movie.source_name || ''}`
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

function isQueerSource(movie: MovieRow): boolean {
  const source = sourceText(movie);
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

function titleCandidates(movie: Record<string, unknown> | MovieRow): string[] {
  const row = movie as Record<string, unknown>;
  return Array.from(new Set([
    row.name,
    row.title_vi,
    row.title_en,
    row.title_zh,
    row.title_original,
    row.origin_name,
    String(row.slug || '').replace(/-/g, ' '),
    String(row.ophim_slug || '').replace(/-/g, ' '),
    row.normalized_name,
  ]
    .map(normalizeTitle)
    .filter((title) => title.length >= 3)));
}

function hasSharedTitle(a: MovieRow, b: MovieRow): boolean {
  const aTitles = titleCandidates(a);
  const bTitles = titleCandidates(b);
  if (aTitles.length === 0 || bTitles.length === 0) return false;
  return aTitles.some((left) =>
    bTitles.some((right) =>
      left === right ||
      (left.length >= 8 && right.includes(left)) ||
      (right.length >= 8 && left.includes(right))
    )
  );
}

function sameYearOrUnknown(a: MovieRow, b: MovieRow): boolean {
  const ay = Number(a.year || 0);
  const by = Number(b.year || 0);
  return ay <= 0 || by <= 0 || ay === by;
}

function compatibleType(a: MovieRow, b: MovieRow): boolean {
  const at = String(a.type || '');
  const bt = String(b.type || '');
  if (!at || !bt || at === bt) return true;
  const movieLike = new Set(['phim-le', 'phim-chieu-rap']);
  return movieLike.has(at) && movieLike.has(bt);
}

function isSameMovieCandidate(a: MovieRow, b: MovieRow): boolean {
  return sameYearOrUnknown(a, b) && compatibleType(a, b) && hasSharedTitle(a, b);
}

function escapePostgrestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, ' ');
}

function canonicalMovieScore(movie: MovieRow, currentId: string, episodeCount: number): number {
  const source = sourceText(movie);
  let score = 0;
  if (isQueerSource(movie)) score += 1500;
  else if (source.includes('admin')) score += 1000;
  else if (!source.includes('ophim') && !source.includes('phimapi')) score += 300;
  if (movie.tmdb_id) score += 100;
  if (movie.imdb_id) score += 50;
  if (movie.is_published) score += 2000;
  else score -= 1000;
  if (source.includes('merged')) score -= 500;
  score += Math.min(episodeCount, 50) * 5;
  if (movie.id === currentId) score += 1;
  return score;
}

async function countMovieEpisodes(
  supabase: ReturnType<typeof createClient>,
  movieId: string,
): Promise<number> {
  const { count } = await supabase
    .from('movie_episodes')
    .select('id', { count: 'exact', head: true })
    .eq('movie_id', movieId)
    .neq('source', 'hidden');
  return count || 0;
}
async function findCanonicalMovie(
  supabase: ReturnType<typeof createClient>,
  movieId: string,
): Promise<{ id: string; slug: string; changed: boolean }> {
  if (!movieId) return { id: movieId, slug: '', changed: false };

  const { data: current } = await supabase
    .from('movies')
    .select(MOVIE_CANONICAL_SELECT)
    .eq('id', movieId)
    .maybeSingle();
  if (!current) return { id: movieId, slug: '', changed: false };

  const currentMovie = current as unknown as MovieRow;
  const candidates = new Map<string, MovieRow>();
  candidates.set(currentMovie.id, currentMovie);

  const exactChecks: Array<{ column: string; value: string | number }> = [
    { column: 'slug', value: currentMovie.slug || '' },
    { column: 'ophim_slug', value: currentMovie.ophim_slug || '' },
    { column: 'ophim_id', value: currentMovie.ophim_id || '' },
    { column: 'imdb_id', value: currentMovie.imdb_id || '' },
    { column: 'tmdb_id', value: currentMovie.tmdb_id || '' },
  ].filter((item) => String(item.value || '').trim());

  for (const check of exactChecks) {
    const { data } = await supabase
      .from('movies')
      .select(MOVIE_CANONICAL_SELECT)
      .eq(check.column, check.value)
      .limit(10);
    for (const row of (data ?? []) as unknown as MovieRow[]) {
      if (row.id) candidates.set(row.id, row);
    }
  }
const year = Number(currentMovie.year || 0);
  const rawTerms = Array.from(new Set([
    currentMovie.name,
    currentMovie.title_vi,
    currentMovie.title_en,
    currentMovie.title_original,
    currentMovie.origin_name,
    String(currentMovie.slug || '').replace(/-/g, ' '),
    String(currentMovie.ophim_slug || '').replace(/-/g, ' '),
  ]
    .map((term) => String(term || '').trim())
    .filter((term) => term.length >= 3)
    .slice(0, 6)));

  for (const term of rawTerms) {
    const safeTerm = escapePostgrestIlike(term);
    let query = supabase
      .from('movies')
      .select(MOVIE_CANONICAL_SELECT)
      .or(`name.ilike.%${safeTerm}%,title_vi.ilike.%${safeTerm}%,title_en.ilike.%${safeTerm}%,title_zh.ilike.%${safeTerm}%,title_original.ilike.%${safeTerm}%,origin_name.ilike.%${safeTerm}%,slug.ilike.%${safeTerm}%,ophim_slug.ilike.%${safeTerm}%`);
    if (Number.isFinite(year) && year > 0) query = query.eq('year', year);
    const { data } = await query.limit(20);
    for (const row of (data ?? []) as unknown as MovieRow[]) {
      if (row.id && isSameMovieCandidate(currentMovie, row)) candidates.set(row.id, row);
    }
  }

  let best = currentMovie;
  let bestScore = -1;
  for (const candidate of candidates.values()) {
    if (!isSameMovieCandidate(currentMovie, candidate) && candidate.id !== currentMovie.id) continue;
    const episodeCount = await countMovieEpisodes(supabase, candidate.id);
    const score = canonicalMovieScore(candidate, currentMovie.id, episodeCount);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return {
    id: best.id || movieId,
    slug: String(best.slug || currentMovie.slug || ''),
    changed: best.id !== movieId,
  };
}
async function canonicalizeEpisodePayload(
  supabase: ReturnType<typeof createClient>,
  episode: Record<string, unknown>,
): Promise<{ episode: Record<string, unknown>; canonical: { id: string; slug: string; changed: boolean } }> {
  const movieId = episode.movie_id ? String(episode.movie_id) : '';
  const canonical = await findCanonicalMovie(supabase, movieId);
  if (canonical.id && canonical.id !== movieId) {
    return {
      episode: { ...episode, movie_id: canonical.id },
      canonical,
    };
  }
  return { episode, canonical };
}
 

async function uploadSubtitleIfPresent(
  supabase: ReturnType<typeof createClient>,
  episode: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fileName = String(episode.subtitle_file_name || '').trim();
  const base64 = String(episode.subtitle_file_base64 || '').trim();
  if (!fileName || !base64) return cleanEpisodePayload(episode);

  const ext = fileName.toLowerCase().split('.').pop();
  if (ext !== 'vtt' && ext !== 'srt') {
    throw new Error('Chỉ hỗ trợ phụ đề .vtt hoặc .srt');
  }

  const bytes = base64ToBytes(base64);
  if (bytes.byteLength > MAX_SUBTITLE_BYTES) {
    throw new Error('File phụ đề tối đa 5MB');
  }

  let uploadBytes = bytes;
  let uploadExt = ext;
  const contentType = 'text/vtt';
  const textDecoder = new TextDecoder('utf-8');
  const textEncoder = new TextEncoder();
  if (ext === 'srt') {
    uploadBytes = textEncoder.encode(srtToVtt(textDecoder.decode(bytes)));
    uploadExt = 'vtt';
  } else {
    uploadBytes = textEncoder.encode(normalizeVttText(textDecoder.decode(bytes)));
  }

  const movieId = safePathPart(String(episode.movie_id || 'movie'), 'movie');
  const epSlug = safePathPart(String(episode.slug || episode.episode_number || 'full'), 'full');
  const safeName = safePathPart(fileName.replace(/\.(srt|vtt)$/i, `.${uploadExt}`), `subtitle.${uploadExt}`);
  const path = `${movieId}/${epSlug}-${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(SUBTITLE_BUCKET)
    .upload(path, uploadBytes, {
      cacheControl: '3600',
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Không thể upload phụ đề: ${error.message}`);
  }

  const { data } = supabase.storage.from(SUBTITLE_BUCKET).getPublicUrl(path);
  return {
    ...cleanEpisodePayload(episode),
    subtitle_url: data.publicUrl,
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
      action?: 'insert' | 'update' | 'delete';
      episode?: Record<string, unknown>;
      id?: number | string;
      movie_id?: string;
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

    // Update
    if (body.action === 'update' && body.id) {
      const canonicalized = await canonicalizeEpisodePayload(supabase, body.episode || {});
      const episodePayload = await uploadSubtitleIfPresent(supabase, canonicalized.episode);
      const { created_at, id, ...updateData } = episodePayload;
      const { data, error } = await supabase
        .from('movie_episodes')
        .update(updateData)
        .eq('id', body.id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        episode: data,
        canonical_movie_id: canonicalized.canonical.id,
        canonical_movie_slug: canonicalized.canonical.slug,
        canonical_changed: canonicalized.canonical.changed,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete
    if (body.action === 'delete' && body.id) {
      const { error } = await supabase
        .from('movie_episodes')
        .delete()
        .eq('id', body.id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, deleted: body.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
// Insert, with defensive upsert to avoid duplicate episode rows.
    const canonicalized = await canonicalizeEpisodePayload(supabase, body.episode || {});
    const incoming = await uploadSubtitleIfPresent(supabase, canonicalized.episode);
    const source = String(incoming.source || '').trim();
    const movieId = incoming.movie_id ? String(incoming.movie_id) : '';
    const serverName = incoming.server_name ? String(incoming.server_name) : '';
    const episodeNumber = incoming.episode_number !== undefined ? Number(incoming.episode_number) : null;

    if (movieId && serverName && episodeNumber !== null && !Number.isNaN(episodeNumber)) {
      let existing: { id: number | string; source?: string | null } | null = null;

      if (source !== 'hidden') {
        const { data } = await supabase
          .from('movie_episodes')
          .select('id, source')
          .eq('movie_id', movieId)
          .eq('server_name', serverName)
          .eq('episode_number', episodeNumber)
          .eq('source', 'hidden')
          .limit(1)
          .maybeSingle();
        existing = data as { id: number | string; source?: string | null } | null;
      }

      if (!existing) {
        let existingQuery = supabase
        .from('movie_episodes')
        .select('id, source')
        .eq('movie_id', movieId)
        .eq('server_name', serverName)
        .eq('episode_number', episodeNumber);

        if (source === 'hidden') {
          existingQuery = existingQuery.eq('source', 'hidden');
        }

        const { data } = await existingQuery.limit(1).maybeSingle();
        existing = data as { id: number | string; source?: string | null } | null;
      }

      if (existing) {
        const { created_at, id, movie_id, ...updateData } = incoming;
        const { data, error } = await supabase
          .from('movie_episodes')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          episode: data,
          action: 'dedup_update',
          canonical_movie_id: canonicalized.canonical.id,
          canonical_movie_slug: canonicalized.canonical.slug,
          canonical_changed: canonicalized.canonical.changed,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Insert
    const { data, error } = await supabase
      .from('movie_episodes')
      .insert(incoming)
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      episode: data,
      canonical_movie_id: canonicalized.canonical.id,
      canonical_movie_slug: canonicalized.canonical.slug,
      canonical_changed: canonicalized.canonical.changed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
