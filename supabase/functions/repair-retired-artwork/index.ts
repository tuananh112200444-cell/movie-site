import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ALLOWED_SECRETS = [
  Deno.env.get('CRON_SECRET') ?? '',
  Deno.env.get('SYNC_SECRET') ?? '',
].filter(Boolean);
const MAX_BATCH = 20;
const CONCURRENCY = 4;

type MovieRow = Record<string, unknown>;
type ProviderMovie = Record<string, unknown>;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
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

function isRetired(value: unknown): boolean {
  const url = String(value || '').trim();
  return !url || /^https?:\/\/phim\.nguonc\.com\/public\/images\//i.test(url);
}

function expectedType(value: unknown): 'single' | 'series' | '' {
  const type = String(value || '').toLowerCase();
  if (/(series|phim-bo|tv)/.test(type)) return 'series';
  if (/(single|phim-le|movie)/.test(type)) return 'single';
  return '';
}

function candidateTitles(movie: ProviderMovie): string[] {
  return [movie.name, movie.origin_name, ...(Array.isArray(movie.alternative_names) ? movie.alternative_names : [])]
    .map(normalize)
    .filter(Boolean);
}

function exactMatch(movie: MovieRow, candidate: ProviderMovie): boolean {
  const expectedTitles = new Set([
    movie.name, movie.origin_name, movie.title_vi, movie.title_en, movie.title_original,
  ].map(normalize).filter(Boolean));
  if (!candidateTitles(candidate).some((title) => expectedTitles.has(title))) return false;
  const year = Number(movie.year || 0);
  const candidateYear = Number(candidate.year || 0);
  if (year && candidateYear && year !== candidateYear) return false;
  const type = expectedType(movie.type);
  const providerType = expectedType(candidate.type);
  return !type || !providerType || type === providerType;
}

async function searchProvider(query: string): Promise<ProviderMovie[]> {
  if (!query.trim()) return [];
  const url = new URL('https://phimapi.com/v1/api/tim-kiem');
  url.searchParams.set('keyword', query.trim());
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', '10');
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'KhoPhim-ArtworkRepair/1.0' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`provider_${response.status}`);
  const payload = await response.json() as { data?: { items?: ProviderMovie[] } };
  return Array.isArray(payload.data?.items) ? payload.data.items : [];
}

async function findVerifiedArtwork(movie: MovieRow): Promise<ProviderMovie | null> {
  const queries = [...new Set([movie.name, movie.origin_name, movie.title_en]
    .map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 2);
  const settled = await Promise.allSettled(queries.map(searchProvider));
  const bySlug = new Map<string, ProviderMovie>();
  settled.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach((candidate) => {
      const slug = String(candidate.slug || '').trim();
      if (slug && exactMatch(movie, candidate)) bySlug.set(slug, candidate);
    });
  });
  const matches = [...bySlug.values()];
  return matches.length === 1 ? matches[0] : null;
}

serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return reply({ error: 'Service unavailable' }, 503);
  const secret = req.headers.get('x-cron-secret') || req.headers.get('x-sync-secret') || '';
  if (!ALLOWED_SECRETS.includes(secret)) return reply({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const limit = Math.max(1, Math.min(Number(body.limit || MAX_BATCH), MAX_BATCH));
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('get_retired_artwork_repair_candidates', { p_limit: limit });
  if (error) return reply({ error: error.message }, 500);

  const candidates = (data || []).filter((movie) => isRetired(movie.poster_url) && isRetired(movie.thumb_url));
  let cursor = 0;
  let repaired = 0;
  let unmatched = 0;
  let failed = 0;
  const repairedSlugs: string[] = [];

  const worker = async () => {
    while (cursor < candidates.length) {
      const movie = candidates[cursor++] as MovieRow;
      try {
        const match = await findVerifiedArtwork(movie);
        const poster = String(match?.poster_url || '').trim();
        const thumb = String(match?.thumb_url || '').trim();
        if (!match || !/^https:\/\/phimimg\.com\//i.test(poster) || !/^https:\/\/phimimg\.com\//i.test(thumb)) {
          unmatched += 1;
          await db.from('movie_tmdb_enrichment_status').upsert({
            movie_id: movie.id,
            status: 'skipped_identity',
            attempted_at: new Date().toISOString(),
            enriched_at: null,
            last_error: null,
            metadata: { artwork_repair: 'kkphim', reason: 'strict_identity_not_confirmed' },
          }, { onConflict: 'movie_id' });
          continue;
        }
        const providerTmdb = match.tmdb && typeof match.tmdb === 'object'
          ? Number((match.tmdb as Record<string, unknown>).id || 0) || null
          : null;
        const patch: Record<string, unknown> = {
          poster_url: poster,
          thumb_url: thumb,
          hero_poster_url: poster,
          hero_backdrop_url: thumb,
          updated_at: new Date().toISOString(),
        };
        if (!Number(movie.tmdb_id || 0) && providerTmdb) patch.tmdb_id = providerTmdb;
        const { error: updateError } = await db.from('movies').update(patch).eq('id', movie.id);
        if (updateError) throw updateError;
        await db.from('movie_tmdb_enrichment_status').upsert({
          movie_id: movie.id,
          status: 'enriched',
          attempted_at: new Date().toISOString(),
          enriched_at: new Date().toISOString(),
          last_error: null,
          metadata: { artwork_repair: 'kkphim', provider_slug: match.slug },
        }, { onConflict: 'movie_id' });
        repaired += 1;
        repairedSlugs.push(String(movie.slug || ''));
      } catch (error) {
        failed += 1;
        await db.from('movie_tmdb_enrichment_status').upsert({
          movie_id: movie.id,
          status: 'retryable_error',
          attempted_at: new Date().toISOString(),
          enriched_at: null,
          last_error: String(error instanceof Error ? error.message : error).slice(0, 500),
          metadata: { artwork_repair: 'kkphim' },
        }, { onConflict: 'movie_id' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length || 1) }, worker));
  return reply({ ok: true, checked: candidates.length, repaired, unmatched, failed, repaired_slugs: repairedSlugs });
});
