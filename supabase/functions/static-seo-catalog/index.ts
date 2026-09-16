import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { hasValidPublishableApiKey, withPublicReadCors } from '../_shared/public-api-key.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MAX_PAGE_SIZE = 500;
const UPCOMING_COHORT_LIMIT = 20;
const UPCOMING_MIN_QUALITY_SCORE = 88;
const UPCOMING_MIN_CONTENT_LENGTH = 350;
const MOVIE_FIELDS = [
  'id', 'slug', 'name', 'origin_name', 'title_vi', 'title_en', 'title_original',
  'content', 'type', 'status', 'thumb_url', 'poster_url', 'trailer_url', 'time',
  'episode_current', 'episode_total', 'current_episode', 'total_episodes',
  'quality', 'lang', 'year', 'actor', 'director', 'category', 'country', 'view',
  'tmdb_id', 'imdb_id', 'source_site', 'source_name', 'updated_at', 'is_published',
  'superseded_by_movie_id',
].join(',');

function json(req: Request, body: unknown, status = 200): Response {
  return withPublicReadCors(new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300, stale-while-revalidate=1800' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  }), req.headers.get('origin'));
}

function cleanText(value: unknown): string {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasUsefulPerson(values: unknown[]): boolean {
  return values.some((value) => {
    const normalized = cleanText(value).toLocaleLowerCase('vi-VN');
    return normalized.length >= 2
      && !/^(?:đang cập nhật|dang cap nhat|updating|unknown|n\/a|null)$/i.test(normalized);
  });
}

function hasOfficialTrailerUrl(value: unknown): boolean {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:') return false;
    if (host === 'youtu.be') return url.pathname.replace(/^\/+/, '').length >= 6;
    if (host !== 'youtube.com' && host !== 'm.youtube.com') return false;
    return url.pathname === '/watch'
      ? String(url.searchParams.get('v') || '').length >= 6
      : /^\/(?:embed|shorts)\/[A-Za-z0-9_-]{6,}/.test(url.pathname);
  } catch {
    return false;
  }
}

function isHighValueStaticMovie(movie: Record<string, unknown>, upcoming = false): boolean {
  const profile = movie.seo_profile && typeof movie.seo_profile === 'object'
    ? movie.seo_profile as Record<string, unknown>
    : null;
  const name = String(movie.name || '').trim();
  const originName = String(movie.origin_name || movie.title_original || '').trim();
  const content = cleanText(movie.content);
  const image = String(movie.poster_url || movie.thumb_url || '').trim();
  const year = Number(movie.year || 0);
  const tmdbId = Number(movie.tmdb_id || 0);
  const actors = Array.isArray(movie.actor) ? movie.actor.filter(Boolean) : [];
  const categories = Array.isArray(movie.category) ? movie.category.filter(Boolean) : [];
  const countries = Array.isArray(movie.country) ? movie.country.filter(Boolean) : [];
  const broken = /(?:Ã[^\s<]|Ä[^\s<]|Æ[^\s<]|áº|á»|â€|Â[\u0080-\u00bf])/.test(`${name} ${originName} ${content}`);
  const currentYear = new Date().getUTCFullYear();
  const manuallyApproved = profile?.status === 'published'
    && profile?.index_mode === 'index'
    && (profile?.live_audit as Record<string, unknown> | undefined)?.passed === true
    && Number(profile?.validation_score || 0) >= 85;
  const requiredContentLength = upcoming
    ? UPCOMING_MIN_CONTENT_LENGTH
    : (manuallyApproved ? 160 : 500);
  return name.length >= 2 && content.length >= requiredContentLength && Boolean(image)
    && year >= 1888 && year <= currentYear + 2 && (manuallyApproved || tmdbId > 0)
    && categories.length > 0 && countries.length > 0 && !broken
    && (manuallyApproved || (originName.length >= 2 && hasUsefulPerson(actors)))
    && (manuallyApproved || hasUsefulPerson(Array.isArray(movie.director) ? movie.director.filter(Boolean) : []))
    && (!upcoming || (year >= currentYear && hasOfficialTrailerUrl(movie.trailer_url)));
}

function profileMovie(row: Record<string, unknown>): Record<string, unknown> | null {
  const nested = Array.isArray(row.movies) ? row.movies[0] : row.movies;
  if (!nested || typeof nested !== 'object') return null;
  const movie = nested as Record<string, unknown>;
  const profile = {
    status: row.status,
    index_mode: row.index_mode,
    validation_score: Number(row.validation_score || 0),
    seo_title: row.seo_title,
    meta_description: row.meta_description,
    canonical_path: row.canonical_path,
    og_image_url: row.og_image_url,
    focus_keyword: row.focus_keyword,
    secondary_keywords: row.secondary_keywords,
    faq: row.faq,
    topic_links: row.topic_links,
    review_content: row.review_content,
    version: Number(row.version || 0),
    live_audit: row.live_audit,
    updated_at: row.updated_at,
  };
  return {
    ...movie,
    content: String(row.intro_content || movie.content || ''),
    seo_profile: profile,
    seo_index_tier: 'manual',
    seo_quality_score: Number(row.validation_score || 0),
    seo_checked_at: row.updated_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(req, null, 204);
  if (req.method !== 'GET' || !hasValidPublishableApiKey(req)) {
    return json(req, { status: false, message: 'Unauthorized' }, 401);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(req, { status: false, message: 'Missing Supabase environment' }, 500);
  }

  const url = new URL(req.url);
  const upcomingCohort = url.searchParams.get('cohort') === 'upcoming';
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset') || 0)));
  const maxLimit = upcomingCohort ? UPCOMING_COHORT_LIMIT : MAX_PAGE_SIZE;
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(url.searchParams.get('limit') || maxLimit))));
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let qualityQuery = supabase
      .from('movie_seo_quality_status')
      .select(`
        movie_id,slug,index_tier,quality_score,freshness_score,checked_at,
        latest_episode_number,declared_total_episodes,episode_progress_percent,
        movies!inner(${MOVIE_FIELDS})
      `)
      .eq('eligible_for_index', true)
      .eq('movies.is_published', true)
      .is('movies.superseded_by_movie_id', null)
      .not('movies.tmdb_id', 'is', null);
  qualityQuery = upcomingCohort
    ? qualityQuery
      .eq('index_tier', 'upcoming')
      .gte('quality_score', UPCOMING_MIN_QUALITY_SCORE)
      .gte('content_length', UPCOMING_MIN_CONTENT_LENGTH)
    : qualityQuery
      .in('index_tier', ['playable', 'ongoing'])
      .gte('quality_score', 85)
      .gte('content_length', 500);
  qualityQuery = qualityQuery
      .order('quality_score', { ascending: false })
      .order('freshness_score', { ascending: false })
      .order('checked_at', { ascending: false })
      .order('slug', { ascending: true })
      .range(offset, offset + limit - 1);

  // Trailer/upcoming pages can also have a verified editorial profile.  They
  // must receive it in the static document; otherwise the public HTML would
  // lag behind an already-audited publish until the title becomes playable.
  const profileQuery = supabase
    .from('movie_seo_profiles')
    .select(`
      movie_id,slug,status,index_mode,validation_score,seo_title,meta_description,
      canonical_path,og_image_url,focus_keyword,secondary_keywords,intro_content,review_content,
      faq,topic_links,version,live_audit,last_audited_at,updated_at,movies!inner(${MOVIE_FIELDS})
    `)
    .eq('status', 'published')
    .neq('index_mode', 'noindex')
    .gte('validation_score', 70)
    .eq('live_audit->>passed', 'true')
    .eq('movies.is_published', true)
    .is('movies.superseded_by_movie_id', null)
    .order('updated_at', { ascending: false })
    .range(0, 999);

  const [qualityResult, profileResult] = await Promise.all([
    qualityQuery,
    profileQuery,
  ]);

  if (qualityResult.error) return json(req, { status: false, message: qualityResult.error.message }, 503);
  if (profileResult.error && profileResult.error.code !== '42P01') {
    return json(req, { status: false, message: profileResult.error.message }, 503);
  }
  const data = qualityResult.data;
  const qualityItems = (qualityResult.data ?? []).flatMap((row) => {
    const raw = row as unknown as Record<string, unknown>;
    const nested = Array.isArray(raw.movies) ? raw.movies[0] : raw.movies;
    if (!nested || typeof nested !== 'object') return [];
    const movie = nested as Record<string, unknown>;
    if (!isHighValueStaticMovie(movie, upcomingCohort)) return [];
    return [{
      ...movie,
      seo_index_tier: raw.index_tier,
      seo_quality_score: Number(raw.quality_score || 0),
      seo_freshness_score: Number(raw.freshness_score || 0),
      seo_checked_at: raw.checked_at,
      seo_latest_episode_number: Number(raw.latest_episode_number || 0),
      seo_declared_total_episodes: Number(raw.declared_total_episodes || 0),
      seo_episode_progress_percent: Number(raw.episode_progress_percent || 0),
    }];
  });
  const profileItems = (profileResult.data ?? []).flatMap((row) => {
    const movie = profileMovie(row as unknown as Record<string, unknown>);
    return movie ? [movie] : [];
  });
  const profilesBySlug = new Map(profileItems.map((movie) => [String(movie.slug), movie]));
  const enrichedQualityItems = qualityItems.map((movie) => profilesBySlug.get(String(movie.slug)) || movie);
  const manualItems = profileItems.filter((movie) => {
    const profile = movie.seo_profile as Record<string, unknown> | undefined;
    return profile?.index_mode === 'index' && Number(profile.validation_score || 0) >= 85 && isHighValueStaticMovie(movie);
  });
  const merged = new Map<string, Record<string, unknown>>();
  for (const movie of enrichedQualityItems) merged.set(String(movie.slug), movie);
  for (const movie of manualItems) merged.set(String(movie.slug), movie);
  const items = Array.from(merged.values());

  return json(req, {
    status: true,
    cohort: upcomingCohort ? 'upcoming' : 'playable',
    offset,
    limit,
    count: items.length,
    // Pagination follows the raw quality rows read, not the filtered output.
    // A page may contain fewer high-value movies while later pages still have
    // valid candidates.
    has_more: (data ?? []).length === limit,
    items,
  });
});
