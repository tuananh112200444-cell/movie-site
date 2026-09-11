import type { MovieItem } from '../types/movie';

export function normalizeSearchText(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
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

const SEARCH_NOISE_WORDS = new Set([
  'phim', 'xem', 'online', 'vietsub', 'thuyet', 'minh', 'long', 'tieng',
  'hd', 'fhd', 'full',
]);

function isOneEditAway(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  if (left.length === right.length) {
    const mismatches: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) mismatches.push(index);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length <= 1) return true;
    const [first, second] = mismatches;
    return second === first + 1
      && left[first] === right[second]
      && left[second] === right[first];
  }

  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }
  return true;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function tokenMatchQuality(token: string, word: string, queryTokenCount: number): number {
  if (token === word) return 3;
  if (token.length >= 3 && word.startsWith(token)) return 2;
  if (token.length >= 4 && word.length >= 4 && isOneEditAway(token, word)) return 1;
  return queryTokenCount >= 2
    && token.length >= 2
    && word.length >= token.length
    && word.length - token.length <= 1
    && isSubsequence(token, word)
    ? 1
    : 0;
}

export function matchesNormalizedSearchText(searchText: string, keyword: string): boolean {
  const query = normalizeSearchText(keyword);
  const haystack = normalizeSearchText(searchText);
  if (!query || !haystack) return false;
  if (` ${haystack} `.includes(` ${query} `)) return true;

  const compactQuery = query.replace(/\s+/g, '');
  if (compactQuery.length >= 6 && haystack.replace(/\s+/g, '').includes(compactQuery)) return true;

  const rawTokens = tokenizeSearch(query).filter((token) => token.length >= 2 || /^\d+$/.test(token));
  const tokens = rawTokens.filter((token) => !SEARCH_NOISE_WORDS.has(token));
  if (tokens.length === 0) return false;
  const words = Array.from(new Set(tokenizeSearch(haystack)));
  const qualities = tokens.map((token) => Math.max(...words.map((word) => tokenMatchQuality(token, word, tokens.length))));
  return qualities.every((quality) => quality > 0)
    && qualities.filter((quality) => quality === 1).length <= 1;
}

export function getMovieSearchText(movie: MovieItem): string {
  return normalizeSearchText([
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.title_original,
    movie.normalized_name,
    movie.slug?.replace(/-/g, ' '),
    movie.year,
    movie.type,
    movie.category?.map((item) => `${item.name} ${item.slug}`).join(' '),
    movie.country?.map((item) => `${item.name} ${item.slug}`).join(' '),
  ].filter(Boolean).join(' '));
}

export function movieMatchesSearchIntent(movie: MovieItem, keyword: string): boolean {
  return matchesNormalizedSearchText(getMovieSearchText(movie), keyword);
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
