/**
 * Encode slug containing special characters (Japanese, Chinese, emojis, etc.)
 * for safe use in React Router URL paths.
 *
 * React Router's <Link to={`/phim/${slug}`}> breaks with non-ASCII chars
 * because it passes raw characters to pushState(). We encode them with
 * encodeURIComponent so the browser handles the URL correctly, while
 * preserving readability for SEO (modern browsers display decoded UTF-8).
 *
 * Usage:
 *   <Link to={`/phim/${encodeSlug(movie.slug)}`}>…</Link>
 */
export function encodeSlug(slug: string): string {
  if (!slug) return '';
  // Encode the slug so special characters become %XX sequences.
  // encodeURIComponent handles everything: CJK, emoji, symbols, spaces.
  return encodeURIComponent(slug);
}

/**
 * Build a full movie detail URL.
 * NOTE: React Router v6 tự động encode URL khi điều hướng,
 * nên KHÔNG dùng encodeSlug ở đây để tránh double encoding.
 */
export function movieDetailUrl(
  slug: string,
  preference?: { source?: string; quality?: string },
): string {
  const path = `/phim/${canonicalMovieSlug(slug)}`;
  const params = new URLSearchParams();
  if (preference?.source) params.set('source', preference.source);
  if (preference?.quality) params.set('quality', preference.quality);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
import movieCanonicalAliases from '../data/movieCanonicalAliases.json';

const MOVIE_CANONICAL_ALIASES = movieCanonicalAliases as Record<string, string>;
const MOVIE_SOURCE_SLUGS = Object.fromEntries(
  Object.entries(MOVIE_CANONICAL_ALIASES).map(([sourceSlug, canonicalSlug]) => [canonicalSlug, sourceSlug]),
) as Record<string, string>;

export function canonicalMovieSlug(slug: string): string {
  const clean = String(slug || '').trim();
  return MOVIE_CANONICAL_ALIASES[clean] || clean;
}

export function movieDetailSourceSlug(slug: string): string {
  const canonical = canonicalMovieSlug(slug);
  return MOVIE_SOURCE_SLUGS[canonical] || canonical;
}
