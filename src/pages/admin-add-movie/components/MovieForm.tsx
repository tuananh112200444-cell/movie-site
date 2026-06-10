import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getAdminToken } from '@/services/adminAuth';
import { searchMoviesMultiSource, searchQueerUniverseMovies } from '@/services/movieApi';
import type { MovieItem, TMDBDisplayItem } from '@/types/movie';
import { extractEpisodeNumber } from '@/utils/movieSchedule';

interface MovieFormData {
  slug: string;
  name: string;
  origin_name: string;
  title_vi: string;
  title_en: string;
  title_zh: string;
  title_original: string;
  content: string;
  type: string;
  status: string;
  year: number | '';
  quality: string;
  lang: string;
  time: string;
  episode_current: string;
  episode_total: string;
  current_episode: string;
  total_episodes: string;
  schedule_type: string;
  release_time: string;
  release_day: string;
  release_at: string;
  next_episode_at: string;
  next_episode_name: string;
  schedule_note: string;
  thumb_url: string;
  poster_url: string;
  trailer_url: string;
  actor: string;
  director: string;
  category: string;
  country: string;
  is_published: boolean;
  tmdb_id: string;
  tmdb_type: string;
  vote_average: string;
  ophim_id: string;
  imdb_id: string;
  ophim_slug: string;
  source_site: string;
  source_name: string;
  is_queer_universe: boolean;
}

const INITIAL: MovieFormData = {
  slug: '',
  name: '',
  origin_name: '',
  title_vi: '',
  title_en: '',
  title_zh: '',
  title_original: '',
  content: '',
  type: 'phim-le',
  status: 'completed',
  year: new Date().getFullYear(),
  quality: 'HD',
  lang: 'Vietsub',
  time: '',
  episode_current: '',
  episode_total: '',
  current_episode: '',
  total_episodes: '',
  schedule_type: '',
  release_time: '',
  release_day: '',
  release_at: '',
  next_episode_at: '',
  next_episode_name: '',
  schedule_note: '',
  thumb_url: '',
  poster_url: '',
  trailer_url: '',
  actor: '',
  director: '',
  category: '',
  country: '',
  is_published: true,
  tmdb_id: '',
  tmdb_type: '',
  vote_average: '',
  ophim_id: '',
  imdb_id: '',
  ophim_slug: '',
  source_site: 'admin',
  source_name: 'Admin',
  is_queer_universe: false,
};

const TYPE_OPTS = [
  { value: 'phim-le', label: 'Phim lẻ' },
  { value: 'phim-bo', label: 'Phim bộ' },
  { value: 'hoat-hinh', label: 'Hoạt hình' },
  { value: 'tv-shows', label: 'TV Shows' },
  { value: 'phim-chieu-rap', label: 'Phim chiếu rạp' },
];

const STATUS_OPTS = [
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'ongoing', label: 'Đang chiếu' },
  { value: 'trailer', label: 'Trailer' },
];

const QUALITY_OPTS = ['HD', 'FHD', '2K', '4K', 'CAM'];
const LANG_OPTS = ['Vietsub', 'Thuyết minh', 'Lồng tiếng', 'RAW'];
const SCHEDULE_TYPES = [
  { value: '', label: 'Tắt countdown' },
  { value: 'daily', label: 'Chiếu hàng ngày' },
  { value: 'weekly', label: 'Chiếu hàng tuần' },
  { value: 'custom', label: 'Lịch tùy chỉnh' },
];
const RELEASE_DAYS = [
  { value: '1', label: 'Thứ 2' },
  { value: '2', label: 'Thứ 3' },
  { value: '3', label: 'Thứ 4' },
  { value: '4', label: 'Thứ 5' },
  { value: '5', label: 'Thứ 6' },
  { value: '6', label: 'Thứ 7' },
  { value: '0', label: 'Chủ nhật' },
];
const ADMIN_MOVIE_SELECT = 'id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,content,type,status,year,quality,lang,time,episode_current,episode_total,current_episode,total_episodes,schedule_type,release_time,release_day,schedule_timezone,release_at,next_episode_at,next_episode_name,schedule_note,thumb_url,poster_url,trailer_url,actor,director,category,country,is_published,tmdb_id,tmdb_type,vote_average,tmdb_vote_average,ophim_id,imdb_id,ophim_slug,source_site,source_name,updated_at';

interface SavedMovie {
  id: string;
  slug: string;
  name: string;
  poster_url: string;
  thumb_url: string;
  type: string;
}

interface VerificationResult {
  movies: boolean;
  episodes: number;
  streams: number;
}

interface DbSearchResult {
  id: string;
  slug: string;
  name: string;
  title_vi?: string;
  title_en?: string;
  origin_name?: string;
  thumb_url?: string;
  poster_url?: string;
  type: string;
  year?: number;
  tmdb_id?: number;
  imdb_id?: string;
  ophim_id?: string;
  source_site?: string;
  source_name?: string;
  ophim_slug?: string;
  episode_current?: string;
  is_published?: boolean;
  updated_at?: string;
}

interface Props {
  onDone: (movie: SavedMovie) => void;
}

