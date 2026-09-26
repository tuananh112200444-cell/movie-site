import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { verifyAdminRequest } from '../_shared/admin-session.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const SITE_URL = 'https://khophim.org';
const BOX_OFFICE_URL = 'https://phongveviet.com/';
const NETFLIX_VIETNAM_URL = 'https://www.netflix.com/tudum/top10/vietnam';
const USER_AGENT = 'KhoPhim-SEO-Radar/1.0 (+https://khophim.org)';

type Signal = {
  source: 'box_office_vietnam' | 'netflix_vietnam' | 'khophim_first_party';
  sourceKey: string;
  title: string;
  originalTitle?: string;
  rank: number;
  demandScore: number;
  sourceUrl: string;
  releaseDate?: string;
  releaseYear?: number;
  movieId?: string;
  movieSlug?: string;
  verifiedCinema?: VerifiedCinemaCandidate;
  evidence?: Record<string, unknown>;
};

type VerifiedCinemaCandidate = {
  sourceUrl: string;
  title: string;
  description: string;
  posterUrl: string;
  trailerUrl: string;
  releaseDate: string;
  year: number;
  genres: string[];
  actors: string[];
  directors: string[];
  country: string;
};

type MatchRow = {
  movie_id: string;
  slug: string;
  movie_name: string;
  movie_year: number | null;
  is_published: boolean;
  match_method: 'alias' | 'exact' | 'fuzzy';
  confidence: number;
};

type MovieRow = {
  id: string;
  slug: string;
  name: string;
  year: number | null;
  is_published: boolean | null;
  status: string | null;
  episode_current: string | null;
  trailer_url: string | null;
  tmdb_id: number | null;
};

type QualityRow = {
  movie_id: string;
  eligible_for_index: boolean;
  index_tier: string;
  quality_score: number;
  content_length: number;
  has_playable_episode: boolean;
  reasons: string[] | null;
};

type ProfileRow = {
  movie_id: string;
  status: string;
  index_mode: string;
  validation_score: number;
  live_audit: Record<string, unknown> | null;
};

type PageProbe = {
  status: number;
  indexable: boolean;
  canonicalOk: boolean;
  robots: string;
  error?: string;
};

function cors(origin: string | null): Record<string, string> {
  const allowed = [
    'https://khophim.org',
    'https://www.khophim.org',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== '{}' ? serialized : String(error);
  } catch {
    return String(error);
  }
}

function normalizeTitle(value: string): string {
  return value
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlDecode(value: string): string {
  const named: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  };
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (full, name: string) => named[name.toLowerCase()] ?? full)
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return normalizeTitle(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function names(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => {
    const itemRecord = record(item);
    return String(itemRecord?.name ?? item ?? '').replace(/\s+/g, ' ').trim();
  }).filter(Boolean).slice(0, 16);
}

function absoluteHttpUrl(value: unknown, base: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, base);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function verifiedYoutubeUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:' || !['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function verifiedCinemaFromHtml(sourceUrl: string, fallbackTitle: string, html: string): VerifiedCinemaCandidate | null {
  let parsedMovie: Record<string, unknown> | null = null;
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      const roots = Array.isArray(parsed) ? parsed : [parsed];
      const candidates = roots.flatMap((item) => {
        const itemRecord = record(item);
        const graph = Array.isArray(itemRecord?.['@graph']) ? itemRecord?.['@graph'] as unknown[] : [];
        return [item, ...graph];
      });
      const movie = candidates.map(record).find((item) => String(item?.['@type'] ?? '').toLowerCase() === 'movie');
      if (movie) {
        parsedMovie = movie;
        break;
      }
    } catch {
      // Ignore unrelated malformed JSON-LD blocks.
    }
  }
  if (!parsedMovie) return null;

  const title = String(parsedMovie.name ?? fallbackTitle).replace(/\s+/g, ' ').trim();
  const description = String(parsedMovie.description ?? '').replace(/\s+/g, ' ').trim();
  const imageValue = record(parsedMovie.image)?.url ?? parsedMovie.image;
  const posterUrl = absoluteHttpUrl(imageValue, sourceUrl);
  const trailer = record(parsedMovie.trailer);
  const trailerUrl = verifiedYoutubeUrl(trailer?.contentUrl ?? trailer?.embedUrl);
  const releaseDate = String(parsedMovie.datePublished ?? '').slice(0, 10);
  const year = Number(releaseDate.slice(0, 4));
  const actors = names(parsedMovie.actor);
  const directors = names(parsedMovie.director).slice(0, 8);
  const genres = names(parsedMovie.genre);
  const country = names(parsedMovie.countryOfOrigin)[0] || 'Việt Nam';
  const currentYear = new Date().getUTCFullYear();
  if (!title || description.length < 80 || !posterUrl || !trailerUrl
      || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
      || year < currentYear - 2 || year > currentYear + 2
      || actors.length === 0 || directors.length === 0) return null;
  return {
    sourceUrl,
    title,
    description,
    posterUrl,
    trailerUrl,
    releaseDate,
    year,
    genres: genres.length ? genres : ['Phim chiếu rạp'],
    actors,
    directors,
    country,
  };
}

