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
    movie.title_original,
    movie.normalized_name?.replace(/-/g, ' '),
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

function appendSeasonScope(key: string, seasonSignature: string): string {
  return seasonSignature ? `${key}:season:${seasonSignature}` : key;
}

function getMovieSeasonSignature(movie: MovieItem): string {
  const text = normalizeSearchText([
    movie.name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.title_original,
    movie.normalized_name?.replace(/-/g, ' '),
    movie.origin_name,
    movie.slug?.replace(/-/g, ' '),
  ].filter(Boolean).join(' '));

  const patterns = [
    /\b(?:season|ss|phan|mua|part)\s*(\d{1,2})\b/,
    /\b(\d{1,2})\s*(?:season|ss|phan|mua|part)\b/,
    /\bs(\d{1,2})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return String(Number(match[1]));
  }

  return '';
}

function canonicalDuplicateTitle(value?: string | null): string {
  return normalizeSearchText(value)
    .replace(/\b(18|19|20)\d{2}\b/g, ' ')
    .replace(/\b(tap|ep|episode|phan|season|trailer|vietsub|thuyet minh|long tieng|full|hd|fhd|4k)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTitle(value: string): string {
  return value.replace(/\s+/g, '');
}

function movieLooseTitleKeys(movie: MovieItem): string[] {
  const year = parseMovieYear(movie);
  const source = `${movie.source_site ?? ''} ${movie.source_name ?? ''}`.toLowerCase();
  const names = [
    movie.name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.title_original,
    movie.normalized_name?.replace(/-/g, ' '),
    movie.origin_name,
  ]
    .map(canonicalDuplicateTitle)
    .filter((value): value is string => value.length >= 6);

  const keys: string[] = [];
  for (const name of Array.from(new Set(names))) {
    const compact = compactTitle(name);
    if (compact.length < 8) continue;
    if (year > 0) keys.push(`loose-title-year:${compact}:${year}`);
    if (
      compact.length >= 12 &&
      (source.includes('admin') || source.includes('supabase') || source.includes('blvietsub') || source.includes('ophim'))
    ) {
      keys.push(`loose-title:${compact}`);
    }
  }
  return keys;
}

function getEpisodeNumber(value?: string | number): number {
  if (value === undefined || value === null) return 0;
  const text = String(value);
  const matches = Array.from(text.matchAll(/\d+/g)).map((match) => Number(match[0])).filter(Number.isFinite);
  return matches.length ? Math.max(...matches) : 0;
}

function getMovieEpisodeNumber(movie: MovieItem): number {
  const candidates = [
    getEpisodeNumber(movie.current_episode),
    getEpisodeNumber(movie.episode_current),
  ].filter((value) => value > 0);
  const declaredTotal = Math.max(
    getEpisodeNumber(movie.total_episodes),
    getEpisodeNumber(movie.episode_total),
  );
  const credible = declaredTotal > 0
    ? candidates.filter((value) => value <= declaredTotal)
    : candidates;
  return credible.length ? Math.max(...credible) : 0;
}

function isPendingEpisodeLabel(value?: string | null): boolean {
  const text = normalizeSearchText(value);
  return !text || ['trailer', 'sap chieu', 'dang cap nhat', 'coming soon', 'updating'].includes(text);
}

function hasPlayableMarker(movie: MovieItem): boolean {
  if (getMovieEpisodeNumber(movie) > 0) return true;
  return Boolean(movie.episode_current && !isPendingEpisodeLabel(movie.episode_current));
}

function sourcePriority(movie: MovieItem): number {
  const source = `${movie.source_site ?? ''} ${movie.source_name ?? ''}`.toLowerCase();
  if (source.includes('tmdb-catalog')) return hasPlayableMarker(movie) ? 1 : -2;
  if (source.includes('admin') || source.includes('supabase')) return 4;
  if (movie.tmdb_id && hasPlayableMarker(movie)) return 3;
  if (!source.includes('ophim') && !source.includes('phimapi') && !source.includes('kkphim')) return 2;
  return 1;
}

function getMergedEpisodeText(preferred: MovieItem, fallback: MovieItem): string {
  const preferredEp = getMovieEpisodeNumber(preferred);
  const fallbackEp = getMovieEpisodeNumber(fallback);
  const declaredTotal = Math.max(
    getEpisodeNumber(preferred.total_episodes),
    getEpisodeNumber(preferred.episode_total),
    getEpisodeNumber(fallback.total_episodes),
    getEpisodeNumber(fallback.episode_total),
  );
  const candidates = [preferredEp, fallbackEp].filter((value) => value > 0);
  const credible = declaredTotal > 0
    ? candidates.filter((value) => value <= declaredTotal)
    : candidates;
  const maxEp = credible.length ? Math.max(...credible) : 0;
  if (!maxEp) return preferred.episode_current || fallback.episode_current || '';
  return preferredEp === maxEp && preferred.episode_current ? preferred.episode_current : `Tập ${maxEp}`;
}

function movieCompleteness(movie: MovieItem): number {
  return [
    movie.poster_url,
    movie.thumb_url,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.content,
    movie.episode_current,
    movie.current_episode,
    movie.total_episodes,
    movie.release_at,
    movie.next_episode_at,
    movie.schedule_type,
    movie.category?.length,
    movie.country?.length,
    movie.tmdb_id,
    movie.ophim_id,
  ].reduce<number>((score, value) => score + (value ? 1 : 0), 0);
}

function choosePreferredMovie<T extends MovieItem>(a: T, b: T): T {
  const playableDiff = Number(hasPlayableMarker(a)) - Number(hasPlayableMarker(b));
  if (playableDiff !== 0) return playableDiff > 0 ? a : b;
  const priorityDiff = sourcePriority(a) - sourcePriority(b);
  if (priorityDiff !== 0) return priorityDiff > 0 ? a : b;
  const completenessDiff = movieCompleteness(a) - movieCompleteness(b);
  if (completenessDiff !== 0) return completenessDiff > 0 ? a : b;
  return getMovieModifiedTime(a) >= getMovieModifiedTime(b) ? a : b;
}

function textScore(text: string, query: string, tokens: string[]): number {
  if (!text || !query) return 0;
  if (text === query) return 1200;
  if (text.startsWith(query)) return 900;
  if (text.includes(query)) return 650;

  let score = 0;
  const parts = text.split(' ').filter(Boolean);
  const compactText = text.replace(/\s+/g, '');
  const compactQuery = query.replace(/\s+/g, '');
  if (compactQuery.length >= 6 && compactText.includes(compactQuery)) score += 520;

  let matchedTokens = 0;
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (parts.some((part) => part === token)) {
      score += 140;
      matchedTokens++;
    } else if (text.includes(token)) {
      score += 70;
      matchedTokens++;
    }
  }

  const meaningfulTokens = tokens.filter((token) => token.length >= 2);
  if (meaningfulTokens.length > 0) {
    const coverage = matchedTokens / meaningfulTokens.length;
    if (coverage === 1) score += meaningfulTokens.length >= 3 ? 420 : 180;
    else if (coverage >= 0.75) score += 180;
  }
  return score;
}

function editDistanceWithin(a: string, b: string, maxDistance: number): boolean {
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let left = i;
    let best = left;
    let prevDiagonal = i - 1;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j] + 1;
      const replace = prevDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1);
      prevDiagonal = prev[j];
      const value = Math.min(above, left + 1, replace);
      prev[j] = value;
      left = value;
      best = Math.min(best, value);
    }
    if (best > maxDistance) return false;
  }
  return prev[b.length] <= maxDistance;
}

