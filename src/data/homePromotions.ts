import type { MovieItem } from '../types/movie';

// Keep the cinema feed in its provider order. No title is promoted above it.
export const PINNED_CINEMA_MOVIES = [] satisfies MovieItem[];

export function pinCinemaPromotions(movies: MovieItem[], limit?: number): MovieItem[] {
  const pinnedSlugs = new Set(PINNED_CINEMA_MOVIES.map((movie) => movie.slug));
  const promoted = [
    ...PINNED_CINEMA_MOVIES,
    ...movies.filter((movie) => !pinnedSlugs.has(movie.slug)),
  ];
  return typeof limit === 'number' ? promoted.slice(0, limit) : promoted;
}
