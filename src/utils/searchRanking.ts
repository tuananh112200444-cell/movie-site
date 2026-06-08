import type { MovieItem } from '../types/movie';
import { normalizeSearchText, tokenizeSearch, parseMovieYear } from '../utils/searchHelper';

export { parseMovieYear };
export type SearchSortMode = 'relevance' | 'newest' | 'year_desc' | 'year_asc' | 'name_asc';
/* Removed stray return statement that caused syntax errors */

export function getMovieModifiedTime(movie: MovieItem): number {
  const time = Date.parse(movie.modified?.time ?? '');
  return Number.isFinite(time) ? time : 0;
}
function movieTitleKeys(movie: MovieItem): string[] {
  const year = parseMovieYear(movie);
  const names = [
    movie.name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.origin_name,
    movie.slug?.replace(/-/g, ' '),
  ]
    .map(normalizeSearchText)
    .filter((value): value is string => value.length >= 3);

  const uniqueNames = Array.from(new Set(names));
  const keys: string[] = [];
  for (const name of uniqueNames) {
    if (year > 0) keys.push(`title-year:${name}:${year}`);
    else if (name.length >= 8) keys.push(`title:${name}`);
  }
  return keys;
}

function sourcePriority(movie: MovieItem): number {
  const source = `${movie.source_site ?? ''} ${movie.source_name ?? ''}`.toLowerCase();
  if (source.includes('admin') || source.includes('supabase')) return 4;
  if (movie.tmdb_id) return 3;
  if (!source.includes('ophim') && !source.includes('phimapi') && !source.includes('kkphim')) return 2;
  return 1;
}

function textScore(text: string, query: string, tokens: string[]): number {
  if (!text || !query) return 0;
  if (text === query) return 1200;
  if (text.startsWith(query)) return 900;
  if (text.includes(query)) return 650;

  let score = 0;
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (text.split(' ').some((part) => part === token)) score += 140;
    else if (text.includes(token)) score += 70;
  }
  return score;
}

export function getSearchScore(movie: MovieItem, keyword: string): number {
  const query = normalizeSearchText(keyword);
  if (!query) return 0;

  const tokens = tokenizeSearch(query);
  const name = normalizeSearchText(movie.name);
  const origin = normalizeSearchText(movie.origin_name);
  const titleVi = normalizeSearchText(movie.title_vi);
  const titleEn = normalizeSearchText(movie.title_en);
  const slug = normalizeSearchText(movie.slug);
  const year = parseMovieYear(movie);

  let score = 0;
  score += textScore(name, query, tokens) * 5;
  score += textScore(titleVi, query, tokens) * 4;
  score += textScore(origin, query, tokens) * 3;
  score += textScore(titleEn, query, tokens) * 3;
  score += textScore(slug, query, tokens);

  const queryYear = tokens.find((token) => /^(18|19|20)\d{2}$/.test(token));
  if (queryYear && Number(queryYear) === year) score += 500;

  if ((movie.episode_current ?? '').toLowerCase().trim() === 'trailer') score -= 350;
  if (movie.poster_url || movie.thumb_url) score += 15;
  if (movie.episode_current && movie.episode_current.toLowerCase().trim() !== 'trailer') score += 25;

  return score;
}

export function sortMoviesForSearch<T extends MovieItem>(
  movies: T[],
  keyword: string,
  mode: SearchSortMode = 'relevance',
): T[] {
  const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });
  const score = (movie: T) => getSearchScore(movie, keyword);
  const year = (movie: T) => parseMovieYear(movie);
  const modified = (movie: T) => getMovieModifiedTime(movie);

  return [...movies].sort((a, b) => {
    const ya = year(a);
    const yb = year(b);
    const sa = score(a);
    const sb = score(b);
    const ma = modified(a);
    const mb = modified(b);

    switch (mode) {
      case 'newest':
        return (mb - ma) || (yb - ya) || (sb - sa) || collator.compare(a.name, b.name);
      case 'year_desc':
        if (ya === 0 && yb !== 0) return 1;
        if (yb === 0 && ya !== 0) return -1;
        return (yb - ya) || (sb - sa) || (mb - ma) || collator.compare(a.name, b.name);
      case 'year_asc':
        if (ya === 0 && yb !== 0) return 1;
        if (yb === 0 && ya !== 0) return -1;
        return (ya - yb) || (sb - sa) || (mb - ma) || collator.compare(a.name, b.name);
      case 'name_asc':
        return collator.compare(a.name, b.name) || (sb - sa) || (yb - ya);
      case 'relevance':
      default:
        return (sb - sa) || (yb - ya) || (mb - ma) || collator.compare(a.name, b.name);
    }
  });
}

export function mergeMoviesUnique<T extends MovieItem>(movies: T[]): T[] {
  const result: T[] = [];
  const seen = new Map<string, number>();

  for (const movie of movies) {
    const keys = [
      movie.slug,
      movie._id,
      movie.ophim_id,
      movie.tmdb_id,
      ...movieTitleKeys(movie),
    ].filter(Boolean) as string[];

    const existingIndex = keys
      .map((key) => seen.get(key))
      .find((idx): idx is number => idx !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = result.length;
      result.push(movie);
      keys.forEach((key) => seen.set(key, nextIndex));
      continue;
    }

    const current = result[existingIndex];
    const preferred = sourcePriority(movie) > sourcePriority(current) ? movie : current;
    const fallback = preferred === movie ? current : movie;
    result[existingIndex] = {
      ...fallback,
      ...preferred,
      episode_current: preferred.episode_current || fallback.episode_current,
      poster_url: preferred.poster_url || fallback.poster_url,
      thumb_url: preferred.thumb_url || fallback.thumb_url,
      category: preferred.category?.length ? preferred.category : fallback.category,
      country: preferred.country?.length ? preferred.country : fallback.country,
      modified: getMovieModifiedTime(preferred) >= getMovieModifiedTime(fallback)
        ? preferred.modified
        : fallback.modified,
    };
    keys.forEach((key) => seen.set(key, existingIndex));
    movieTitleKeys(result[existingIndex]).forEach((key) => seen.set(key, existingIndex));
  }


  return result;
}