export type TaxonomyItem = { id: string; name: string; slug: string };

export type MovieFactPatch = {
  actor?: string[];
  director?: string[];
  category?: TaxonomyItem[];
  country?: TaxonomyItem[];
  content?: string;
  poster_url?: string;
  thumb_url?: string;
  trailer_url?: string;
  tmdb_id?: number;
  tmdb_media_type?: 'movie' | 'tv';
};

export type TmdbFactDetail = {
  id?: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id?: number; name?: string }>;
  production_countries?: Array<{ iso_3166_1?: string; name?: string }>;
  origin_country?: string[];
  created_by?: Array<{ name?: string }>;
  credits?: {
    cast?: Array<{ name?: string }>;
    crew?: Array<{ name?: string; job?: string; department?: string }>;
  };
  videos?: { results?: Array<{ site?: string; type?: string; official?: boolean; key?: string }> };
};

function text(value: unknown): string {
  return String(value ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function identityKey(value: unknown): string {
  return text(value).toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(value: unknown): string {
  return identityKey(value).replace(/\s+/g, '-');
}

function stringList(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const item = text(entry).slice(0, 140);
    const key = identityKey(item);
    if (!item || !key || seen.has(key)) return [];
    seen.add(key);
    return [item];
  }).slice(0, max);
}

function taxonomy(value: unknown, max = 12): TaxonomyItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const name = text(row.name).slice(0, 100);
    const slug = slugify(row.slug || name);
    if (!name || !slug || seen.has(slug)) return [];
    seen.add(slug);
    return [{ id: text(row.id).slice(0, 80), name, slug }];
  }).slice(0, max);
}

function hasList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function yearFromDetail(detail: TmdbFactDetail): number {
  return Number(String(detail.release_date || detail.first_air_date || '').slice(0, 4)) || 0;
}

function movieTitleKeys(movie: Record<string, unknown>): Set<string> {
  return new Set([movie.name, movie.origin_name, movie.title_vi, movie.title_en, movie.title_original]
    .map(identityKey).filter(Boolean));
}

function detailTitleKeys(detail: TmdbFactDetail): Set<string> {
  return new Set([detail.title, detail.name, detail.original_title, detail.original_name]
    .map(identityKey).filter(Boolean));
}

export function tmdbIdentityMatches(movie: Record<string, unknown>, detail: TmdbFactDetail): boolean {
  const expectedId = Number(movie.tmdb_id || 0);
  if (expectedId && Number(detail.id || 0) !== expectedId) return false;
  const movieYear = Number(movie.year || 0);
  const detailYear = yearFromDetail(detail);
  if (movieYear && detailYear && movieYear !== detailYear) return false;
  const expectedTitles = movieTitleKeys(movie);
  return [...detailTitleKeys(detail)].some((key) => expectedTitles.has(key));
}

function tmdbImage(path: unknown, size = 'w780'): string {
  const value = text(path);
  return value.startsWith('/') ? `https://image.tmdb.org/t/p/${size}${value}` : '';
}

function youtubeTrailer(detail: TmdbFactDetail): string {
  const videos = detail.videos?.results || [];
  const selected = videos.find((item) => item.site === 'YouTube' && item.type === 'Trailer' && item.official)
    || videos.find((item) => item.site === 'YouTube' && item.type === 'Trailer');
  return selected?.key ? `https://www.youtube.com/watch?v=${selected.key}` : '';
}

export function patchFromVerifiedTmdb(movie: Record<string, unknown>, detail: TmdbFactDetail, mediaType: 'movie' | 'tv'): MovieFactPatch {
  if (!tmdbIdentityMatches(movie, detail)) return {};
  const patch: MovieFactPatch = {};
  const actors = stringList((detail.credits?.cast || []).map((item) => item.name), 16);
  const directors = stringList([
    ...(mediaType === 'tv' ? (detail.created_by || []).map((item) => item.name) : []),
    ...(detail.credits?.crew || []).filter((item) => item.job === 'Director').map((item) => item.name),
  ], 8);
  const categories = taxonomy((detail.genres || []).map((item) => ({ id: item.id, name: item.name, slug: slugify(item.name) })));
  const countrySource = (detail.production_countries || [])
    .map((item) => ({ id: item.iso_3166_1, name: item.name, slug: slugify(item.name) }));
  const countries = taxonomy(countrySource, 4);
  const overview = text(detail.overview);
  const poster = tmdbImage(detail.poster_path, 'w500');
  const backdrop = tmdbImage(detail.backdrop_path, 'w780');
  const trailer = youtubeTrailer(detail);
  if (!hasList(movie.actor) && actors.length) patch.actor = actors;
  if (!hasList(movie.director) && directors.length) patch.director = directors;
  if (!hasList(movie.category) && categories.length) patch.category = categories;
  if (!hasList(movie.country) && countries.length) patch.country = countries;
  if (text(movie.content).length < 300 && overview.length >= 300) patch.content = overview;
  if (!text(movie.thumb_url) && poster) patch.thumb_url = poster;
  if (!text(movie.poster_url) && (backdrop || poster)) patch.poster_url = backdrop || poster;
  if (!text(movie.trailer_url) && trailer) patch.trailer_url = trailer;
  if (!Number(movie.tmdb_id || 0) && Number(detail.id || 0)) patch.tmdb_id = Number(detail.id);
  if (!text(movie.tmdb_media_type)) patch.tmdb_media_type = mediaType;
  return patch;
}

