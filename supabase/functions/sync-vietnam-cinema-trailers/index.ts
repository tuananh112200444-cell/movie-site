import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SYNC_SECRETS = [
  Deno.env.get('CRON_SECRET'),
  Deno.env.get('VIETNAM_CINEMA_TRAILER_SECRET'),
  Deno.env.get('SYNC_SECRET'),
].filter((value): value is string => Boolean(value));
const SOURCE_ORIGIN = 'https://moveek.com';
const UPCOMING_URL = `${SOURCE_ORIGIN}/sap-chieu/`;
const MAX_CANDIDATES = 30;
const DETAIL_CONCURRENCY = 4;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CinemaCard {
  sourceUrl: string;
  title: string;
  releaseAt: string | null;
  language: string;
}

interface CinemaDetail {
  sourceUrl: string;
  title: string;
  description: string;
  posterUrl: string;
  trailerUrl: string;
  releaseAt: string | null;
  genres: string[];
  actors: string[];
  directors: string[];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}

function titleKey(value: unknown): string {
  return slugify(text(value)).replace(/-/g, '');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function toIsoFromUnixSeconds(value: string): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'KhoPhim trailer catalogue bot/1.0 (+https://khophim.org)',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Cinema source ${response.status} for ${url}`);
  return await response.text();
}

function parseUpcomingCards(html: string): CinemaCard[] {
  const cards: CinemaCard[] = [];
  // Moveek publishes each forthcoming release as an item with a public detail
  // URL and a Unix release timestamp. Keep only those exact catalogue cards.
  const pattern = /<div\b(?=[^>]*\bclass="[^"]*\bitem\b[^"]*")(?=[^>]*\bdata-release="(\d+)")[^>]*\bclass="([^"]*)"[^>]*>[\s\S]{0,2200}?<a\s+href="(\/phim\/[^"?#]+\/)"[^>]*title="([^"]+)"/gi;
  for (const match of html.matchAll(pattern)) {
    const className = text(match[2]).toLowerCase();
    const href = text(match[3]);
    const title = decodeHtml(text(match[4]));
    if (!href || !title) continue;
    cards.push({
      sourceUrl: new URL(href, SOURCE_ORIGIN).toString(),
      title,
      releaseAt: toIsoFromUnixSeconds(match[1]),
      language: (className.match(/\blanguage-([a-z-]+)/)?.[1] ?? '').toLowerCase(),
    });
  }

  const seen = new Set<string>();
  return cards
    .filter((card) => {
      if (seen.has(card.sourceUrl)) return false;
      seen.add(card.sourceUrl);
      return true;
    })
    .filter((card) => !card.releaseAt || Date.parse(card.releaseAt) >= Date.now() - 36 * 60 * 60 * 1000)
    .sort((a, b) => Date.parse(a.releaseAt ?? '9999-12-31') - Date.parse(b.releaseAt ?? '9999-12-31'));
}

function findJsonLd(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]) as unknown;
      const values = Array.isArray(value) ? value : [value];
      const movie = values.find((item) => {
        const record = item as Record<string, unknown>;
        return String(record?.['@type'] ?? '').toLowerCase().includes('movie');
      });
      if (movie && typeof movie === 'object') return movie as Record<string, unknown>;
    } catch {
      // One malformed structured-data block must not discard the page.
    }
  }
  return null;
}

function metaContent(html: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i').exec(html)?.[1];
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i').exec(html)?.[1];
  return decodeHtml(text(direct ?? reversed));
}

function names(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => typeof item === 'object' ? text((item as Record<string, unknown>).name) : text(item))
    .filter(Boolean)
    .slice(0, 16);
}

function imageUrl(value: unknown): string {
  if (typeof value === 'string') return text(value);
  if (value && typeof value === 'object') return text((value as Record<string, unknown>).url);
  return '';
}

function verifiedYoutubeTrailer(html: string): string {
  const videoId = /\bdata-video-url=["']([A-Za-z0-9_-]{11})["']/i.exec(html)?.[1] ?? '';
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
}

function parseCinemaDetail(card: CinemaCard, html: string): CinemaDetail | null {
  const jsonLd = findJsonLd(html);
  const title = text(jsonLd?.name) || card.title;
  const description = text(jsonLd?.description) || metaContent(html, 'description');
  const posterUrl = imageUrl(jsonLd?.image) || metaContent(html, 'og:image');
  const trailerUrl = verifiedYoutubeTrailer(html);
  const releaseAt = text(jsonLd?.datePublished) || card.releaseAt;
  if (!title || !posterUrl || !trailerUrl) return null;

  return {
    sourceUrl: card.sourceUrl,
    title,
    description,
    posterUrl,
    trailerUrl,
    releaseAt: releaseAt || null,
    genres: names(jsonLd?.genre),
    actors: names(jsonLd?.actor),
    directors: names(jsonLd?.director),
  };
}

function hasPlayableEvidence(movie: Record<string, unknown>): boolean {
  const number = Math.max(
    Number(movie.current_episode ?? 0) || 0,
    ...Array.from(text(movie.episode_current).matchAll(/\d+/g)).map((match) => Number(match[0])),
  );
  if (number > 0) return true;
  const label = text(movie.episode_current).toLowerCase();
  return Boolean(label && !/(trailer|teaser|sắp chiếu|sap chieu|đang cập nhật|dang cap nhat)/.test(label));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function findExistingMovie(db: ReturnType<typeof createClient>, detail: CinemaDetail) {
  const bySource = await db
    .from('movies')
    .select('id,slug,name,origin_name,title_vi,year,episode_current,current_episode,source_site,is_published')
    .eq('source_url', detail.sourceUrl)
    .limit(1)
    .maybeSingle();
  if (bySource.error) throw bySource.error;
  if (bySource.data) return bySource.data as Record<string, unknown>;

  const year = new Date(detail.releaseAt ?? '').getFullYear();
  if (!Number.isFinite(year)) return null;
  const candidates = await db
    .from('movies')
    .select('id,slug,name,origin_name,title_vi,year,episode_current,current_episode,source_site,is_published')
    .eq('year', year)
    .eq('is_published', true)
    .limit(150);
  if (candidates.error) throw candidates.error;
  const key = titleKey(detail.title);
  return ((candidates.data ?? []) as unknown as Record<string, unknown>[]).find((movie) =>
    [movie.name, movie.origin_name, movie.title_vi].some((candidate) => titleKey(candidate) === key),
  ) ?? null;
}

function payloadFromDetail(detail: CinemaDetail, card: CinemaCard) {
  const releaseDate = detail.releaseAt ?? card.releaseAt;
  const year = new Date(releaseDate ?? '').getFullYear() || new Date().getFullYear();
  return {
    slug: slugify(`${detail.title}-${year}`) || `moveek-${Date.now()}`,
    name: detail.title,
    origin_name: detail.title,
    title_vi: detail.title,
    title_original: detail.title,
    normalized_name: titleKey(detail.title),
    content: detail.description,
    type: 'phim-le',
    status: 'trailer',
    episode_current: 'Trailer',
    episode_total: '',
    current_episode: 0,
    total_episodes: 0,
    quality: 'HD',
    lang: card.language === 'vietnamese' ? 'Tiếng Việt' : 'Vietsub',
    year,
    thumb_url: detail.posterUrl,
    poster_url: detail.posterUrl,
    trailer_url: detail.trailerUrl,
    actor: detail.actors,
    director: detail.directors,
    category: detail.genres.map((name) => ({ id: slugify(name), name, slug: slugify(name) })),
    country: card.language === 'vietnamese' ? [{ id: 'VN', name: 'Việt Nam', slug: 'viet-nam' }] : [],
    release_at: releaseDate,
    // schedule_type is reserved for daily/weekly episode schedules. A cinema
    // trailer is identified by its verified Trailer label and release_at.
    schedule_type: null,
    schedule_note: 'Trailer chính thức và lịch chiếu được đồng bộ từ lịch phim rạp công khai. KhoPhim sẽ cập nhật nguồn xem khi phim phát hành.',
    seo_catalog_status: 'upcoming',
    catalog_source: 'moveek-cinema-upcoming',
    catalog_synced_at: new Date().toISOString(),
    catalog_window_start: new Date().toISOString().slice(0, 10),
    catalog_window_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    source_site: 'moveek-cinema',
    source_name: 'Moveek Cinema',
    source_url: detail.sourceUrl,
    is_published: true,
    updated_at: new Date().toISOString(),
  };
}

async function upsertCinemaTrailer(
  db: ReturnType<typeof createClient>,
  detail: CinemaDetail,
  card: CinemaCard,
): Promise<'inserted' | 'updated' | 'skipped'> {
  const existing = await findExistingMovie(db, detail);
  if (existing && hasPlayableEvidence(existing)) return 'skipped';

  const payload = payloadFromDetail(detail, card);
  if (existing?.id) {
    const { slug: _slug, ...update } = payload;
    const { error } = await db.from('movies').update(update).eq('id', existing.id as string);
    if (error) throw error;
    return 'updated';
  }

  const { error } = await db.from('movies').insert(payload);
  if (error) {
    if (String(error.message).toLowerCase().includes('duplicate')) return 'skipped';
    throw error;
  }
  return 'inserted';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const providedSecret = url.searchParams.get('secret') || req.headers.get('x-sync-secret') || '';
  if (SYNC_SECRETS.length === 0) return jsonResponse({ error: 'Sync authentication is not configured' }, 503);
  if (!SYNC_SECRETS.includes(providedSecret)) return jsonResponse({ error: 'Unauthorized' }, 401);

  const startedAt = Date.now();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const limit = Math.max(8, Math.min(Number(body.limit ?? url.searchParams.get('limit') ?? MAX_CANDIDATES), 48));
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ sourceUrl?: string; message: string }> = [];

  try {
    const cards = parseUpcomingCards(await fetchText(UPCOMING_URL)).slice(0, limit);
    const details = await mapWithConcurrency(cards, DETAIL_CONCURRENCY, async (card) => {
      try {
        const detail = parseCinemaDetail(card, await fetchText(card.sourceUrl));
        if (!detail) {
          skipped++;
          return null;
        }
        return { card, detail };
      } catch (error) {
        errors.push({ sourceUrl: card.sourceUrl, message: errorMessage(error) });
        return null;
      }
    });

    for (const item of details) {
      if (!item) continue;
      scanned++;
      try {
        const result = await upsertCinemaTrailer(db, item.detail, item.card);
        if (result === 'inserted') inserted++;
        else if (result === 'updated') updated++;
        else skipped++;
      } catch (error) {
        errors.push({ sourceUrl: item.detail.sourceUrl, message: errorMessage(error) });
      }
    }

    await db.from('home_page_cache').delete().in('id', ['search_index_v1']);
    await db.from('sync_logs').insert({
      function_name: 'sync-vietnam-cinema-trailers', scanned, added: inserted, skipped, errors: errors.length,
      details: errors.slice(0, 20), elapsed_ms: Date.now() - startedAt, success: errors.length === 0,
      metadata: { source: UPCOMING_URL, limit, updated },
    });
    return jsonResponse({
      success: true, scanned, inserted, updated, skipped, errors: errors.length,
      details: errors.slice(0, 20), elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = errorMessage(error);
    await db.from('sync_logs').insert({
      function_name: 'sync-vietnam-cinema-trailers', scanned, added: inserted, skipped, errors: errors.length + 1,
      details: [{ message }, ...errors].slice(0, 20), elapsed_ms: Date.now() - startedAt, success: false,
      metadata: { source: UPCOMING_URL, limit, updated },
    }).catch(() => undefined);
    return jsonResponse({ success: false, error: message, scanned, inserted, updated, skipped, details: errors.slice(0, 20) }, 500);
  }
});
