const TMDB_BASE = 'https://api.themoviedb.org/3';

type TmdbSearchResult = {
  id?: number;
  media_type?: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
};

type TmdbDetail = TmdbSearchResult;

export type LocalizedMovieTitles = {
  titleEn: string;
  titleOriginal: string;
  tmdbId?: number;
};

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown): string {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sameTitle(left: unknown, right: unknown): boolean {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aWords = new Set(a.split(' ').filter((word) => word.length > 1));
  const bWords = new Set(b.split(' ').filter((word) => word.length > 1));
  const overlap = [...aWords].filter((word) => bWords.has(word)).length;
  return overlap >= 2 && overlap / Math.max(aWords.size, bWords.size) >= 0.82;
}

function resultYear(result: TmdbSearchResult): number {
  const value = text(result.release_date || result.first_air_date);
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : 0;
}

function safeYearMatch(sourceYear: number, result: TmdbSearchResult): boolean {
  if (!sourceYear) return true;
  const candidateYear = resultYear(result);
  return !candidateYear || Math.abs(candidateYear - sourceYear) <= 1;
}

async function tmdbJson(path: string, token: string): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    const response = await fetch(`${TMDB_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) return null;
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sourceHasInternationalTitle(titleVi: string, sourceOriginal: string): boolean {
  return Boolean(text(sourceOriginal)) && !sameTitle(titleVi, sourceOriginal);
}

/**
 * Keeps source-provided international titles, and only asks TMDB when BL/GL
 * supplies a Vietnamese title alone. A title-year check prevents a popular
 * but unrelated TMDB search result from corrupting search aliases.
 */
export async function resolveLocalizedMovieTitles(input: {
  titleVi: string;
  sourceOriginal?: string;
  year?: number;
  tmdbToken?: string;
}): Promise<LocalizedMovieTitles> {
  const titleVi = text(input.titleVi);
  const sourceOriginal = text(input.sourceOriginal);
  if (!titleVi) return { titleEn: '', titleOriginal: '' };

  if (sourceHasInternationalTitle(titleVi, sourceOriginal)) {
    return { titleEn: sourceOriginal, titleOriginal: sourceOriginal };
  }

  const token = text(input.tmdbToken);
  if (!token) return { titleEn: '', titleOriginal: sourceOriginal };
  const query = new URLSearchParams({
    query: titleVi,
    language: 'vi-VN',
    include_adult: 'false',
  });
  const search = await tmdbJson(`/search/multi?${query}`, token);
  const candidates = Array.isArray(search?.results) ? search.results as TmdbSearchResult[] : [];
  const matched = candidates.find((candidate) => {
    if (!candidate?.id || !['movie', 'tv'].includes(String(candidate.media_type))) return false;
    const localized = candidate.title || candidate.name || '';
    const original = candidate.original_title || candidate.original_name || '';
    return safeYearMatch(Number(input.year || 0), candidate)
      && (sameTitle(titleVi, localized) || sameTitle(sourceOriginal, original));
  });
  if (!matched?.id || !matched.media_type) return { titleEn: '', titleOriginal: sourceOriginal };

  const english = await tmdbJson(`/${matched.media_type}/${matched.id}?language=en-US`, token) as TmdbDetail | null;
  const englishTitle = text(english?.title || english?.name || matched.title || matched.name);
  const originalTitle = text(english?.original_title || english?.original_name || matched.original_title || matched.original_name);
  if (!englishTitle || sameTitle(titleVi, englishTitle)) {
    return { titleEn: '', titleOriginal: originalTitle || sourceOriginal, tmdbId: matched.id };
  }
  return { titleEn: englishTitle, titleOriginal: originalTitle || englishTitle, tmdbId: matched.id };
}