function consensusStrings(rows: Array<Record<string, unknown>>, field: string, minimumSources = 2): string[] {
  const occurrences = new Map<string, { value: string; sources: Set<string> }>();
  for (const row of rows) {
    const source = text(row.source_site || row.source_name || row.id);
    for (const value of stringList(row[field], 30)) {
      const key = identityKey(value);
      const current = occurrences.get(key) || { value, sources: new Set<string>() };
      current.sources.add(source);
      occurrences.set(key, current);
    }
  }
  return [...occurrences.values()].filter((item) => item.sources.size >= minimumSources).map((item) => item.value).slice(0, 16);
}

function consensusTaxonomy(rows: Array<Record<string, unknown>>, field: string, minimumSources = 2): TaxonomyItem[] {
  const occurrences = new Map<string, { value: TaxonomyItem; sources: Set<string> }>();
  for (const row of rows) {
    const source = text(row.source_site || row.source_name || row.id);
    for (const value of taxonomy(row[field])) {
      const current = occurrences.get(value.slug) || { value, sources: new Set<string>() };
      current.sources.add(source);
      occurrences.set(value.slug, current);
    }
  }
  return [...occurrences.values()].filter((item) => item.sources.size >= minimumSources).map((item) => item.value).slice(0, 12);
}

export function patchFromDatabaseConsensus(movie: Record<string, unknown>, candidates: Array<Record<string, unknown>>): MovieFactPatch {
  const targetTitles = movieTitleKeys(movie);
  const targetYear = Number(movie.year || 0);
  const verified = candidates.filter((candidate) => {
    if (targetYear && Number(candidate.year || 0) !== targetYear) return false;
    const candidateTitles = movieTitleKeys(candidate);
    const sharedTitles = [...candidateTitles].filter((key) => targetTitles.has(key));
    return sharedTitles.length >= 2;
  });
  if (new Set(verified.map((row) => text(row.source_site || row.source_name || row.id))).size < 2) return {};
  const patch: MovieFactPatch = {};
  const actors = consensusStrings(verified, 'actor');
  const directors = consensusStrings(verified, 'director');
  const categories = consensusTaxonomy(verified, 'category');
  const countries = consensusTaxonomy(verified, 'country');
  if (!hasList(movie.actor) && actors.length) patch.actor = actors;
  if (!hasList(movie.director) && directors.length) patch.director = directors;
  if (!hasList(movie.category) && categories.length) patch.category = categories;
  if (!hasList(movie.country) && countries.length) patch.country = countries;
  return patch;
}

export function patchFromVerifiedDatabaseCandidate(movie: Record<string, unknown>, candidates: Array<Record<string, unknown>>): MovieFactPatch {
  const targetTitles = movieTitleKeys(movie);
  const targetYear = Number(movie.year || 0);
  const verified = candidates.filter((candidate) => {
    if (candidate.tmdb_verified !== true) return false;
    if (targetYear && Number(candidate.year || 0) !== targetYear) return false;
    const sharedTitles = [...movieTitleKeys(candidate)].filter((key) => targetTitles.has(key));
    return sharedTitles.length >= 2;
  });
  if (verified.length !== 1) return {};
  const candidate = verified[0];
  const patch: MovieFactPatch = {};
  const actors = stringList(candidate.actor, 16);
  const directors = stringList(candidate.director, 8);
  const categories = taxonomy(candidate.category);
  const countries = taxonomy(candidate.country, 4);
  const overview = text(candidate.content);
  if (!hasList(movie.actor) && actors.length) patch.actor = actors;
  if (!hasList(movie.director) && directors.length) patch.director = directors;
  if (!hasList(movie.category) && categories.length) patch.category = categories;
  if (!hasList(movie.country) && countries.length) patch.country = countries;
  if (text(movie.content).length < 300 && overview.length >= 300) patch.content = overview;
  if (!text(movie.thumb_url) && text(candidate.thumb_url)) patch.thumb_url = text(candidate.thumb_url);
  if (!text(movie.poster_url) && text(candidate.poster_url)) patch.poster_url = text(candidate.poster_url);
  if (!text(movie.trailer_url) && text(candidate.trailer_url)) patch.trailer_url = text(candidate.trailer_url);
  return patch;
}

export function missingMovieFactFields(movie: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!hasList(movie.actor)) missing.push('movie_patch.actor');
  if (!hasList(movie.director)) missing.push('movie_patch.director');
  if (!hasList(movie.category)) missing.push('movie_patch.category');
  if (!hasList(movie.country)) missing.push('movie_patch.country');
  if (text(movie.content).length < 300) missing.push('intro_content');
  if (!text(movie.poster_url) && !text(movie.thumb_url)) missing.push('movie_patch.poster_url');
  if (!text(movie.trailer_url)) missing.push('movie_patch.trailer_url');
  return missing;
}