function fuzzyTokenScore(text: string, tokens: string[]): number {
  if (!text || tokens.length === 0) return 0;
  const parts = text.split(' ').filter((part) => part.length >= 2);
  if (parts.length === 0) return 0;

  let score = 0;
  let matched = 0;
  for (const token of tokens.filter((item) => item.length >= 2)) {
    const isMatched = parts.some((part) => {
      if (part === token || part.startsWith(token) || token.startsWith(part)) return true;
      const maxDistance = token.length <= 3 ? 1 : token.length >= 5 ? 1 : 0;
      return maxDistance > 0 && editDistanceWithin(token, part, maxDistance);
    });
    if (isMatched) {
      matched += 1;
      score += token.length <= 3 ? 90 : 130;
    }
  }

  if (matched > 0 && matched === tokens.filter((item) => item.length >= 2).length) score += 420;
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
  const titleOriginal = normalizeSearchText(movie.title_original);
  const normalizedName = normalizeSearchText(movie.normalized_name?.replace(/-/g, ' '));
  const slug = normalizeSearchText(movie.slug);
  const episodeCurrent = normalizeSearchText(movie.episode_current);
  const episodeTotal = normalizeSearchText(movie.episode_total);
  const year = parseMovieYear(movie);

  let score = 0;
  score += textScore(name, query, tokens) * 5;
  score += textScore(titleVi, query, tokens) * 4;
  score += textScore(origin, query, tokens) * 3;
  score += textScore(titleEn, query, tokens) * 3;
  score += textScore(titleOriginal, query, tokens) * 3;
  score += textScore(normalizedName, query, tokens) * 3;
  score += textScore(slug, query, tokens);
  score += fuzzyTokenScore(name, tokens) * 5;
  score += fuzzyTokenScore(titleVi, tokens) * 4;
  score += fuzzyTokenScore(origin, tokens) * 3;
  score += fuzzyTokenScore(titleEn, tokens) * 3;
  score += fuzzyTokenScore(titleOriginal, tokens) * 3;
  score += fuzzyTokenScore(normalizedName, tokens) * 3;
  score += fuzzyTokenScore(slug, tokens);
  score += textScore(episodeCurrent, query, tokens);
  score += textScore(episodeTotal, query, tokens);

  const queryYear = tokens.find((token) => /^(18|19|20)\d{2}$/.test(token));
  if (queryYear && Number(queryYear) === year) score += 500;
  const querySeason = query.match(/\b(?:season|ss|phan|mua|part)\s*(\d{1,2})\b/)?.[1]
    ?? query.match(/\b(\d{1,2})\s*(?:season|ss|phan|mua|part)\b/)?.[1]
    ?? query.match(/\bs(\d{1,2})\b/)?.[1]
    ?? '';
  const movieSeason = getMovieSeasonSignature(movie);
  if (querySeason && movieSeason && Number(querySeason) === Number(movieSeason)) score += 450;
  if (querySeason && movieSeason && Number(querySeason) !== Number(movieSeason)) score -= 300;

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
    const seasonSignature = getMovieSeasonSignature(movie);
    const keys = [
      movie.slug ? `slug:${normalizeSearchText(movie.slug)}` : '',
      movie._id ? `id:${String(movie._id).trim().toLowerCase()}` : '',
      movie.ophim_id ? `ophim:${String(movie.ophim_id).trim().toLowerCase()}` : '',
      movie.tmdb_id ? appendSeasonScope(`tmdb:${String(movie.tmdb_id).trim().toLowerCase()}`, seasonSignature) : '',
      ...movieTitleKeys(movie).map((key) => appendSeasonScope(key, seasonSignature)),
      ...movieLooseTitleKeys(movie).map((key) => appendSeasonScope(key, seasonSignature)),
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
    const preferred = choosePreferredMovie(movie, current);
    const fallback = preferred === movie ? current : movie;
    result[existingIndex] = {
      ...fallback,
      ...preferred,
      episode_current: getMergedEpisodeText(preferred, fallback),
      current_episode: Math.max(getMovieEpisodeNumber(preferred), getMovieEpisodeNumber(fallback)) || preferred.current_episode || fallback.current_episode,
      poster_url: preferred.poster_url || fallback.poster_url,
      thumb_url: preferred.thumb_url || fallback.thumb_url,
      category: preferred.category?.length ? preferred.category : fallback.category,
      country: preferred.country?.length ? preferred.country : fallback.country,
      modified: getMovieModifiedTime(preferred) >= getMovieModifiedTime(fallback)
        ? preferred.modified
        : fallback.modified,
    };
    keys.forEach((key) => seen.set(key, existingIndex));
    const mergedSeasonSignature = getMovieSeasonSignature(result[existingIndex]);
    movieTitleKeys(result[existingIndex]).forEach((key) => seen.set(appendSeasonScope(key, mergedSeasonSignature), existingIndex));
    movieLooseTitleKeys(result[existingIndex]).forEach((key) => seen.set(appendSeasonScope(key, mergedSeasonSignature), existingIndex));
  }


  return result;
}