function slugifyVietnamese(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeTitle(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function isTitleMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function isoToDatetimeLocal(value?: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timeFromDatetimeLocal(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 16 ? trimmed.slice(11, 16) : '';
}

function weekdayFromDatetimeLocal(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? '' : String(date.getDay());
}

function dbTitleKeys(movie: DbSearchResult): string[] {
  const year = movie.year || 0;
  const names = [
    movie.name,
    movie.title_vi,
    movie.title_en,
    movie.origin_name,
    movie.slug?.replace(/-/g, ' '),
    movie.ophim_slug?.replace(/-/g, ' '),
  ]
    .map((value) => normalizeTitle(value || ''))
    .filter((value) => value.length >= 3);

  const keys: string[] = [];
  for (const name of Array.from(new Set(names))) {
    if (year > 0) keys.push(`title-year:${name}:${year}`);
    else if (name.length >= 8) keys.push(`title:${name}`);
  }
  return keys;
}

function dbSourcePriority(movie: DbSearchResult): number {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  if (isQueerUniverseDbMovie(movie)) return 5;
  if (source.includes('admin')) return 4;
  if (movie.tmdb_id) return 3;
  if (!source.includes('ophim') && !source.includes('phimapi') && !source.includes('kkphim')) return 2
  return 1;
}

function dedupeDbResults(rows: DbSearchResult[]): DbSearchResult[] {
  const result: DbSearchResult[] = [];
  const seen = new Map<string, number>();

  for (const row of rows) {
    const keys = [
      row.id,
      row.slug,
      row.tmdb_id ? String(row.tmdb_id) : '',
      row.imdb_id,
      row.ophim_id,
      row.ophim_slug,
      ...dbTitleKeys(row),
    ].filter(Boolean) as string[];

    const existingIndex = keys
      .map((key) => seen.get(key))
      .find((idx): idx is number => idx !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = result.length;
      result.push(row);
      keys.forEach((key) => seen.set(key, nextIndex));
      continue;
    }

    const current = result[existingIndex];
    const preferred = dbSourcePriority(row) > dbSourcePriority(current) ? row : current;
    const fallback = preferred === row ? current : row;
    result[existingIndex] = {
      ...fallback,
      ...preferred,
      episode_current: preferred.episode_current || fallback.episode_current,
      thumb_url: preferred.thumb_url || fallback.thumb_url,
      poster_url: preferred.poster_url || fallback.poster_url,
      ophim_id: preferred.ophim_id || fallback.ophim_id,
      ophim_slug: preferred.ophim_slug || fallback.ophim_slug,
    };
    keys.forEach((key) => seen.set(key, existingIndex));
    dbTitleKeys(result[existingIndex]).forEach((key) => seen.set(key, existingIndex));
  }

  return result;
}

function tmdbStatusToLocal(status: string): string {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('released') || s.includes('ended')) return 'completed';
  if (s.includes('post')) return 'completed';
  if (s.includes('returning') || s.includes('production')) return 'ongoing';
  return 'completed';
}

function runtimeToString(runtime: number): string {
  if (!runtime || runtime <= 0) return '';
  const h = Math.floor(runtime / 60);
  const m = runtime % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} phút`;
}

function buildCategoryArray(raw: string): Array<{ id: string; name: string; slug: string }> {
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((name) => ({ id: '', name, slug: slugifyVietnamese(name) }));
}

function buildCountryArray(raw: string): Array<{ id: string; name: string; slug: string }> {
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((name) => ({ id: '', name, slug: slugifyVietnamese(name) }));
}

function addUniqueCsvTerms(raw: string, terms: string[]): string {
  const seen = new Set<string>();
  const values = [...raw.split(','), ...terms]
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeTitle(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return values.join(', ');
}

function isQueerUniverseDbMovie(m: unknown): boolean {
  const record = m as Record<string, unknown>;
  const text = [
    record.source_site,
    record.source_name,
    ...(Array.isArray(record.category) ? (record.category as Array<{ name?: string; slug?: string }>).flatMap((c) => [c.name, c.slug]) : []),
  ]
    .filter(Boolean)
    .join(' ');
  const normalized = normalizeTitle(text);
  return normalized.includes('admin queer') ||
    normalized.includes('blvietsub') ||
    normalized.includes('vu tru dam my') ||
    normalized.includes('dam my') ||
    normalized.includes('bach hop') ||
    normalized.includes('boy love') ||
    normalized.includes('girl love') ||
    /\bbl\b/.test(normalized) ||
    /\bgl\b/.test(normalized);
}
function taxonomyToText(items?: Array<{ name?: string }>): string {
  return (items ?? []).map((item) => item.name || '').filter(Boolean).join(', ');
}

function externalSourceLabel(movie: MovieItem): string {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  if (isQueerUniverseDbMovie(movie)) return 'Vũ trụ đam mỹ';
  if (source.includes('kkphim') || source.includes('phimapi')) return 'KKPhim';
  if (source.includes('ophim')) return 'OPhim';
  return movie.source_name || movie.source_site || 'API';
}

function isSameMovieByTitleAndYear(dbMovie: DbSearchResult, apiMovie: MovieItem): boolean {
  const dbYear = Number(dbMovie.year || 0);
  const apiYear = Number(apiMovie.year || 0);
  if (dbYear > 0 && apiYear > 0 && dbYear !== apiYear) return false;

  const apiTitles = [
    apiMovie.name,
    apiMovie.origin_name,
    apiMovie.title_vi,
    apiMovie.title_en,
    apiMovie.slug?.replace(/-/g, ' '),
  ].filter(Boolean) as string[];

  return apiTitles.some((title) =>
    isTitleMatch(dbMovie.name || '', title) ||
    isTitleMatch(dbMovie.title_vi || '', title) ||
    isTitleMatch(dbMovie.title_en || '', title) ||
    isTitleMatch(dbMovie.origin_name || '', title) ||
    isTitleMatch(dbMovie.slug?.replace(/-/g, ' ') || '', title)
  );
}

function apiMovieKey(movie: MovieItem): string {
  return [
    movie.source_site || '',
    movie.ophim_id || movie._id || '',
    movie.slug || '',
    normalizeTitle(movie.name || movie.title_vi || movie.origin_name || ''),
    movie.year || '',
  ].join('|');
}

function filterApiResults(rows: MovieItem[], dbRows: DbSearchResult[]): MovieItem[] {
  const seen = new Set<string>();
  return rows
    .filter((movie) => {
      const key = apiMovieKey(movie);
      if (seen.has(key)) return false;
      seen.add(key);

      const apiSlug = String(movie.slug || '').toLowerCase();
      const apiOphimId = String(movie.ophim_id || movie._id || '');
      return !dbRows.some((dbMovie) => {
        if (apiSlug && dbMovie.slug?.toLowerCase() === apiSlug) return true;
        if (apiSlug && dbMovie.ophim_slug?.toLowerCase() === apiSlug) return true;
        if (apiOphimId && dbMovie.ophim_id === apiOphimId) return true;
        return isSameMovieByTitleAndYear(dbMovie, movie);
      });
    })
    .slice(0, 16);
}

function externalMovieToForm(movie: MovieItem): MovieFormData {
  const displayName = movie.name || movie.title_vi || movie.origin_name || '';
  const originName = movie.origin_name || movie.title_en || '';
  return {
    ...INITIAL,
    slug: movie.slug || slugifyVietnamese(originName || displayName),
    name: displayName,
    origin_name: originName,
    title_vi: movie.title_vi || displayName,
    title_en: movie.title_en || originName,
    title_original: originName || displayName,
    content: movie.content || '',
    type: movie.type || 'phim-le',
    status: movie.status || 'completed',
    year: movie.year || new Date().getFullYear(),
    quality: movie.quality || 'HD',
    lang: movie.lang || 'Vietsub',
    time: movie.time || '',
    episode_current: movie.episode_current || '',
    episode_total: movie.episode_total || '',
    current_episode: String(movie.current_episode || extractEpisodeNumber(movie.episode_current) || ''),
    total_episodes: String(movie.total_episodes || extractEpisodeNumber(movie.episode_total) || ''),
    schedule_type: movie.schedule_type || '',
    release_time: movie.release_time?.slice(0, 5) || '',
    release_day: movie.release_day === undefined || movie.release_day === null ? '' : String(movie.release_day),
    release_at: movie.release_at ? isoToDatetimeLocal(movie.release_at) : '',
    next_episode_at: movie.next_episode_at ? isoToDatetimeLocal(movie.next_episode_at) : '',
    next_episode_name: movie.next_episode_name || '',
    schedule_note: movie.schedule_note || '',
    thumb_url: movie.thumb_url || movie.poster_url || '',
    poster_url: movie.poster_url || movie.thumb_url || '',
    trailer_url: movie.trailer_url || '',
    actor: Array.isArray(movie.actor) ? movie.actor.join(', ') : '',
    director: Array.isArray(movie.director) ? movie.director.join(', ') : '',
    category: taxonomyToText(movie.category),
    country: taxonomyToText(movie.country),
    is_published: true,
    tmdb_id: movie.tmdb_id ? String(movie.tmdb_id) : '',
    tmdb_type: movie.type === 'phim-bo' || movie.type === 'tv-shows' || movie.type === 'hoat-hinh' ? 'tv' : 'movie',
    vote_average: '',
    ophim_id: movie.ophim_id || movie._id || '',
    imdb_id: '',
    ophim_slug: movie.slug || '',
    source_site: movie.source_site || 'api',
    source_name: movie.source_name || externalSourceLabel(movie),
    is_queer_universe: isQueerUniverseDbMovie(movie),
  };
}

function savedMovieFromDb(movie: DbSearchResult): SavedMovie {
  return {
    id: movie.id,
    slug: movie.slug,
    name: movie.name,
    poster_url: movie.poster_url || movie.thumb_url || '',
    thumb_url: movie.thumb_url || '',
    type: movie.type,
  };
}  

function clearSearchCacheLocal(): number {
  let cleared = 0;
  try {
    const keys = Object.keys(sessionStorage);
    for (const k of keys) {
      if (k.includes('search') || k.includes('detail_')) {
        sessionStorage.removeItem(k);
        cleared++;
      }
    }
  } catch { /* quota */ }
  return cleared;
}

export default function MovieForm({ onDone }: Props) {
  const [form, setForm] = useState<MovieFormData>(INITIAL);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [slugError, setSlugError] = useState('');

  // Unified search
  const [searchQuery, setSearchQuery] = useState('');
  const [dbResults, setDbResults] = useState<DbSearchResult[]>([]);
  const [apiResults, setApiResults] = useState<MovieItem[]>([]);
  const [tmdbResults, setTmdbResults] = useState<TMDBDisplayItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Duplicate warning when selecting TMDB that already exists
  const [duplicateWarning, setDuplicateWarning] = useState<{ movie: DbSearchResult; tmdbTitle: string; tmdbItem?: TMDBDisplayItem } | null>(null);

  // Saved / existing movie state
  const [savedMovie, setSavedMovie] = useState<SavedMovie | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [isExistingMovieLoaded, setIsExistingMovieLoaded] = useState(false);
  const [existingMovieEpisodes, setExistingMovieEpisodes] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeSourceIds, setMergeSourceIds] = useState<string[]>([]);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeMsg, setMergeMsg] = useState('');

  const [displayNameManuallyEdited, setDisplayNameManuallyEdited] = useState(false);
  const skipDuplicateRef = useRef(false);

  const update = <K extends keyof MovieFormData>(key: K, value: MovieFormData[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    if (key === 'name') setDisplayNameManuallyEdited(true);
    if (key === 'slug') setSlugError('');
    setError('');
    setDuplicateWarning(null);
  };

  const resetMergeSelection = () => {
    setMergeTargetId('');
    setMergeSourceIds([]);
    setMergeMsg('');
  };

  function extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (typeof e.message === 'string' && e.message) return e.message;
      if (typeof e.error === 'string' && e.error) return e.error;
      if (typeof e.msg === 'string' && e.msg) return e.msg;
      try { return JSON.stringify(err); } catch { /* ignore */ }
    }
    return String(err ?? 'Unknown error');
  }

  const isNumericQuery = (q: string) => /^\d+$/.test(q.trim());

  const searchDb = useCallback(async (query: string): Promise<DbSearchResult[]> => {
    const kw = query.trim();
    if (!kw) return [];
    try {
      const isNumeric = /^\d+$/.test(kw);
      let qry = supabase
        .from('movies')
        .select(ADMIN_MOVIE_SELECT)
        .neq('source_site', 'merged');
      if (isNumeric) {
        qry = qry.or(`tmdb_id.eq.${kw},ophim_id.eq.${kw}`);
      } else {
        const ilike = `name.ilike.%${kw}%,slug.ilike.%${kw}%,title_vi.ilike.%${kw}%,title_en.ilike.%${kw}%,title_zh.ilike.%${kw}%,title_original.ilike.%${kw}%,origin_name.ilike.%${kw}%,normalized_name.ilike.%${kw}%,ophim_slug.ilike.%${kw}%`;
        qry = qry.or(ilike);
      }
      const { data, error: err } = await qry.order('updated_at', { ascending: false }).limit(20);
      if (err || !data) return [];
      const rows = (data as Record<string, unknown>[]).map((m) => ({
        id: String(m.id),
        slug: String(m.slug || ''),
        name: String(m.name || m.title_vi || m.title_en || ''),
        title_vi: String(m.title_vi || ''),
        title_en: String(m.title_en || ''),
        origin_name: String(m.origin_name || ''),
        thumb_url: String(m.thumb_url || ''),
        poster_url: String(m.poster_url || ''),
        type: String(m.type || 'phim-le'),
        year: (m.year as number) || undefined,
        tmdb_id: (m.tmdb_id as number) || undefined,
        imdb_id: String(m.imdb_id || ''),
        ophim_id: String(m.ophim_id || ''),
        ophim_slug: String(m.ophim_slug || ''),
        source_site: String(m.source_site || ''),
        source_name: String(m.source_name || ''),
        episode_current: String(m.episode_current || ''),
        is_published: Boolean(m.is_published),
        updated_at: String(m.updated_at || ''),
      }));
      return rows;
    } catch {
      return [];
    }
  }, []);

  // ─── Search TMDB ───
  const searchExternalApi = useCallback(async (query: string): Promise<MovieItem[]> => {
    const kw = query.trim();
    if (!kw || isNumericQuery(kw)) return [];
    try {
      const response = await searchMoviesMultiSource(kw, 1);
      return (response.items || []).slice(0, 24);
    } catch (e) {
      console.error('[AdminSearch] API search error:', e);
      return [];
    }
  }, []);

  const searchBlvietsubApi = useCallback(async (query: string): Promise<MovieItem[]> => {
    const kw = query.trim();
    if (!kw || isNumericQuery(kw)) return [];
    try {
      return searchQueerUniverseMovies(kw, { limit: 24, timeoutMs: 4500, minLength: 2 });
    } catch (e) {
      console.error('[AdminSearch] BLVietsub search error:', e);
      return [];
    }
  }, []);

  const searchTmdb = useCallback(async (query: string): Promise<TMDBDisplayItem[]> => {
    const kw = query.trim();
    if (!kw) return [];
    if (isNumericQuery(kw)) {
      const tmdbId = Number(kw);
      const { data: movieDetail, error: mErr } = await supabase.functions.invoke('tmdb-detail-proxy', {
        body: { id: tmdbId, mediaType: 'movie' },
      });
      if (mErr) throw mErr;
      if (movieDetail && movieDetail.title) {
        return [{
          id: tmdbId,
          title: movieDetail.title || '',
          originalTitle: movieDetail.originalTitle || '',
          overview: movieDetail.overview || '',
          posterUrl: movieDetail.posterUrl || null,
          backdropUrl: movieDetail.backdropUrl || null,
          rating: movieDetail.rating || 0,
          voteCount: movieDetail.voteCount || 0,
          year: movieDetail.releaseDate ? Number(movieDetail.releaseDate.split('-')[0]) : 0,
          mediaType: 'movie',
          genreIds: [],
        }];
      }
      const { data: tvDetail, error: tErr } = await supabase.functions.invoke('tmdb-detail-proxy', {
        body: { id: tmdbId, mediaType: 'tv' },
      });
      if (tErr) throw tErr;
      if (tvDetail && tvDetail.title) {
        return [{
          id: tmdbId,
          title: tvDetail.title || '',
          originalTitle: tvDetail.originalTitle || '',
          overview: tvDetail.overview || '',
          posterUrl: tvDetail.posterUrl || null,
          backdropUrl: tvDetail.backdropUrl || null,
          rating: tvDetail.rating || 0,
          voteCount: tvDetail.voteCount || 0,
          year: tvDetail.releaseDate ? Number(tvDetail.releaseDate.split('-')[0]) : 0,
          mediaType: 'tv',
          genreIds: [],
        }];
      }
      return [];
    }

    const { data, error: fnErr } = await supabase.functions.invoke('tmdb-search-proxy', {
      body: { query: kw, page: 1 },
    });
    if (fnErr) throw fnErr;
    const movies: TMDBDisplayItem[] = data?.movieResults ?? [];
    const tvs: TMDBDisplayItem[] = data?.tvResults ?? [];
    return [...movies, ...tvs].slice(0, 12);
  }, []);

  // ─── Unified admin search ───
  const handleAdminSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setDbResults([]);
      setApiResults([]);
      setTmdbResults([]);
      setSearchError('');
      resetMergeSelection();
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    setDuplicateWarning(null);

    try {
      const [dbRes, apiRes, blvietsubRes, tmdbRes] = await Promise.allSettled([
        searchDb(query),
        searchExternalApi(query),
        searchBlvietsubApi(query),
        searchTmdb(query),
      ]);

      const db = dbRes.status === 'fulfilled' ? dbRes.value : [];
      setMergeTargetId((current) => db.some((movie) => movie.id === current) ? current : '');
      setMergeSourceIds((current) => current.filter((id) => db.some((movie) => movie.id === id)));
      if (dbRes.status === 'rejected') {
        console.error('[AdminSearch] DB search error:', dbRes.reason);
      }

      const apiItems = apiRes.status === 'fulfilled' ? apiRes.value : [];
      const blvietsubItems = blvietsubRes.status === 'fulfilled' ? blvietsubRes.value : [];
      const api = filterApiResults([...blvietsubItems, ...apiItems], db);
      if (apiRes.status === 'rejected') {
        console.error('[AdminSearch] API search error:', apiRes.reason);
      }
      if (blvietsubRes.status === 'rejected') {
        console.error('[AdminSearch] BLVietsub search error:', blvietsubRes.reason);
      }

      const tmdb = tmdbRes.status === 'fulfilled' ? tmdbRes.value : [];
      if (tmdbRes.status === 'rejected') {
        const reasonMsg = extractErrorMessage(tmdbRes.reason);
        let errMsg = 'Không thể kết nối TMDB';
        if (reasonMsg.includes('TMDB_API_KEY')) {
          errMsg = 'TMDB API Key chưa được cấu hình trong Edge Function secrets. Vui lòng thêm secret TMDB_API_KEY vào Supabase Dashboard.';
        } else if (reasonMsg.includes('401') || reasonMsg.includes('403')) {
          errMsg = 'TMDB API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại key.';
        } else if (reasonMsg) {
          errMsg = `Lỗi TMDB: ${reasonMsg}`;
        }
        setSearchError(errMsg);
      }

      // Merge: detect TMDB items already in DB
      const dbTmdbIds = new Set<number>();
      const dbSlugs = new Set<string>();
      const dbTitles = new Set<string>();
      for (const d of db) {
        if (d.tmdb_id) dbTmdbIds.add(d.tmdb_id);
        if (d.slug) dbSlugs.add(d.slug.toLowerCase());
        if (d.name) dbTitles.add(normalizeTitle(d.name));
        if (d.title_vi) dbTitles.add(normalizeTitle(d.title_vi));
        if (d.title_en) dbTitles.add(normalizeTitle(d.title_en));
        if (d.origin_name) dbTitles.add(normalizeTitle(d.origin_name));
      }

      const mergedTmdb = tmdb.map((item) => {
        const itemSlug = slugifyVietnamese(item.title || item.originalTitle || '');
        const normalizedItemTitle = normalizeTitle(item.title || item.originalTitle || '');
        const matchedDb = db.find((d) => {
          if (d.tmdb_id && d.tmdb_id === item.id) return true;
          if (d.slug && d.slug.toLowerCase() === itemSlug.toLowerCase()) return true;
          if (d.imdb_id && item.imdbId && d.imdb_id === item.imdbId) return true;
          if (normalizedItemTitle && normalizedItemTitle.length >= 2 && dbTitles.has(normalizedItemTitle)) return true;
          return false;
        });
        return { item, matchedDb };
      });

      const visibleTmdb = mergedTmdb
        .filter(({ matchedDb, item }) => {
          if (matchedDb) return false;
          const candidateSlug = slugifyVietnamese(item.title || item.originalTitle || '').toLowerCase();
          const candidateNorm = normalizeTitle(item.title || item.originalTitle || '');
          const isDupBySlug = candidateSlug.length > 1 && dbSlugs.has(candidateSlug);
          const isDupByTitle = candidateNorm.length >= 2 && dbTitles.has(candidateNorm);
          return !isDupBySlug && !isDupByTitle;
        })
        .map(({ item }) => item);

      setDbResults(db);
      setApiResults(api);
      setTmdbResults(visibleTmdb);
    } catch {
      setSearchError('Lỗi tìm kiếm — vui lòng thử lại');
    } finally {
      setSearchLoading(false);
    }
  }, [searchDb, searchExternalApi, searchBlvietsubApi, searchTmdb]);

  const onSearchInputChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) {
      setDbResults([]);
      setApiResults([]);
      setTmdbResults([]);
      setDuplicateWarning(null);
      return;
    }
    searchTimer.current = setTimeout(() => handleAdminSearch(value), 400);
  };

  // ─── Load existing movie by slug ───
  const loadExistingMovieBySlug = async (slug: string): Promise<boolean> => {
    setDisplayNameManuallyEdited(false);
    const { data } = await supabase.from('movies').select(ADMIN_MOVIE_SELECT).eq('slug', slug).maybeSingle();
    if (!data) return false;

    const m = data as Record<string, unknown>;
    setForm({
      slug: String(m.slug || ''),
      name: String(m.name || ''),
      origin_name: String(m.origin_name || ''),
      title_vi: String(m.title_vi || ''),
      title_en: String(m.title_en || ''),
      title_zh: String(m.title_zh || ''),
      title_original: String(m.title_original || m.origin_name || ''),
      content: String(m.content || ''),
      type: String(m.type || 'phim-le'),
      status: String(m.status || 'completed'),
      year: (m.year as number) || new Date().getFullYear(),
      quality: String(m.quality || 'HD'),
      lang: String(m.lang || 'Vietsub'),
      time: String(m.time || ''),
      episode_current: String(m.episode_current || ''),
      episode_total: String(m.episode_total || ''),
      current_episode: String(m.current_episode || extractEpisodeNumber(String(m.episode_current || '')) || ''),
      total_episodes: String(m.total_episodes || extractEpisodeNumber(String(m.episode_total || '')) || ''),
      schedule_type: String(m.schedule_type || ''),
      release_time: String(m.release_time || '').slice(0, 5),
      release_day: m.release_day === null || m.release_day === undefined ? '' : String(m.release_day),
      release_at: isoToDatetimeLocal(m.release_at),
      next_episode_at: isoToDatetimeLocal(m.next_episode_at),
      next_episode_name: String(m.next_episode_name || ''),
      schedule_note: String(m.schedule_note || ''),
      thumb_url: String(m.thumb_url || ''),
      poster_url: String(m.poster_url || ''),
      trailer_url: String(m.trailer_url || ''),
      actor: Array.isArray(m.actor) ? (m.actor as string[]).join(', ') : '',
      director: Array.isArray(m.director) ? (m.director as string[]).join(', ') : '',
      category: Array.isArray(m.category)
        ? (m.category as Array<{ name?: string }>).map((c) => c.name ?? '').join(', ')
        : '',
      country: Array.isArray(m.country)
        ? (m.country as Array<{ name?: string }>).map((c) => c.name ?? '').join(', ')
        : '',
      is_published: (m.is_published as boolean) ?? true,
      tmdb_id: String(m.tmdb_id || ''),
      tmdb_type: String(m.tmdb_type || ''),
      vote_average: String(m.vote_average || m.tmdb_vote_average || ''),
      ophim_id: String(m.ophim_id || ''),
      imdb_id: String(m.imdb_id || ''),
      ophim_slug: String(m.ophim_slug || m.ophim_id || ''),
      source_site: String(m.source_site || 'admin'),
      source_name: String(m.source_name || 'Admin'),
      is_queer_universe: isQueerUniverseDbMovie(m),
    });
    setSavedMovie({
      id: String(m.id || ''),
      slug: String(m.slug || ''),
      name: String(m.name || ''),
      poster_url: String(m.poster_url || m.thumb_url || ''),
      thumb_url: String(m.thumb_url || ''),
      type: String(m.type || 'phim-le'),
    });
    setIsExistingMovieLoaded(true);
    setExistingMovieEpisodes(String(m.episode_current || ''));
    return true;
  };

  // ─── Select DB movie ───
  const handleSelectDbMovie = async (item: DbSearchResult) => {
    setDuplicateWarning(null);
    const ok = await loadExistingMovieBySlug(item.slug);
    if (ok) {
      setError('');
    } else {
      setError('Không thể tải dữ liệu phim từ hệ thống');
    }
  };

  // ─── Check duplicate before allowing TMDB selection ───
  const handleSelectApiMovie = async (item: MovieItem) => {
    setDuplicateWarning(null);
    setError('');
    setDisplayNameManuallyEdited(false);

    const existingSlug = item.slug || '';
    if (existingSlug) {
      const ok = await loadExistingMovieBySlug(existingSlug);
      if (ok) return;
    }

    setForm(externalMovieToForm(item));
    setSavedMovie(null);
    setIsExistingMovieLoaded(false);
    setExistingMovieEpisodes('');
    setSlugError('');
  };

  const checkDuplicateInDb = async (tmdbId: number, title: string, originalTitle: string): Promise<DbSearchResult | null> => {
    try {
      if (tmdbId) {
        const { data } = await supabase.from('movies').select(ADMIN_MOVIE_SELECT).eq('tmdb_id', tmdbId).maybeSingle();  
        if (data) return data as unknown as DbSearchResult;
      }
      const generatedSlug = slugifyVietnamese(title || originalTitle);
      if (generatedSlug && generatedSlug.length > 1) {
        const { data } = await supabase.from('movies').select(ADMIN_MOVIE_SELECT).eq('slug', generatedSlug).maybeSingle();
        if (data) return data as unknown as DbSearchResult;
      }
      const norm = normalizeTitle(title || originalTitle);
      if (norm && norm.length >= 2) {
        const conditions: string[] = [];
        conditions.push(`normalized_name.eq.${norm}`);
        const t = title.trim();
        const ot = originalTitle.trim();
        if (t) {
          conditions.push(`name.ilike.%${t}%`);
          conditions.push(`title_vi.ilike.%${t}%`);
        }
        if (ot) {
          conditions.push(`title_en.ilike.%${ot}%`);
          conditions.push(`origin_name.ilike.%${ot}%`);
        }
        if (conditions.length > 0) {
          const { data } = await supabase
            .from('movies')
            .select(ADMIN_MOVIE_SELECT)
            .or(conditions.join(','))
            .limit(1);
          if (data && data.length > 0) return data[0] as unknown as DbSearchResult;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  // ─── Select TMDB movie ───
  const handleSelectTmdbMovie = async (item: TMDBDisplayItem) => {
    setDuplicateWarning(null);
    setError('');
    setDisplayNameManuallyEdited(false);

    if (!skipDuplicateRef.current) {
      // Immediate duplicate check
      const dup = await checkDuplicateInDb(item.id, item.title || '', item.originalTitle || '');
      if (dup) {
        setDuplicateWarning({ movie: dup, tmdbTitle: item.title || item.originalTitle || '', tmdbItem: item });
        return;
      }
    }
    skipDuplicateRef.current = false;

    setIsExistingMovieLoaded(false);
    setExistingMovieEpisodes('');

    try {
      const { data: detail, error: fnErr } = await supabase.functions.invoke('tmdb-detail-proxy', {
        body: { id: item.id, mediaType: item.mediaType },
      });
      if (fnErr || !detail) {
        setError(extractErrorMessage(fnErr) || 'Không thể lấy chi tiết phim từ TMDB');
        return;
      }

      const isTv = item.mediaType === 'tv';
      const titleVi = detail.title_vi || detail.title || '';
      const titleEn = detail.title_en || detail.originalTitle || '';
      const titleOriginal = detail.title_original || detail.originalTitle || '';
      const autoDisplayName = titleVi.trim() || titleEn.trim() || titleOriginal.trim() || '';

      const year = detail.releaseDate ? Number(detail.releaseDate.split('-')[0]) : item.year;
      const genres = Array.isArray(detail.genres) ? detail.genres.join(', ') : '';
      const cast = (detail.cast ?? [])
        .slice(0, 8)
        .map((c: { name: string }) => c.name)
        .join(', ');
      const countries = Array.isArray(detail.productionCountries)
        ? detail.productionCountries.join(', ')
        : '';
      const trailer = (detail.videos ?? []).find(
        (v: { type: string; site: string }) => v.type === 'Trailer' && v.site === 'YouTube',
      );
      const trailerUrl = trailer ? `https://www.youtube.com/embed/${trailer.key}` : '';
      const generatedSlug = slugifyVietnamese(titleEn || autoDisplayName);

      // Re-check duplicate by slug after generating
      const dupBySlug = await checkDuplicateInDb(0, '', generatedSlug);
      if (dupBySlug) {
        setDuplicateWarning({ movie: dupBySlug, tmdbTitle: item.title || item.originalTitle || '', tmdbItem: item });
        return;
      }

      const finalDisplayName = displayNameManuallyEdited ? form.name : autoDisplayName;
      setDisplayNameManuallyEdited(false);

      setForm((prev) => ({
        ...INITIAL,
        slug: generatedSlug,
        name: finalDisplayName,
        origin_name: titleOriginal,
        title_vi: titleVi,
        title_en: titleEn,
        title_original: titleOriginal,
        content: detail.overview ?? '',
        type: isTv ? 'phim-bo' : 'phim-le',
        status: tmdbStatusToLocal(detail.status ?? ''),
        year: year || new Date().getFullYear(),
        quality: 'HD',
        lang: 'Vietsub',
        time: runtimeToString(detail.runtime ?? 0),
        episode_current: isTv ? String(detail.numberOfEpisodes ?? '') : 'Full',
        episode_total: isTv ? String(detail.numberOfEpisodes ?? '') : '',
        current_episode: isTv ? String(detail.numberOfEpisodes ?? '') : '',
        total_episodes: isTv ? String(detail.numberOfEpisodes ?? '') : '',
        schedule_type: '',
        release_time: '',
        release_day: '',
        thumb_url: detail.posterUrl ?? '',
        poster_url: detail.backdropUrl ?? detail.posterUrl ?? '',
        trailer_url: trailerUrl,
        actor: cast,
        director: detail.director ?? '',
        category: genres,
        country: countries,
        is_published: true,
        tmdb_id: String(item.id),
        tmdb_type: item.mediaType,
        vote_average: String(detail.rating ?? ''),
        ophim_id: '',
        imdb_id: detail.imdbId ?? '',
      }));

      setSavedMovie(null);
      setSlugError('');
    } catch (e) {
      setError(extractErrorMessage(e) || 'Lỗi khi lấy dữ liệu từ TMDB');
    }
  };

  // ─── Open duplicate movie directly ───
  const handleOpenDuplicate = async (dbMovie: DbSearchResult) => {
    setDuplicateWarning(null);
    await handleSelectDbMovie(dbMovie);
  };

  // ─── Go to manage episodes directly ───
  const handleManageEpisodes = () => {
    if (savedMovie) {
      onDone(savedMovie);
    }
  };

  const handleManageEpisodesDirect = (movie: DbSearchResult) => {
    const payload: SavedMovie = {
      id: movie.id,
      slug: movie.slug,
      name: movie.name,
      poster_url: movie.poster_url || movie.thumb_url || '',
      thumb_url: movie.thumb_url || '',
      type: movie.type,
    };
    onDone(payload);
  };

  const handleSetMergeTarget = (movie: DbSearchResult) => {
    setMergeTargetId(movie.id);
    setMergeSourceIds((ids) => ids.filter((id) => id !== movie.id));
    setMergeMsg('');
    setError('');
  };

  const handleToggleMergeSource = (movie: DbSearchResult) => {
    if (movie.id === mergeTargetId) return;
    setMergeSourceIds((ids) =>
      ids.includes(movie.id) ? ids.filter((id) => id !== movie.id) : [...ids, movie.id]
    );
    setMergeMsg('');
    setError('');
  };

  const handleMergeDuplicates = async () => {
    if (!mergeTargetId || mergeSourceIds.length === 0) {
      setError('Chọn 1 phim chính và ít nhất 1 phim phụ để gộp.');
      return;
    }

    const target = dbResults.find((movie) => movie.id === mergeTargetId);
    const sources = mergeSourceIds
      .map((id) => dbResults.find((movie) => movie.id === id))
      .filter((movie): movie is DbSearchResult => Boolean(movie));
    if (!target || sources.length !== mergeSourceIds.length) {
      setError('Danh sách phim gộp đã thay đổi. Vui lòng tìm lại phim.');
      return;
    }

    const ok = window.confirm(
      `Gộp ${sources.length} phim phụ vào "${target.name}"?\n\n` +
      `Phim phụ sẽ bị ẩn khỏi web, toàn bộ tập/link/source sẽ chuyển sang phim chính.`
    );
    if (!ok) return;

    const token = getAdminToken();
    if (!token) {
      setError('Phiên đăng nhập admin đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setMergeSaving(true);
    setError('');
    setMergeMsg('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-movie-upsert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            action: 'merge',
            target_id: mergeTargetId,
            source_ids: mergeSourceIds,
          }),
        }
      );
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        target?: { id: string; slug: string; name: string };
        summary?: {
          movie_episodes?: { moved: number; deduped: number };
          episodes?: { moved: number; deduped: number };
          streams?: { moved: number; deduped: number };
        };
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể gộp phim');
      }

      const moved =
        (data.summary?.movie_episodes?.moved ?? 0) +
        (data.summary?.episodes?.moved ?? 0) +
        (data.summary?.streams?.moved ?? 0);
      const deduped =
        (data.summary?.movie_episodes?.deduped ?? 0) +
        (data.summary?.episodes?.deduped ?? 0) +
        (data.summary?.streams?.deduped ?? 0);
      setMergeMsg(`Đã gộp vào "${data.target?.name || target.name}": chuyển ${moved} dòng, bỏ trùng ${deduped} dòng.`);
      const fresh = await searchDb(searchQuery);
      setDbResults(fresh);
      setApiResults([]);
      setTmdbResults([]);
      setDuplicateWarning(null);
      setMergeTargetId(data.target?.id || mergeTargetId);
      setMergeSourceIds([]);
      setSavedMovie(savedMovieFromDb(target));
      setIsExistingMovieLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi gộp phim');
    } finally {
      setMergeSaving(false);
    }
  };

  const checkSlugInternal = async (s: string) => {
    const slug = s.trim().toLowerCase();
    if (!slug) { setSlugError(''); return; }
    if (!/^[a-z0-9-]+$/.test(slug)) { setSlugError('Slug chỉ chứa chữ thường, số và dấu gạch ngang'); return; }

    setChecking(true);
    const { data } = await supabase.from('movies').select('slug').eq('slug', slug).maybeSingle();
    setChecking(false);

    if (data && (!savedMovie || savedMovie.slug !== slug)) {
      setSlugError('Slug đã tồn tại, vui lòng chọn slug khác');
    } else {
      setSlugError('');
    }
  };

  const verifyMovie = async (movieId: string): Promise<VerificationResult> => {
    const [{ data: m }, { data: eps }] = await Promise.all([
      supabase.from('movies').select('id').eq('id', movieId).maybeSingle(),
      supabase.from('movie_episodes').select('id,link_m3u8,link_embed').eq('movie_id', movieId),
    ]);
    const rows = (eps ?? []) as Array<{ link_m3u8?: string | null; link_embed?: string | null }>;
    return {
      movies: !!m,
      episodes: rows.length,
      streams: rows.filter((ep) => Boolean(ep.link_m3u8 || ep.link_embed)).length,
    };
  };

  const handleSubmit = async () => {
    setError('');
    setVerification(null);
    if (!form.name.trim()) { setError('Tên phim không được để trống'); return; }
    if (!form.slug.trim()) { setError('Slug không được để trống'); return; }

    const slug = form.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) { setError('Slug chỉ chứa chữ thường, số và dấu gạch ngang'); return; }

    const tmdbIdNum = form.tmdb_id.trim() ? Number(form.tmdb_id.trim()) : null;
    if (form.tmdb_id.trim() && Number.isNaN(tmdbIdNum)) {
      setError('TMDB ID phải là số');
      return;
    }

    setSaving(true);

    const now = new Date().toISOString();
    const normalizedName = form.name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

    const finalTitleVi = form.title_vi.trim() || form.name.trim();
    const finalCategoryText = form.is_queer_universe
      ? addUniqueCsvTerms(form.category, ['BL / GL', 'Đam mỹ', 'Bách hợp'])
      : form.category;
    const currentEpisodeNum = form.current_episode.trim() ? Number(form.current_episode.trim()) : null;
    const totalEpisodesNum = form.total_episodes.trim() ? Number(form.total_episodes.trim()) : null;
    if (currentEpisodeNum !== null && (!Number.isInteger(currentEpisodeNum) || currentEpisodeNum < 0)) {
      setError('Tập hiện tại phải là số nguyên không âm');
      setSaving(false);
      return;
    }
    if (totalEpisodesNum !== null && (!Number.isInteger(totalEpisodesNum) || totalEpisodesNum < 0)) {
      setError('Tổng số tập phải là số nguyên không âm');
      setSaving(false);
      return;
    }
    const finalEpisodeCurrent = currentEpisodeNum !== null ? `Tập ${currentEpisodeNum}` : form.episode_current.trim();
    const finalEpisodeTotal = totalEpisodesNum !== null ? String(totalEpisodesNum) : form.episode_total.trim();

    const scheduleType = form.schedule_type.trim();
    const hasCountdown = scheduleType === 'daily' || scheduleType === 'weekly' || scheduleType === 'custom';
    const derivedReleaseTime = form.release_time || timeFromDatetimeLocal(form.next_episode_at);
    const derivedReleaseDay = form.release_day || weekdayFromDatetimeLocal(form.next_episode_at);
    const nextEpisodeName = form.next_episode_name.trim() || (currentEpisodeNum !== null ? `Tập ${currentEpisodeNum + 1}` : '');
    if (hasCountdown && totalEpisodesNum !== null && currentEpisodeNum !== null && currentEpisodeNum >= totalEpisodesNum) {
      setError('Muon bat countdown thi tong so tap phai lon hon tap hien tai, hoac de trong tong so tap.');
      setSaving(false);
      return;
    }
    if (scheduleType === 'custom' && !form.next_episode_at.trim()) {
      setError('Lich ngay gio cu the can nhap ngay gio ra tap tiep theo.');
      setSaving(false);
      return;
    }
    if ((scheduleType === 'daily' || scheduleType === 'weekly') && !derivedReleaseTime) {
      setError('Lich hang ngay/hang tuan can nhap gio ra tap moi.');
      setSaving(false);
      return;
    }
    if (scheduleType === 'weekly' && derivedReleaseDay === '') {
      setError('Lich hang tuan can chon ngay phat trong tuan.');
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = {
      slug,
      name: form.name.trim(),
      origin_name: form.origin_name.trim(),
      title_vi: finalTitleVi,
      title_en: form.title_en.trim(),
      title_zh: form.title_zh.trim(),
      title_original: form.title_original.trim() || form.origin_name.trim() || form.name.trim(),
      normalized_name: normalizedName,
      content: form.content.trim(),
      type: form.type,
      status: form.status,
      year: form.year ? Number(form.year) : 0,
      quality: form.quality,
      lang: form.lang,
      time: form.time.trim(),
      episode_current: finalEpisodeCurrent,
      episode_total: finalEpisodeTotal,
      current_episode: currentEpisodeNum,
      total_episodes: totalEpisodesNum,
      schedule_type: hasCountdown ? scheduleType : null,
      release_time: scheduleType === 'daily' || scheduleType === 'weekly' ? derivedReleaseTime : null,
      release_day: scheduleType === 'weekly' && derivedReleaseDay !== '' ? Number(derivedReleaseDay) : null,
      schedule_timezone: 'Asia/Ho_Chi_Minh',
      release_at: datetimeLocalToIso(form.release_at),
      next_episode_at: datetimeLocalToIso(form.next_episode_at),
      next_episode_name: hasCountdown ? nextEpisodeName : '',
      schedule_note: form.schedule_note.trim(),
      thumb_url: form.thumb_url.trim(),
      poster_url: form.poster_url.trim(),
      trailer_url: form.trailer_url.trim(),
      actor: form.actor.trim()
        ? form.actor.split(',').map((c) => c.trim()).filter(Boolean)
        : [],
      director: form.director.trim()
        ? form.director.split(',').map((c) => c.trim()).filter(Boolean)
        : [],
      category: buildCategoryArray(finalCategoryText),
      country: buildCountryArray(form.country),
      source_url: '',
      source_site: form.is_queer_universe ? 'admin-queer' : (form.source_site || 'admin'),
      source_name: form.is_queer_universe ? 'Vũ trụ đam mỹ' : 'Admin',
      is_published: form.is_published,
      tmdb_id: tmdbIdNum,
      tmdb_type: form.tmdb_type.trim(),
      last_synced_at: now,
      tmdb_synced_at: now,
      imdb_id: form.imdb_id.trim(),
      vote_average: form.vote_average.trim() ? Number(form.vote_average.trim()) : null,
      ophim_id: form.ophim_id.trim(),
      ophim_slug: form.ophim_slug.trim(),
      updated_at: now,
    };
    if (!form.is_queer_universe) {
      payload.source_name = form.source_name || 'Admin';
    }

    let resultId: string | null = savedMovie?.id || null;
    let returnedMovie: SavedMovie | null = null;
    const token = getAdminToken();
    if (!token) {
      setError('Phiên đăng nhập admin đã hết hạn. Vui lòng đăng nhập lại.');
      setSaving(false);
      return;
    }

    if (resultId) {
      // UPDATE existing movie via edge function
      const { created_at: _c, ...updatePayload } = payload;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-movie-upsert`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'update', id: resultId, movie: updatePayload }),
          }
        );
        const data = (await res.json()) as { success?: boolean; error?: string; movie?: SavedMovie };
        if (!res.ok || !data.success) {
          setError('Lỗi cập nhật phim: ' + (data.error || res.statusText));
          setSaving(false);
          return;
        }
        returnedMovie = data.movie || null;
        resultId = data.movie?.id || resultId;
      } catch (e) {
        setError('Lỗi kết nối khi cập nhật phim: ' + String(e));
        setSaving(false);
        return;
      }
    } else {

      payload.created_at = now;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/admin-movie-upsert`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'insert', movie: payload }),
          }
        );
        const data = (await res.json()) as { success?: boolean; error?: string; movie?: SavedMovie; action?: string };
        if (!res.ok || !data.success || !data.movie?.id) {
          setError(data.error || 'Lỗi khi lưu phim');
          setSaving(false);
          return;
        }
        returnedMovie = data.movie;
        resultId = data.movie.id;
        if (data.action === 'dedup_update') {
          setIsExistingMovieLoaded(true);
          setExistingMovieEpisodes(form.episode_current.trim());
        }
      } catch (e) {
        setError('Lỗi kết nối khi lưu phim: ' + String(e));
        setSaving(false);
        return;
      }
    }

    if (!resultId) {
      setError('Không xác định được ID phim sau khi lưu');
      setSaving(false);
      return;
    }

    clearSearchCacheLocal();

    const saved: SavedMovie = {
      id: resultId,
      slug: returnedMovie?.slug || slug,
      name: returnedMovie?.name || form.name.trim(),
      poster_url: returnedMovie?.poster_url || form.poster_url.trim() || form.thumb_url.trim(),
      thumb_url: returnedMovie?.thumb_url || form.thumb_url.trim(),
      type: returnedMovie?.type || form.type,
    };
    setSavedMovie(saved);
    setForm((prev) => ({
      ...prev,
      slug: saved.slug,
      name: saved.name,
      poster_url: saved.poster_url || prev.poster_url,
      thumb_url: saved.thumb_url || prev.thumb_url,
      type: saved.type || prev.type,
    }));

    const verify = await verifyMovie(resultId);
    setVerification(verify);
    setSaving(false);
  };

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 text-white text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-red-500/40 placeholder-white/15';
  const labelCls = 'text-white/40 text-[11px] mb-1.5 block';
  const selectCls = 'w-full bg-white/[0.04] border border-white/10 text-white text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-red-500/40 appearance-none';

  return (
    <div className="space-y-6">
      {/* ═══ Unified Search ═══ */}
      <div className="bg-[#131521] border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-amber-500/15">
            <i className="ri-search-2-line text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">Tìm phim</h3>
            <p className="text-white/30 text-xs">Tìm trong web trước, sau đó tìm TMDB nếu chưa có</p>
          </div>
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchInputChange(e.target.value)}
            placeholder="Nhập tên phim, slug, hoặc TMDB ID..."
            className={`${inputCls} pl-10`}
          />
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
            {searchLoading ? <i className="ri-loader-4-line animate-spin text-sm" /> : <i className="ri-search-line text-sm" />}
          </div>
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setDbResults([]); setApiResults([]); setTmdbResults([]); setDuplicateWarning(null); resetMergeSelection(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-sm" />
            </button>
          )}
        </div>

        {searchError && (
          <p className="text-amber-400 text-xs mt-2 flex items-center gap-1"><i className="ri-error-warning-line" />{searchError}</p>
        )}

        {/* Duplicate warning banner */}
        {duplicateWarning && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <i className="ri-alert-line text-amber-400 text-lg flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-amber-400 text-sm font-semibold">
                  Phim "{duplicateWarning.tmdbTitle}" đã tồn tại trong web!
                </p>
                <p className="text-white/40 text-xs mt-1">
                  Slug: <span className="font-mono text-white/60">{duplicateWarning.movie.slug}</span>
                  {duplicateWarning.movie.tmdb_id ? ` · TMDB #${duplicateWarning.movie.tmdb_id}` : ''}
                </p>
                <p className="text-white/35 text-[11px] mt-1">
                  Để tránh trùng dữ liệu, hãy mở bản hiện có hoặc quản lý tập trên đúng phim này.
                </p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => handleOpenDuplicate(duplicateWarning.movie)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 rounded-lg text-white text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-external-link-line mr-1" /> Mở bản hiện có
                  </button>
                  <button
                    onClick={() => handleManageEpisodesDirect(duplicateWarning.movie)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white text-xs transition-all cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-stack-line mr-1" /> Quản lý tập
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Group A: Already in DB ═══ */}
        {dbResults.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <h4 className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Phim đã có trong web</h4>
              <span className="text-white/20 text-[10px]">({dbResults.length})</span>
            </div>
            <div className="mb-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.08] px-3 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-cyan-200 text-xs font-bold">Gộp phim trùng</p>
                  <p className="text-white/35 text-[11px] mt-0.5">
                    Chọn 1 phim chính, rồi tick các phim phụ cần gộp vào phim chính đó.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleMergeDuplicates}
                  disabled={mergeSaving}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition-colors ${
                    mergeTargetId && mergeSourceIds.length > 0
                      ? 'bg-cyan-400 text-[#061016] hover:bg-cyan-300'
                      : 'bg-white/[0.08] text-white/45 hover:bg-white/[0.12] hover:text-white/70'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {mergeSaving ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-git-merge-line" />}
                  Gộp {mergeSourceIds.length || ''} phim
                </button>
              </div>
              {mergeTargetId && (
                <p className="mt-2 text-[11px] text-white/45">
                  Phim chính: <span className="font-mono text-cyan-200">{dbResults.find((movie) => movie.id === mergeTargetId)?.slug}</span>
                </p>
              )}
              {!mergeTargetId && (
                <p className="mt-2 text-[11px] text-amber-300/80">
                  Bấm “Phim chính” trên dòng muốn giữ lại trước.
                </p>
              )}
              {mergeTargetId && mergeSourceIds.length === 0 && (
                <p className="mt-2 text-[11px] text-amber-300/80">
                  Tick “Gộp vào” ở ít nhất một phim phụ. Nếu chỉ có 1 kết quả, hãy tìm bằng tên/slug khác để hiện bản trùng.
                </p>
              )}
              {mergeMsg && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                  <i className="ri-checkbox-circle-line" /> {mergeMsg}
                </p>
              )}
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {dbResults.map((m) => (
                <div
                  key={m.id}
                  className="w-full flex items-center gap-3 bg-[#0d0f18] border border-white/[0.06] hover:border-emerald-500/30 rounded-xl p-3 transition-all group"
                >
                  {m.thumb_url ? (
                    <img src={m.thumb_url} alt={m.name} className="w-12 h-[72px] rounded-lg object-cover flex-shrink-0 bg-white/[0.03]" loading="lazy" />
                  ) : (
                    <div className="w-12 h-[72px] rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0">
                      <i className="ri-movie-line text-white/10" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-xs font-medium truncate">{m.name}</p>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">Đã có trong web</span>
                    </div>
                    <p className="text-white/30 text-[10px] mt-0.5">Slug: <span className="font-mono text-white/40">{m.slug}</span></p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] bg-white/[0.06] text-white/40 px-1.5 py-0.5 rounded">{m.type === 'phim-bo' ? 'Phim bộ' : m.type === 'phim-le' ? 'Phim lẻ' : m.type}</span>
                      {m.tmdb_id && <span className="text-[10px] bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded">TMDB #{m.tmdb_id}</span>}
                      {m.episode_current && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">{m.episode_current}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.is_published ? 'bg-emerald-500/10 text-emerald-400' : 'bg-orange-500/10 text-orange-400'}`}>
                        {m.is_published ? 'Đã xuất bản' : 'Chưa xuất bản'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSetMergeTarget(m)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                        mergeTargetId === m.id
                          ? 'bg-cyan-400 text-[#061016]'
                          : 'bg-cyan-400/10 hover:bg-cyan-400/20 border border-cyan-400/20 text-cyan-200'
                      }`}
                    >
                      <i className="ri-focus-3-line mr-1" /> Phim chính
                    </button>
                    <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] transition-all ${
                      mergeSourceIds.includes(m.id)
                        ? 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200'
                        : 'border-white/10 bg-white/5 text-white/45'
                    } ${mergeTargetId === m.id ? 'opacity-40' : 'cursor-pointer hover:text-white'}`}>
                      <input
                        type="checkbox"
                        checked={mergeSourceIds.includes(m.id)}
                        disabled={mergeTargetId === m.id}
                        onChange={() => handleToggleMergeSource(m)}
                        className="h-3.5 w-3.5 accent-cyan-400"
                      />
                      Gộp vào
                    </label>
                    <button
                      onClick={() => handleSelectDbMovie(m)}
                      className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 rounded-lg text-emerald-400 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-pencil-line mr-1" /> Sửa phim
                    </button>
                    <button
                      onClick={() => handleManageEpisodesDirect(m)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/50 hover:text-white text-[11px] transition-all cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-stack-line mr-1" /> Quản lý tập
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Group B: TMDB results ═══ */}
        {apiResults.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <h4 className="text-amber-400 text-xs font-bold uppercase tracking-wider">Kết quả từ API phim</h4>
              <span className="text-white/20 text-[10px]">({apiResults.length})</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {apiResults.map((item) => {
                const displayTitle = item.name || item.title_vi || item.origin_name || item.slug;
                const subTitle = item.origin_name && item.origin_name !== displayTitle ? item.origin_name : '';
                return (
                  <button
                    key={apiMovieKey(item)}
                    type="button"
                    onClick={() => handleSelectApiMovie(item)}
                    className="group text-left bg-[#0d0f18] border border-white/[0.06] hover:border-amber-500/35 rounded-xl overflow-hidden transition-all cursor-pointer"
                  >
                    <div className="aspect-[2/3] bg-white/[0.03] relative overflow-hidden">
                      {item.thumb_url || item.poster_url ? (
                        <img src={item.thumb_url || item.poster_url} alt={displayTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/10">
                          <i className="ri-image-line text-2xl" />
                        </div>
                      )}
                      <div className="absolute top-1.5 left-1.5 bg-black/65 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[10px] text-amber-200 font-medium">
                        {externalSourceLabel(item)}
                      </div>
                      {item.episode_current && (
                        <div className="absolute bottom-1.5 left-1.5 bg-black/65 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[10px] text-white/80">
                          {item.episode_current}
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-white text-xs font-medium line-clamp-2 leading-snug">{displayTitle}</p>
                      {subTitle && <p className="text-white/30 text-[10px] mt-0.5 truncate italic">{subTitle}</p>}
                      <p className="text-white/25 text-[10px] mt-0.5">{item.year ? String(item.year) : item.slug}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tmdbResults.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <h4 className="text-sky-400 text-xs font-bold uppercase tracking-wider">Kết quả từ TMDB</h4>
              <span className="text-white/20 text-[10px]">({tmdbResults.length})</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {tmdbResults.map((item) => {
                const displayTitle = item.title || '';
                const subTitle = item.originalTitle && item.originalTitle !== displayTitle ? item.originalTitle : '';
                return (
                  <button
                    key={`${item.mediaType}-${item.id}`}
                    onClick={() => handleSelectTmdbMovie(item)}
                    className="group text-left bg-[#0d0f18] border border-white/[0.06] hover:border-sky-500/30 rounded-xl overflow-hidden transition-all cursor-pointer"
                  >
                    <div className="aspect-[2/3] bg-white/[0.03] relative overflow-hidden">
                      {item.posterUrl ? (
                        <img src={item.posterUrl} alt={displayTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/10">
                          <i className="ri-image-line text-2xl" />
                        </div>
                      )}
                      <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[10px] text-white/80 font-medium">
                        {item.rating > 0 ? item.rating.toFixed(1) : '—'}
                      </div>
                      <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[10px] text-white/60">
                        {item.mediaType === 'tv' ? 'TV' : 'Movie'}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="text-white text-xs font-medium line-clamp-2 leading-snug">{displayTitle}</p>
                      {subTitle && subTitle !== displayTitle && (
                        <p className="text-white/30 text-[10px] mt-0.5 truncate italic">{subTitle}</p>
                      )}
                      <p className="text-white/25 text-[10px] mt-0.5">{item.year ? String(item.year) : ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TMDB empty / fallback state */}
        {searchQuery && !searchLoading && apiResults.length === 0 && tmdbResults.length === 0 && !duplicateWarning && !searchError && dbResults.length > 0 && (
          <div className="mt-3 text-center py-3 border border-dashed border-white/[0.06] rounded-xl">
            <p className="text-white/20 text-xs">Không tìm thấy thêm phim nào trên TMDB</p>
          </div>
        )}

        {searchQuery && !searchLoading && dbResults.length === 0 && apiResults.length === 0 && tmdbResults.length === 0 && !duplicateWarning && (
          <div className="mt-4 text-center py-6">
            <i className="ri-search-line text-white/10 text-2xl mb-2" />
            <p className="text-white/25 text-xs">Không tìm thấy kết quả nào</p>
          </div>
        )}
      </div>

      {/* ═══ Movie Form ═══ */}
      {form.name && (
        <div className="bg-[#131521] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-500/15">
              <i className="ri-movie-2-line text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">{isExistingMovieLoaded ? 'Sửa thông tin phim' : 'Thông tin phim mới'}</h3>
              <p className="text-white/30 text-xs">
                {isExistingMovieLoaded
                  ? 'Phim đã có trong hệ thống — mọi thay đổi sẽ được cập nhật ngay'
                  : 'Dữ liệu từ TMDB — có thể chỉnh sửa trước khi lưu'}
              </p>
            </div>
          </div>

          {isExistingMovieLoaded && (
            <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <i className="ri-checkbox-circle-line text-emerald-400 text-sm" />
                <p className="text-emerald-400 text-xs font-semibold">
                  Phim đã có trong hệ thống{existingMovieEpisodes ? ` — ${existingMovieEpisodes}` : ''}
                </p>
              </div>
              <p className="text-white/30 text-[11px] mt-0.5">
                Bạn có toàn quyền sửa: tên, poster, mô tả, thể loại, trạng thái, tập phim...
              </p>
            </div>
          )}

          {form.thumb_url && (
            <div className="flex gap-4 mb-5">
              <div className="w-24 sm:w-32 flex-shrink-0">
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06]">
                  <img src={form.thumb_url} alt="poster" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-white font-bold text-sm">{form.name}</p>
                {form.title_en && form.title_en !== form.name && <p className="text-white/50 text-xs">{form.title_en}</p>}
                <p className="text-white/30 text-xs">{form.origin_name}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.year && <span className="text-[10px] bg-white/[0.06] text-white/50 px-2 py-0.5 rounded-md">{form.year}</span>}
                  {form.quality && <span className="text-[10px] bg-white/[0.06] text-white/50 px-2 py-0.5 rounded-md">{form.quality}</span>}
                  {form.vote_average && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md">⭐ {Number(form.vote_average).toFixed(1)}</span>}
                  {form.tmdb_id && <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-md">TMDB #{form.tmdb_id}</span>}
                </div>
                {form.category && <p className="text-white/30 text-[10px] mt-1">{form.category}</p>}
              </div>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className={labelCls}>Slug URL <span className="text-red-400">*</span></label>
              <div className="flex gap-2">
                <input type="text" value={form.slug} onChange={(e) => update('slug', e.target.value)} placeholder="ten-phim-khong-dau" className={`${inputCls} flex-1`} />
                <button onClick={() => checkSlugInternal(form.slug)} disabled={checking || !form.slug.trim()} className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/50 hover:text-white text-xs transition-all cursor-pointer whitespace-nowrap disabled:opacity-30">
                  {checking ? <i className="ri-loader-4-line animate-spin" /> : <><i className="ri-shield-check-line" /> Kiểm tra</>}
                </button>
              </div>
              {slugError && <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1"><i className="ri-error-warning-line" />{slugError}</p>}
              <p className="text-white/20 text-[10px] mt-1">Dùng chữ thường, số, dấu gạch ngang. VD: nha-co-mot-nang-dau</p>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-3">
              <p className="text-white/40 text-[11px] font-medium uppercase tracking-wider mb-2">Tên phim đa ngôn ngữ</p>
              <div>
                <label className={labelCls}>Tên tiếng Việt <span className="text-white/20">(title_vi)</span></label>
                <input type="text" value={form.title_vi} onChange={(e) => update('title_vi', e.target.value)} placeholder="Tên tiếng Việt" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tên tiếng Anh <span className="text-white/20">(title_en) <span className="text-red-400">*</span></span></label>
                <input type="text" value={form.title_en} onChange={(e) => update('title_en', e.target.value)} placeholder="Tên tiếng Anh" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tên tiếng Trung <span className="text-white/20">(title_zh)</span></label>
                <input type="text" value={form.title_zh} onChange={(e) => update('title_zh', e.target.value)} placeholder="Tên tiếng Trung (nếu có)" className={inputCls} />
              </div>
              <p className="text-white/20 text-[10px]">Frontend ưu tiên: Tiếng Việt → Tiếng Anh → Tên gốc</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Tên hiển thị <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Tên tiếng Việt hoặc tên tốt nhất" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tên gốc (origin_name)</label>
                <input type="text" value={form.origin_name} onChange={(e) => update('origin_name', e.target.value)} placeholder="Tên tiếng Anh / gốc" className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Mô tả</label>
              <textarea value={form.content} onChange={(e) => update('content', e.target.value)} placeholder="Mô tả nội dung phim..." rows={4} className={`${inputCls} resize-none`} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Loại</label>
                <select value={form.type} onChange={(e) => update('type', e.target.value)} className={selectCls}>
                  {TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Trạng thái</label>
                <select value={form.status} onChange={(e) => update('status', e.target.value)} className={selectCls}>
                  {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Năm</label>
                <input type="number" value={form.year} onChange={(e) => update('year', e.target.value === '' ? '' : Number(e.target.value))} placeholder="2026" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Chất lượng</label>
                <select value={form.quality} onChange={(e) => update('quality', e.target.value)} className={selectCls}>
                  {QUALITY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Ngôn ngữ</label>
                <select value={form.lang} onChange={(e) => update('lang', e.target.value)} className={selectCls}>
                  {LANG_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Thời lượng</label>
                <input type="text" value={form.time} onChange={(e) => update('time', e.target.value)} placeholder="120 phút" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tập hiện tại</label>
                <input type="text" value={form.episode_current} onChange={(e) => update('episode_current', e.target.value)} placeholder="Tập 10 / Full" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tổng số tập</label>
                <input type="text" value={form.episode_total} onChange={(e) => update('episode_total', e.target.value)} placeholder="24" className={inputCls} />
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                    <i className="ri-timer-flash-line" />
                    Countdown lịch chiếu
                  </p>
                  <p className="text-white/35 text-xs mt-1">
                    Để trống thời gian nếu muốn tắt countdown. Phim Full hoặc đã đủ tập sẽ tự không hiện countdown.
                  </p>
                </div>
                {(form.schedule_type || form.release_time || form.release_day || form.release_at || form.next_episode_at || form.next_episode_name || form.schedule_note) && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, schedule_type: '', release_time: '', release_day: '', release_at: '', next_episode_at: '', next_episode_name: '', schedule_note: '' }))}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-white/55 hover:text-white text-xs cursor-pointer"
                  >
                    Tắt lịch
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Current episode</label>
                  <input type="number" min="0" value={form.current_episode} onChange={(e) => update('current_episode', e.target.value)} placeholder="8" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Total episodes</label>
                  <input type="number" min="0" value={form.total_episodes} onChange={(e) => update('total_episodes', e.target.value)} placeholder="12" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Kiểu lịch</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SCHEDULE_TYPES.filter((o) => o.value).map((o) => {
                      const active = form.schedule_type === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => update('schedule_type', o.value)}
                          className={`h-10 rounded-lg border px-2 text-xs font-bold transition-all cursor-pointer ${
                            active
                              ? 'border-amber-400 bg-amber-400 text-black'
                              : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={form.schedule_type && form.schedule_type !== 'custom' ? '' : 'hidden'}><label className={labelCls}>Gio ra tap moi</label><input type="time" value={form.release_time} onChange={(e) => update('release_time', e.target.value)} className={inputCls} /></div>
              </div>
              {form.schedule_type === 'weekly' && (
                <div>
                  <label className={labelCls}>Ngày phát trong tuần</label>
                  <select value={form.release_day} onChange={(e) => update('release_day', e.target.value)} className={selectCls}>
                    <option value="">Chọn ngày</option>
                    {RELEASE_DAYS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="hidden"><input type="hidden" value={form.release_at} onChange={(e) => update('release_at', e.target.value)} /></div>
                <div className={form.schedule_type === 'custom' ? '' : 'hidden'}><label className={labelCls}>Ngay gio ra tap tiep theo</label><input type="datetime-local" value={form.next_episode_at} onChange={(e) => update('next_episode_at', e.target.value)} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Tên tập sẽ ra</label>
                  <input type="text" value={form.next_episode_name} onChange={(e) => update('next_episode_name', e.target.value)} placeholder="Tập 8" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Ghi chú lịch chiếu</label>
                  <input type="text" value={form.schedule_note} onChange={(e) => update('schedule_note', e.target.value)} placeholder="Ví dụ: phát tối thứ 6 hàng tuần" className={inputCls} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Ảnh thumbnail (poster)</label>
                <input type="text" value={form.thumb_url} onChange={(e) => update('thumb_url', e.target.value)} placeholder="https://..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ảnh backdrop</label>
                <input type="text" value={form.poster_url} onChange={(e) => update('poster_url', e.target.value)} placeholder="https://..." className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Trailer URL</label>
              <input type="text" value={form.trailer_url} onChange={(e) => update('trailer_url', e.target.value)} placeholder="https://www.youtube.com/embed/..." className={inputCls} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Diễn viên <span className="text-white/20">(cách bằng dấu phẩy)</span></label>
                <input type="text" value={form.actor} onChange={(e) => update('actor', e.target.value)} placeholder="Leonardo DiCaprio, Kate Winslet" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Đạo diễn <span className="text-white/20">(cách bằng dấu phẩy)</span></label>
                <input type="text" value={form.director} onChange={(e) => update('director', e.target.value)} placeholder="Christopher Nolan" className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Thể loại <span className="text-white/20">(cách bằng dấu phẩy)</span></label>
                <input type="text" value={form.category} onChange={(e) => update('category', e.target.value)} placeholder="Hành động, Tình cảm" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Quốc gia <span className="text-white/20">(cách bằng dấu phẩy)</span></label>
                <input type="text" value={form.country} onChange={(e) => update('country', e.target.value)} placeholder="Mỹ, Hàn Quốc" className={inputCls} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="pub" type="checkbox" checked={form.is_published} onChange={(e) => update('is_published', e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 text-red-500 accent-red-500 cursor-pointer" />
              <label htmlFor="pub" className="text-white/50 text-xs cursor-pointer">Xuất bản ngay (hiển thị trên web)</label>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4 cursor-pointer">
              <input
                id="queer-universe"
                type="checkbox"
                checked={form.is_queer_universe}
                onChange={(e) => update('is_queer_universe', e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-cyan-300/30 bg-white/5 text-cyan-400 accent-cyan-400 cursor-pointer"
              />
              <span>
                <span className="flex items-center gap-2 text-cyan-200 text-xs font-bold">
                  <i className="ri-heart-3-line" />
                  Thêm vào Vũ trụ đam mỹ / BL / GL
                </span>
                <span className="mt-1 block text-white/42 text-xs leading-relaxed">
                  Khi bật, phim sẽ tự gắn tag BL / GL, Đam mỹ, Bách hợp và được đưa vào nguồn Vũ trụ đam mỹ.
                </span>
              </span>
            </label>

            <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <i className="ri-refresh-line text-sky-400 text-sm" />
                <p className="text-sky-400 text-xs font-semibold">ID đồng bộ & định danh</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>TMDB ID</label>
                  <input type="text" value={form.tmdb_id} onChange={(e) => update('tmdb_id', e.target.value)} placeholder="VD: 550" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>IMDb ID</label>
                  <input type="text" value={form.imdb_id} onChange={(e) => update('imdb_id', e.target.value)} placeholder="VD: tt0137523" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>OPhim / KKPhim ID</label>
                  <input type="text" value={form.ophim_id} onChange={(e) => update('ophim_id', e.target.value)} placeholder="VD: song-trinh hoặc 8899 hoặc 12345" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>OPhim Slug <span className="text-white/20">(CJK slug)</span></label>
                  <input type="text" value={form.ophim_slug} onChange={(e) => update('ophim_slug', e.target.value)} placeholder="VD: 伪钞重案" className={inputCls} />
                </div>
              </div>
              <p className="text-white/20 text-[10px]">Nhập ID để hệ thống tự động đồng bộ và tránh tạo phim trùng lặp.</p>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                <i className="ri-error-warning-line" /> {error}
              </div>
            )}

            {verification && (
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
                <i className="ri-checkbox-circle-line" />
                Verification: movies={verification.movies ? 'OK' : 'MISSING'}, episodes={verification.episodes}, streams={verification.streams}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={saving || !!slugError}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
              >
                {saving ? <><i className="ri-loader-4-line animate-spin" /> Đang lưu...</> : <><i className="ri-save-line" /> {isExistingMovieLoaded ? 'Cập nhật phim' : 'Lưu phim'}</>}
              </button>
              {isExistingMovieLoaded && savedMovie && (
                <button
                  onClick={handleManageEpisodes}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-stack-line" /> Quản lý tập
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Saved Movie Preview ═══ */}
      {savedMovie && (
        <div className="bg-[#131521] border border-emerald-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-500/15">
              <i className="ri-checkbox-circle-line text-emerald-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Phim đã lưu</h3>
              <p className="text-white/30 text-xs">Sẵn sàng thêm tập và link phát</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            {savedMovie.thumb_url && (
              <div className="w-16 h-24 rounded-lg overflow-hidden bg-white/[0.03] flex-shrink-0">
                <img src={savedMovie.thumb_url} alt="poster" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">{savedMovie.name}</p>
              <p className="text-white/30 text-xs mt-0.5">ID: <span className="font-mono text-white/50">{savedMovie.id}</span></p>
              <p className="text-white/30 text-xs">Slug: <span className="font-mono text-white/50">{savedMovie.slug}</span></p>
              {verification && (
                <p className="text-white/30 text-xs mt-1">
                  DB: movies={verification.movies ? '✓' : '✗'} | episodes={verification.episodes} | streams={verification.streams}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => onDone(savedMovie)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
          >
            <i className="ri-stack-line" />
            {isExistingMovieLoaded ? 'Thêm tập / link phát ngay' : 'Thêm tập / link phát'}
          </button>
        </div>
      )}
    </div>
  );
}
