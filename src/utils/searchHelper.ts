import type { MovieItem } from '../types/movie';

export function normalizeSearchText(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSearch(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function parseMovieYear(movie: MovieItem): number {
  if (typeof movie.year === 'number' && Number.isFinite(movie.year)) {
    return movie.year;
  }
  if (typeof movie.year === 'string') {
    const parsed = Number.parseInt(movie.year, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}