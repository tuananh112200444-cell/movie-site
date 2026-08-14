export interface ProviderEpisodeLike {
  name?: string;
  slug?: string;
  [key: string]: unknown;
}

export interface ProviderEpisodeServerLike {
  server_name?: string;
  server_data?: ProviderEpisodeLike[];
  [key: string]: unknown;
}

export interface SeasonNumberingNormalization {
  season: number;
  rawStart: number;
  rawEnd: number;
  offset: number;
  canonicalTotal: number;
}

function normalizedText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function episodeNumber(value: ProviderEpisodeLike): number {
  const text = `${String(value.name || '')} ${String(value.slug || '')}`.toLowerCase();
  if (/\bfull\b/.test(text)) return 1;
  const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slash) return Number(slash[1] || 0) || 0;
  const numbers = [...text.matchAll(/(\d{1,4})/g)]
    .map((match) => Number(match[1]))
    .filter((number) => Number.isFinite(number) && number > 0);
  return numbers.length ? Math.max(...numbers) : 0;
}

function advertisedTotal(movie: Record<string, unknown>): number {
  const values = [movie.episode_total, movie.episode_current];
  let total = 0;
  for (const value of values) {
    const text = String(value || '');
    const slash = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
    total = Math.max(total, Number(slash?.[2] || text.match(/\d{1,4}/)?.[0] || 0) || 0);
  }
  return total;
}

function explicitSeason(movie: Record<string, unknown>): number {
  const tmdb = movie.tmdb && typeof movie.tmdb === 'object'
    ? movie.tmdb as Record<string, unknown>
    : null;
  const tmdbSeason = Number(tmdb?.season || 0);
  if (!Number.isInteger(tmdbSeason) || tmdbSeason < 2) return 0;

  const title = normalizedText(`${movie.name || ''} ${movie.origin_name || ''}`);
  const titleSeason = Number(
    title.match(/\b(?:season|part|phan|mua)\s*0*(\d{1,2})\b/)?.[1]
      || title.match(/\b0*(\d{1,2})\s*(?:season|part|phan|mua)\b/)?.[1]
      || 0,
  );
  return titleSeason === tmdbSeason ? tmdbSeason : 0;
}

function canonicalEpisodeLabel(number: number): { name: string; slug: string } {
  const padded = String(number).padStart(2, '0');
  return { name: `Tập ${padded}`, slug: `tap-${padded}` };
}

/**
 * Some providers number a season with the series-wide ordinal (36..52) while
 * the catalogue URL represents one explicit TMDB season.  Normalize only when
 * every independent signal agrees: explicit season >= 2, provider total equals
 * the raw last episode, the raw range starts above one, and the range is fully
 * contiguous.  Ambiguous or incomplete ranges are returned unchanged.
 */
export function normalizeVerifiedSeasonNumbering(
  movie: Record<string, unknown>,
  servers: ProviderEpisodeServerLike[],
): {
  movie: Record<string, unknown>;
  episodes: ProviderEpisodeServerLike[];
  normalization: SeasonNumberingNormalization | null;
} {
  const season = explicitSeason(movie);
  if (!season) return { movie, episodes: servers, normalization: null };

  const numbers = Array.from(new Set(
    servers.flatMap((server) => (server.server_data || []).map(episodeNumber)).filter((number) => number > 0),
  )).sort((a, b) => a - b);
  if (numbers.length < 2) return { movie, episodes: servers, normalization: null };

  const rawStart = numbers[0];
  const rawEnd = numbers[numbers.length - 1];
  const isContiguous = numbers.every((number, index) => number === rawStart + index);
  if (rawStart <= 1 || !isContiguous || advertisedTotal(movie) !== rawEnd) {
    return { movie, episodes: servers, normalization: null };
  }

  const offset = rawStart - 1;
  const canonicalTotal = rawEnd - offset;
  // Overlapping raw/canonical ranges cannot be rewritten atomically without
  // deciding which existing row wins. Leave that ambiguous case untouched.
  if (rawStart <= canonicalTotal) {
    return { movie, episodes: servers, normalization: null };
  }
  const episodes = servers.map((server) => ({
    ...server,
    server_data: (server.server_data || []).map((episode) => {
      const rawNumber = episodeNumber(episode);
      if (rawNumber < rawStart || rawNumber > rawEnd) return episode;
      const canonicalNumber = rawNumber - offset;
      const label = canonicalEpisodeLabel(canonicalNumber);
      return { ...episode, name: label.name, slug: label.slug };
    }),
  }));
  const completed = /hoan\s*(?:tat|thanh)|completed|complete/.test(normalizedText(movie.episode_current));
  const normalizedMovie = {
    ...movie,
    episode_current: completed ? `Hoàn Tất (${canonicalTotal}/${canonicalTotal})` : `Tập ${canonicalTotal}`,
    episode_total: String(canonicalTotal),
  };

  return {
    movie: normalizedMovie,
    episodes,
    normalization: { season, rawStart, rawEnd, offset, canonicalTotal },
  };
}
