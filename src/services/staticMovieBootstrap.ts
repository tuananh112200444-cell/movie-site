import type { MovieDetailResponse } from '@/types/movie';
import type { PublishedSeoProfile } from '@/services/seoStudioService';
import { canonicalMovieSlug, movieDetailSourceSlug } from '@/utils/slugEncoder';

export interface StaticMovieBootstrapPayload {
  version: 'v1';
  canonical_slug: string;
  source_slug: string;
  indexable: boolean;
  generated_at: string;
  detail: MovieDetailResponse;
  seo_profile?: PublishedSeoProfile | null;
}

const STATIC_BOOTSTRAP_SCRIPT_ID = 'kp-static-movie-data';

function isBootstrapPayload(value: unknown, expectedSlug: string): value is StaticMovieBootstrapPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<StaticMovieBootstrapPayload>;
  const detail = payload.detail as MovieDetailResponse | undefined;
  return payload.version === 'v1'
    && canonicalMovieSlug(String(payload.canonical_slug || '')) === canonicalMovieSlug(expectedSlug)
    && Boolean(detail?.movie?.name && detail?.movie?.slug)
    && Array.isArray(detail?.episodes);
}

export function readEmbeddedStaticMovieBootstrap(slug: string): StaticMovieBootstrapPayload | null {
  if (typeof document === 'undefined' || !slug) return null;
  const script = document.getElementById(STATIC_BOOTSTRAP_SCRIPT_ID);
  if (!(script instanceof HTMLScriptElement) || !script.textContent) return null;
  try {
    const payload = JSON.parse(script.textContent) as unknown;
    return isBootstrapPayload(payload, slug) ? payload : null;
  } catch {
    return null;
  }
}

export async function fetchStaticMovieBootstrap(
  slug: string,
  signal?: AbortSignal,
): Promise<StaticMovieBootstrapPayload | null> {
  if (typeof window === 'undefined' || !slug) return null;
  const canonicalSlug = canonicalMovieSlug(slug);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`/movie-data/${encodeURIComponent(canonicalSlug)}.json`, {
      headers: { Accept: 'application/json' },
      cache: 'default',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    return isBootstrapPayload(payload, canonicalSlug) ? payload : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function normalizeDetailForCanonicalRoute(
  detail: MovieDetailResponse,
  canonicalSlug: string,
  staticDetail?: MovieDetailResponse | null,
): MovieDetailResponse {
  const canonical = canonicalMovieSlug(canonicalSlug);
  const staticMovie = staticDetail?.movie;
  return {
    ...detail,
    movie: {
      ...staticMovie,
      ...detail.movie,
      slug: canonical,
      content: staticMovie?.content || detail.movie.content,
      name: staticMovie?.name || detail.movie.name,
      origin_name: staticMovie?.origin_name || detail.movie.origin_name,
    },
  };
}

export function staticMovieSourceSlug(payload: StaticMovieBootstrapPayload | null, routeSlug: string): string {
  return String(payload?.source_slug || movieDetailSourceSlug(routeSlug)).trim();
}