async function fetchText(url: string, timeoutMs = 18_000): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} HTTP ${response.status}`);
  return await response.text();
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const runner = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return output;
}

async function fetchBoxOfficeSignals(): Promise<Signal[]> {
  const html = await fetchText(BOX_OFFICE_URL);
  const matches = [...html.matchAll(
    /<tr[^>]*>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*<a[^>]*title="Doanh thu phim ([^"]+)"[^>]*href="(\/phim\/[^"]+)"/gis,
  )].slice(0, 15);
  if (matches.length < 5) throw new Error(`Box-office parser returned only ${matches.length} rows`);

  return await mapConcurrent(matches, 4, async (match) => {
    const rank = Number(match[1]);
    const title = htmlDecode(match[2]);
    const path = match[3];
    const detailUrl = new URL(path, BOX_OFFICE_URL).toString();
    let releaseDate = '';
    let verifiedCinema: VerifiedCinemaCandidate | undefined;
    try {
      const detail = await fetchText(detailUrl, 10_000);
      verifiedCinema = verifiedCinemaFromHtml(detailUrl, title, detail) ?? undefined;
      releaseDate = verifiedCinema?.releaseDate
        ?? detail.match(/"releaseDate":"(\d{4}-\d{2}-\d{2})"/i)?.[1]
        ?? detail.match(/Khởi chiếu:\s*(?:<!--\s*-->)?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i)?.slice(1).reverse().join('-')
        ?? '';
      if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) releaseDate = '';
    } catch {
      // A detail page is enrichment only; the ranking signal remains useful.
    }
    return {
      source: 'box_office_vietnam',
      sourceKey: path.replace(/^\/phim\//, '').replace(/\/$/, ''),
      title,
      rank,
      demandScore: Math.max(60, 100 - (rank - 1) * 3),
      sourceUrl: detailUrl,
      releaseDate: releaseDate || undefined,
      releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : undefined,
      verifiedCinema,
      evidence: { market: 'Vietnam cinema', observed_rank: rank },
    } satisfies Signal;
  });
}

async function fetchNetflixSignals(): Promise<Signal[]> {
  const html = await fetchText(NETFLIX_VIETNAM_URL, 25_000);
  const matches = [...html.matchAll(
    /<span class="rank">(\d+)<\/span>.*?<button>([^<]+)<\/button>/gis,
  )].slice(0, 10);
  if (matches.length < 5) throw new Error(`Netflix parser returned only ${matches.length} rows`);
  return matches.map((match) => {
    const rank = Number(match[1]);
    const title = htmlDecode(match[2]);
    return {
      source: 'netflix_vietnam',
      sourceKey: normalizeTitle(title).replace(/\s+/g, '-'),
      title,
      rank,
      demandScore: Math.max(58, 88 - (rank - 1) * 3),
      sourceUrl: NETFLIX_VIETNAM_URL,
      evidence: { market: 'Netflix Vietnam weekly Top 10', observed_rank: rank },
    } satisfies Signal;
  });
}

async function fetchFirstPartySignals(
  db: ReturnType<typeof createClient>,
): Promise<Signal[]> {
  const { data, error } = await db.rpc('get_top10_movies_today', { p_limit: 10 });
  if (error) {
    // The live ranking is deliberately bounded but can still hit the database
    // statement timeout during viewer peaks. Keep the last fresh snapshot for
    // at most 36 hours rather than dropping first-party demand from the brain.
    const { data: cached, error: cachedError } = await db.from('seo_hot_movie_candidates')
      .select('source_key,title,source_rank,demand_score,source_url,matched_movie_id,matched_slug,release_year,evidence,last_seen_at')
      .eq('source', 'khophim_first_party')
      .eq('active', true)
      .gt('expires_at', new Date().toISOString())
      .order('source_rank', { ascending: true })
      .limit(10);
    if (cachedError || !cached?.length) throw error;
    return cached.map((row: Record<string, unknown>) => ({
      source: 'khophim_first_party',
      sourceKey: String(row.source_key || ''),
      title: String(row.title || ''),
      rank: Number(row.source_rank || 0) || 10,
      demandScore: Number(row.demand_score || 0),
      sourceUrl: String(row.source_url || SITE_URL),
      releaseYear: Number(row.release_year || 0) || undefined,
      movieId: String(row.matched_movie_id || '') || undefined,
      movieSlug: String(row.matched_slug || '') || undefined,
      evidence: {
        ...(row.evidence && typeof row.evidence === 'object' ? row.evidence as Record<string, unknown> : {}),
        cached_snapshot: true,
        cached_at: row.last_seen_at,
        fallback_error: error.message,
      },
    })).filter((signal: Signal) => signal.sourceKey && signal.title);
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const item = row.item && typeof row.item === 'object'
      ? row.item as Record<string, unknown>
      : {};
    const slug = String(item.slug || '');
    const movieId = String(item.id || item._id || '');
    const rank = Number(row.rank || 0) || 10;
    return {
      source: 'khophim_first_party',
      sourceKey: slug || movieId,
      title: String(item.name || item.title_vi || slug),
      rank,
      demandScore: Math.max(0, Math.min(100, Math.round(Number(row.score || 0)))),
      sourceUrl: slug ? `${SITE_URL}/phim/${encodeURIComponent(slug)}` : SITE_URL,
      releaseYear: Number(item.year || 0) || undefined,
      movieId: movieId || undefined,
      movieSlug: slug || undefined,
      evidence: {
        market: 'KhoPhim first-party engaged playback',
        viewers_today: Number(row.viewers_today || 0),
        watch_seconds_today: Number(row.watch_seconds_today || 0),
      },
    } satisfies Signal;
  }).filter((signal: Signal) => signal.sourceKey && signal.title);
}

function cinemaEditorialContent(candidate: VerifiedCinemaCandidate): string {
  const actorText = candidate.actors.slice(0, 6).join(', ');
  const directorText = candidate.directors.join(', ');
  const facts = `${candidate.title} là phim chiếu rạp năm ${candidate.year}, khởi chiếu ngày ${candidate.releaseDate.split('-').reverse().join('/')}. `
    + `Phim do ${directorText} đạo diễn, với sự tham gia của ${actorText}.`;
  const update = `KhoPhim đã ghi nhận trailer chính thức và trang thông tin của ${candidate.title} để người xem có thể theo dõi sớm. `
    + 'Thông tin lịch phát hành, nội dung và nguồn xem sẽ tiếp tục được đối chiếu; khi có nguồn phát hợp lệ, trang phim này sẽ được cập nhật trên cùng một địa chỉ.';
  return `${candidate.description} ${facts} ${update}`.replace(/\s+/g, ' ').trim();
}

function hasPlayableMarker(movie: Record<string, unknown>): boolean {
  if (Number(movie.current_episode || 0) > 0) return true;
  const label = String(movie.episode_current || '').toLocaleLowerCase('vi-VN');
  return Boolean(label && !/(trailer|teaser|sắp chiếu|sap chieu|đang cập nhật|dang cap nhat)/.test(label));
}

async function importVerifiedCinemaMovie(
  db: ReturnType<typeof createClient>,
  candidate: VerifiedCinemaCandidate,
  matchedMovieId?: string,
): Promise<{ movie: MovieRow; inserted: boolean; changed: boolean } | null> {
  const movieFields = 'id,slug,name,year,is_published,status,episode_current,current_episode,trailer_url,tmdb_id,source_site,content,poster_url,release_at';
  let existingQuery = db.from('movies').select(movieFields).is('superseded_by_movie_id', null).limit(1);
  existingQuery = matchedMovieId
    ? existingQuery.eq('id', matchedMovieId)
    : existingQuery.eq('source_url', candidate.sourceUrl);
  const existingBySource = await existingQuery.maybeSingle();
  if (existingBySource.error) throw existingBySource.error;
  if (existingBySource.data && hasPlayableMarker(existingBySource.data as Record<string, unknown>)) {
    return { movie: existingBySource.data as unknown as MovieRow, inserted: false, changed: false };
  }

  const now = new Date().toISOString();
  const slug = slugify(`${candidate.title}-${candidate.year}`) || `cinema-${Date.now()}`;
  const category = candidate.genres.map((name) => ({ id: slugify(name), name, slug: slugify(name) }));
  const countrySlug = slugify(candidate.country);
  const content = cinemaEditorialContent(candidate);
  const payload = {
    slug,
    name: candidate.title,
    origin_name: candidate.title,
    title_vi: candidate.title,
    title_original: candidate.title,
    normalized_name: normalizeTitle(candidate.title).replace(/\s+/g, ''),
    content,
    type: 'phim-le',
    status: 'trailer',
    episode_current: 'Trailer',
    episode_total: '',
    current_episode: 0,
    total_episodes: 0,
    quality: 'HD',
    lang: candidate.country.toLocaleLowerCase('vi-VN').includes('việt') ? 'Tiếng Việt' : 'Vietsub',
    year: candidate.year,
    thumb_url: candidate.posterUrl,
    poster_url: candidate.posterUrl,
    trailer_url: candidate.trailerUrl,
    actor: candidate.actors,
    director: candidate.directors,
    category,
    country: [{ id: countrySlug === 'viet-nam' ? 'VN' : countrySlug, name: candidate.country, slug: countrySlug }],
    release_at: candidate.releaseDate,
    schedule_type: null,
    schedule_note: 'Trang phim được tạo từ tín hiệu phòng vé đã xác minh; KhoPhim sẽ cập nhật nguồn xem khi có nguồn hợp lệ.',
    seo_catalog_status: 'upcoming',
    catalog_source: 'phongveviet-hot-radar',
    catalog_synced_at: now,
    catalog_window_start: now.slice(0, 10),
    catalog_window_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    source_site: 'phongveviet-cinema',
    source_name: 'Phòng Vé Việt',
    source_url: candidate.sourceUrl,
    is_published: true,
    updated_at: now,
  };

  let movie: MovieRow | null = null;
  let inserted = false;
  if (existingBySource.data?.id) {
    if (String(existingBySource.data.content || '') === content
        && String(existingBySource.data.trailer_url || '') === candidate.trailerUrl
        && String(existingBySource.data.poster_url || '') === candidate.posterUrl
        && String(existingBySource.data.release_at || '').slice(0, 10) === candidate.releaseDate) {
      return { movie: existingBySource.data as unknown as MovieRow, inserted: false, changed: false };
    }
    const {
      slug: _slug,
      source_site: _sourceSite,
      source_name: _sourceName,
      source_url: _sourceUrl,
      catalog_source: _catalogSource,
      ...trustedUpdate
    } = payload;
    const update = matchedMovieId ? trustedUpdate : {
      ...trustedUpdate,
      source_site: payload.source_site,
      source_name: payload.source_name,
      source_url: payload.source_url,
      catalog_source: payload.catalog_source,
    };
    const result = await db.from('movies').update(update)
      .eq('id', String(existingBySource.data.id))
      .select(movieFields)
      .single();
    if (result.error) throw result.error;
    movie = result.data as unknown as MovieRow;
  } else {
    const result = await db.from('movies').insert(payload).select(movieFields).single();
    if (result.error) {
      if (!String(result.error.message).toLowerCase().includes('duplicate')) throw result.error;
      const duplicate = await db.from('movies').select(movieFields).eq('slug', slug).limit(1).maybeSingle();
      if (duplicate.error || !duplicate.data) throw duplicate.error || result.error;
      movie = duplicate.data as unknown as MovieRow;
    } else {
      movie = result.data as unknown as MovieRow;
      inserted = true;
    }
  }
  if (!movie?.id) return null;
  const refresh = await db.rpc('refresh_movie_seo_quality', { p_movie_id: movie.id });
  if (refresh.error) throw refresh.error;
  return { movie, inserted, changed: true };
}

async function probePage(slug: string): Promise<PageProbe> {
  const expectedCanonical = `${SITE_URL}/phim/${encodeURIComponent(slug)}`;
  try {
    const response = await fetch(`${expectedCanonical}?seo_hot_probe=${Date.now()}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Googlebot',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12_000),
    });
    const html = await response.text();
    const robots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i)?.[1]
      ?? '';
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
      ?? '';
    return {
      status: response.status,
      indexable: response.status === 200 && !/noindex/i.test(robots),
      canonicalOk: canonical.replace(/\/$/, '') === expectedCanonical.replace(/\/$/, ''),
      robots,
    };
  } catch (error) {
    return {
      status: 0,
      indexable: false,
      canonicalOk: false,
      robots: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function chooseMatch(rows: MatchRow[]): {
  row: MatchRow | null;
  status: 'alias' | 'exact' | 'fuzzy' | 'missing' | 'ambiguous';
  confidence: number;
} {
  if (!rows.length) return { row: null, status: 'missing', confidence: 0 };
  const first = rows[0];
  const second = rows[1];
  const firstScore = Number(first.confidence || 0);
  const secondScore = Number(second?.confidence || 0);
  if (first.match_method === 'alias') {
    return { row: first, status: 'alias', confidence: firstScore };
  }
  if (first.match_method === 'exact') {
    if (!second || second.match_method !== 'exact') {
      return { row: first, status: 'exact', confidence: firstScore };
    }
    return { row: null, status: 'ambiguous', confidence: firstScore };
  }
  if (firstScore >= 0.82 && (!second || firstScore - secondScore >= 0.08)) {
    return { row: first, status: 'fuzzy', confidence: firstScore };
  }
  return { row: null, status: 'ambiguous', confidence: firstScore };
}

function classifyReadiness(input: {
  matchStatus: string;
  movie?: MovieRow;
  quality?: QualityRow;
  profile?: ProfileRow;
  probe?: PageProbe;
  inSitemap: boolean;
}): { status: string; action: string } {
  if (input.matchStatus === 'missing') {
    return { status: 'import_movie', action: 'Nhập đúng phim vào kho, xác minh TMDB/năm rồi tạo trang trailer hoặc trang xem.' };
  }
  if (input.matchStatus === 'ambiguous' || !input.movie) {
    return { status: 'review_identity', action: 'Xác nhận đúng phiên bản phim trước khi ghép hoặc tạo URL SEO.' };
  }
  if (input.movie.is_published !== true) {
    return { status: 'publish_movie', action: 'Hoàn thiện dữ liệu và xuất bản đúng bản phim trong kho.' };
  }
  const quality = input.quality;
  const profilePassed = input.profile?.status === 'published'
    && input.profile.index_mode !== 'noindex'
    && Number(input.profile.validation_score || 0) >= 85
    && input.profile.live_audit?.passed === true;
  const qualityPassed = quality?.eligible_for_index === true
    && Number(quality.quality_score || 0) >= 85
    && (Number(quality.content_length || 0) >= 500 || profilePassed);
  if (!qualityPassed) {
    return { status: 'enrich_content', action: 'Bổ sung nội dung gốc, metadata, trailer/nguồn và liên kết chủ đề đến khi đạt cổng phát hành.' };
  }
  if (!input.probe || input.probe.status !== 200 || !input.probe.indexable || !input.probe.canonicalOk) {
    return { status: 'repair_technical', action: 'Sửa HTTP/robots/canonical của trang production trước khi tối ưu từ khóa.' };
  }
  if (!input.inSitemap) {
    return { status: 'release_static', action: 'Tạo lại artifact tĩnh và đưa URL vào sitemap phù hợp.' };
  }
  return {
    status: 'ready',
    action: profilePassed
      ? 'Theo dõi từ khóa tên phim; chỉ chỉnh khi có tín hiệu CTR/vị trí rõ ràng.'
      : 'Tạo hồ sơ biên tập SEO cho cụm từ tên phim trong khi trang kỹ thuật đã sẵn sàng.',
  };
}

async function loadSitemapText(): Promise<string> {
  const paths = [
    '/sitemap-movies-recent.xml',
    '/sitemap-movies-upcoming.xml',
    '/sitemap-seo-studio.xml',
    '/sitemap-movies-1.xml',
  ];
  const results = await Promise.allSettled(paths.map((path) => fetchText(`${SITE_URL}${path}`, 10_000)));
  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []).join('\n');
}

async function dashboard(db: ReturnType<typeof createClient>) {
  const [{ data: run }, { data: candidates }] = await Promise.all([
    db.from('seo_hot_movie_runs')
      .select('id,started_at,finished_at,status,sources_attempted,sources_succeeded,signals_seen,matched_count,missing_count,summary,error_message')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('seo_hot_movie_candidates')
      .select('id,source,source_key,title,original_title,release_date,release_year,source_rank,demand_score,source_url,matched_movie_id,matched_slug,match_status,match_confidence,readiness_status,recommended_action,evidence,last_seen_at,expires_at')
      .eq('active', true)
      .gt('expires_at', new Date().toISOString())
      .order('demand_score', { ascending: false })
      .order('source_rank', { ascending: true, nullsFirst: false })
      .limit(40),
  ]);
  return { latest_run: run ?? null, candidates: candidates ?? [] };
}

async function runRadar(db: ReturnType<typeof createClient>) {
  await db.from('seo_hot_movie_runs').update({
    finished_at: new Date().toISOString(),
    status: 'failed',
    error_message: 'Recovered stale run after Edge Function interruption or timeout.',
  }).eq('status', 'running').lt('started_at', new Date(Date.now() - 5 * 60_000).toISOString());

  const { data: run, error: runError } = await db.from('seo_hot_movie_runs')
    .insert({ started_at: new Date().toISOString(), status: 'running' })
    .select('id')
    .single();
  if (runError || !run) throw new Error(runError?.message || 'Cannot create radar run');

  try {
  const sourceErrors: string[] = [];
  const signals: Signal[] = [];
  const sources = [
    { name: 'box_office_vietnam', fetcher: fetchBoxOfficeSignals },
    { name: 'netflix_vietnam', fetcher: fetchNetflixSignals },
    { name: 'khophim_first_party', fetcher: () => fetchFirstPartySignals(db) },
  ] as const;
  const fetched = await Promise.allSettled(sources.map((source) => source.fetcher()));
  const successfulSources = new Set<string>();
  fetched.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      successfulSources.add(sources[index].name);
      signals.push(...result.value);
    } else {
      const reason = result.status === 'rejected'
        ? errorMessage(result.reason)
        : 'no signals';
      sourceErrors.push(`${sources[index].name}: ${reason}`);
    }
  });

  if (!signals.length) {
    await db.from('seo_hot_movie_runs').update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      sources_attempted: sources.length,
      sources_succeeded: 0,
      error_message: sourceErrors.join(' | ').slice(0, 2000),
    }).eq('id', run.id);
    throw new Error('All hot-movie signal sources failed');
  }

  let matched = await mapConcurrent(signals, 5, async (signal) => {
    if (signal.movieId && signal.movieSlug) {
      return {
        signal,
        match: {
          row: {
            movie_id: signal.movieId,
            slug: signal.movieSlug,
            movie_name: signal.title,
            movie_year: signal.releaseYear ?? null,
            is_published: true,
            match_method: 'exact' as const,
            confidence: 1,
          },
          status: 'direct' as const,
          confidence: 1,
        },
        options: [] as MatchRow[],
      };
    }
    const { data, error } = await db.rpc('match_seo_hot_movie_candidate', {
      p_source: signal.source,
      p_title: signal.title,
      p_release_year: signal.releaseYear ?? null,
    });
    if (error) throw error;
    const options = (data ?? []) as MatchRow[];
    return { signal, match: chooseMatch(options), options };
  });

  let autoImportedCount = 0;
  let autoLinkedCount = 0;
  matched = await mapConcurrent(matched, 2, async (item) => {
    if (!item.signal.verifiedCinema || item.match.status === 'ambiguous') return item;
    try {
      const imported = await importVerifiedCinemaMovie(
        db,
        item.signal.verifiedCinema,
        item.match.row?.movie_id,
      );
      if (!imported) return item;
      if (imported.inserted) autoImportedCount += 1;
      else if (imported.changed) autoLinkedCount += 1;
      item.signal.evidence = {
        ...(item.signal.evidence ?? {}),
        verified_cinema_import: true,
        imported_new_movie: imported.inserted,
        enriched_existing_movie: !imported.inserted && imported.changed,
      };
      if (item.match.status !== 'missing') return item;
      return {
        signal: item.signal,
        match: {
          row: {
            movie_id: imported.movie.id,
            slug: imported.movie.slug,
            movie_name: imported.movie.name,
            movie_year: imported.movie.year,
            is_published: imported.movie.is_published === true,
            match_method: 'exact' as const,
            confidence: 1,
          },
          status: 'direct' as const,
          confidence: 1,
        },
        options: [] as MatchRow[],
      };
    } catch (error) {
      sourceErrors.push(`verified import ${item.signal.sourceKey}: ${errorMessage(error)}`);
      return item;
    }
  });

  const movieIds = [...new Set(matched.flatMap((item) => item.match.row?.movie_id ? [item.match.row.movie_id] : []))];
  const [{ data: movieRows }, { data: qualityRows }, { data: profileRows }, sitemapText] = await Promise.all([
    movieIds.length
      ? db.from('movies').select('id,slug,name,year,is_published,status,episode_current,trailer_url,tmdb_id').in('id', movieIds)
      : Promise.resolve({ data: [] }),
    movieIds.length
      ? db.from('movie_seo_quality_status').select('movie_id,eligible_for_index,index_tier,quality_score,content_length,has_playable_episode,reasons').in('movie_id', movieIds)
      : Promise.resolve({ data: [] }),
    movieIds.length
      ? db.from('movie_seo_profiles').select('movie_id,status,index_mode,validation_score,live_audit').in('movie_id', movieIds)
      : Promise.resolve({ data: [] }),
    loadSitemapText(),
  ]);
  const movies = new Map(((movieRows ?? []) as MovieRow[]).map((row) => [row.id, row]));
  const qualities = new Map(((qualityRows ?? []) as QualityRow[]).map((row) => [row.movie_id, row]));
  const profiles = new Map(((profileRows ?? []) as ProfileRow[]).map((row) => [row.movie_id, row]));
  const probeBySlug = new Map<string, PageProbe>();
  const slugs = [...new Set(movieIds.flatMap((id) => movies.get(id)?.slug ? [movies.get(id)!.slug] : []))];
  const probes = await mapConcurrent(slugs, 4, async (slug) => ({ slug, probe: await probePage(slug) }));
  probes.forEach(({ slug, probe }) => probeBySlug.set(slug, probe));

  for (const source of successfulSources) {
    const { error } = await db.from('seo_hot_movie_candidates')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('source', source)
      .eq('active', true);
    if (error) sourceErrors.push(`${source} deactivate: ${error.message}`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();
  const rows = matched.map(({ signal, match, options }) => {
    const movieId = match.row?.movie_id || '';
    const movie = movieId ? movies.get(movieId) : undefined;
    const quality = movieId ? qualities.get(movieId) : undefined;
    const profile = movieId ? profiles.get(movieId) : undefined;
    const probe = movie?.slug ? probeBySlug.get(movie.slug) : undefined;
    const inSitemap = movie?.slug
      ? sitemapText.includes(`/phim/${movie.slug}<`) || sitemapText.includes(`/phim/${encodeURIComponent(movie.slug)}<`)
      : false;
    const readiness = classifyReadiness({
      matchStatus: match.status,
      movie,
      quality,
      profile,
      probe,
      inSitemap,
    });
    return {
      run_id: run.id,
      source: signal.source,
      source_key: signal.sourceKey,
      title: signal.title,
      normalized_title: normalizeTitle(signal.title),
      original_title: signal.originalTitle || null,
      release_date: signal.releaseDate || null,
      release_year: signal.releaseYear || null,
      source_rank: signal.rank,
      demand_score: signal.demandScore,
      source_url: signal.sourceUrl,
      matched_movie_id: movieId || null,
      matched_slug: movie?.slug || match.row?.slug || null,
      match_status: match.status,
      match_confidence: match.confidence,
      readiness_status: readiness.status,
      recommended_action: readiness.action,
      evidence: {
        ...signal.evidence,
        match_options: options.slice(0, 3),
        quality: quality ?? null,
        profile: profile ? {
          status: profile.status,
          index_mode: profile.index_mode,
          validation_score: profile.validation_score,
          live_audit_passed: profile.live_audit?.passed === true,
        } : null,
        production: probe ?? null,
        in_sitemap: inSitemap,
      },
      active: true,
      last_seen_at: now.toISOString(),
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    };
  });

  const { error: upsertError } = await db.from('seo_hot_movie_candidates')
    .upsert(rows, { onConflict: 'source,source_key' });
  if (upsertError) throw upsertError;
  await db.from('seo_hot_movie_candidates')
    .update({ active: false, updated_at: now.toISOString() })
    .eq('active', true)
    .lt('expires_at', now.toISOString());

  const { data: workItems, error: workItemError } = await db.rpc('refresh_seo_hot_movie_work_items');
  if (workItemError) sourceErrors.push(`work_items: ${workItemError.message}`);
  const matchedCount = rows.filter((row) => row.matched_movie_id).length;
  const missingCount = rows.filter((row) => !row.matched_movie_id).length;
  const status = successfulSources.size === sources.length && !workItemError ? 'success' : 'partial';
  const summary = {
    sources: [...successfulSources],
    source_errors: sourceErrors,
    ready: rows.filter((row) => row.readiness_status === 'ready').length,
    import_movie: rows.filter((row) => row.readiness_status === 'import_movie').length,
    review_identity: rows.filter((row) => row.readiness_status === 'review_identity').length,
    publish_movie: rows.filter((row) => row.readiness_status === 'publish_movie').length,
    enrich_content: rows.filter((row) => row.readiness_status === 'enrich_content').length,
    repair_technical: rows.filter((row) => row.readiness_status === 'repair_technical').length,
    release_static: rows.filter((row) => row.readiness_status === 'release_static').length,
    auto_imported: autoImportedCount,
    auto_linked: autoLinkedCount,
    work_items: workItems ?? null,
  };
  await db.from('seo_hot_movie_runs').update({
    finished_at: new Date().toISOString(),
    status,
    sources_attempted: sources.length,
    sources_succeeded: successfulSources.size,
    signals_seen: rows.length,
    matched_count: matchedCount,
    missing_count: missingCount,
    summary,
    error_message: sourceErrors.length ? sourceErrors.join(' | ').slice(0, 2000) : null,
  }).eq('id', run.id);

  return {
    ok: status === 'success',
    partial: status === 'partial',
    run_id: run.id,
    signals: rows.length,
    matched: matchedCount,
    missing: missingCount,
    summary,
  };
  } catch (error) {
    const message = errorMessage(error).slice(0, 2000);
    await db.from('seo_hot_movie_runs').update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: message,
    }).eq('id', run.id);
    throw new Error(message);
  }
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Missing Supabase environment' }, 500, headers);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (req.method === 'GET') {
    if (!await verifyAdminRequest(req)) return json({ error: 'Unauthorized' }, 401, headers);
    return json({ ok: true, ...await dashboard(db) }, 200, headers);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

  const cronAuthorized = Boolean(CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET);
  const adminAuthorized = cronAuthorized ? false : await verifyAdminRequest(req);
  if (!cronAuthorized && !adminAuthorized) return json({ error: 'Unauthorized' }, 401, headers);

  try {
    const result = await runRadar(db);
    return json(result, result.partial ? 207 : 200, headers);
  } catch (error) {
    return json({ error: errorMessage(error) }, 500, headers);
  }
});
