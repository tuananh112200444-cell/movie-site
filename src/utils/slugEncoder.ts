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
export function movieDetailUrl(slug: string): string {
  return `/phim/${slug}`;
}