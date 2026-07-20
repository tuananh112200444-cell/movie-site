import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Fuse from 'fuse.js';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MovieCard from '@/components/base/MovieCard';
import AudioLanguageBadges from '@/components/base/AudioLanguageBadges';
import SEO, { SITE_URL } from '@/components/base/SEO';
import SearchResultItem from './components/SearchResultItem';
import SearchFilterBar from './components/SearchFilterBar';
import type { MovieItem } from '@/types/movie';
import { applyImageElementFallback, searchMovies, fetchNewMovies, fetchTrendingMovies, getOptimizedImageUrl, fetchSupabaseSearchIndex, searchMoviesInSupabase } from '@/services/movieApi';
import {
  mergeMoviesUnique,
  parseMovieYear,
  sortMoviesForSearch,
  type SearchSortMode,
} from '@/utils/searchRanking';
import { setSmartSessionCache } from '@/utils/smartCache';
import { getAudioLanguageLabels } from '@/utils/audioLanguage';

type ViewMode = 'grid' | 'list';
type SortMode = SearchSortMode;

const FALLBACK_SUPABASE_URL = 'https://dzpddbthdeqbkrcjlzap.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_Mqk6aVxJjetKY8St_20QWA_Wc2zxBd0';

const HOT_SEARCHES = [
  { label: 'Avengers', icon: 'ri-shield-star-line' },
  { label: 'Squid Game', icon: 'ri-gamepad-line' },
  { label: 'One Piece', icon: 'ri-anchor-line' },
  { label: 'Doraemon', icon: 'ri-robot-line' },
  { label: 'Parasite', icon: 'ri-bug-line' },
  { label: 'Naruto', icon: 'ri-fire-line' },
  { label: 'Interstellar', icon: 'ri-planet-line' },
  { label: 'Hương Mật', icon: 'ri-heart-line' },
];

const SORT_OPTIONS: { label: string; value: SortMode; icon: string }[] = [
  { label: 'Phù hợp nhất', value: 'relevance', icon: 'ri-search-line' },
  { label: 'Mới nhất', value: 'newest', icon: 'ri-time-line' },
  { label: 'Năm mới', value: 'year_desc', icon: 'ri-calendar-line' },
  { label: 'Năm cũ', value: 'year_asc', icon: 'ri-history-line' },
  { label: 'Tên A-Z', value: 'name_asc', icon: 'ri-sort-asc' },
];

const QUICK_CATEGORIES = [
  { label: 'Phim Hàn', href: '/phim-han-quoc', icon: '🇰🇷', color: 'from-pink-500/20 to-rose-500/10 border-pink-500/20 hover:border-pink-500/40' },
  { label: 'Phim Trung', href: '/phim-trung-quoc', icon: '🇨🇳', color: 'from-red-500/20 to-orange-500/10 border-red-500/20 hover:border-red-500/40' },
  { label: 'Phim Âu Mỹ', href: '/phim-au-my', icon: '🇺🇸', color: 'from-sky-500/20 to-blue-500/10 border-sky-500/20 hover:border-sky-500/40' },
  { label: 'Anime', href: '/phim-nhat-ban', icon: '🇯🇵', color: 'from-rose-500/20 to-pink-500/10 border-rose-500/20 hover:border-rose-500/40' },
  { label: 'Phim Lẻ', href: '/phim-le', icon: 'ri-film-line', color: 'from-amber-500/20 to-yellow-500/10 border-amber-500/20 hover:border-amber-500/40', isIcon: true },
  { label: 'Phim Bộ', href: '/phim-bo', icon: 'ri-tv-2-line', color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/20 hover:border-emerald-500/40', isIcon: true },
  { label: 'Chiếu Rạp', href: '/phim-chieu-rap', icon: 'ri-movie-2-line', color: 'from-violet-500/20 to-purple-500/10 border-violet-500/20 hover:border-violet-500/40', isIcon: true },
  { label: 'Hoạt Hình', href: '/hoat-hinh', icon: 'ri-gamepad-line', color: 'from-teal-500/20 to-cyan-500/10 border-teal-500/20 hover:border-teal-500/40', isIcon: true },
];

function escapeRestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[(),*]/g, ' ').trim();
}

async function fetchDirectAliasResults(keyword: string): Promise<MovieItem[]> {
  const supabaseUrl =
    (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    FALLBACK_SUPABASE_URL;
  const anonKey =
    (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    FALLBACK_SUPABASE_ANON_KEY;
  const kw = keyword.trim();
  if (!supabaseUrl || !anonKey || kw.length < 2) return [];

  const normalized = normalizeSearchText(kw);
  const safeKw = escapeRestIlike(kw);
  const safeNormalized = escapeRestIlike(normalized);
  const safeSlug = escapeRestIlike(normalized.replace(/\s+/g, '-'));
  const filters = Array.from(new Set([
    `origin_name.ilike.*${safeKw}*`,
    `title_en.ilike.*${safeKw}*`,
    `title_original.ilike.*${safeKw}*`,
    `normalized_name.ilike.*${safeKw}*`,
    `slug.ilike.*${safeSlug}*`,
    `origin_name.ilike.*${safeNormalized}*`,
    `title_en.ilike.*${safeNormalized}*`,
    `title_original.ilike.*${safeNormalized}*`,
    `normalized_name.ilike.*${safeNormalized}*`,
    `normalized_name.ilike.*${safeSlug}*`,
  ])).join(',');

  const url = new URL(`${supabaseUrl}/rest/v1/movies`);
  url.searchParams.set('select', 'id,slug,name,origin_name,title_vi,title_en,title_zh,title_original,normalized_name,thumb_url,poster_url,type,year,quality,lang,episode_current,episode_total,current_episode,total_episodes,category,country,updated_at,source_site,source_name');
  url.searchParams.set('is_published', 'eq.true');
  url.searchParams.set('or', `(${filters})`);
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', '24');

  const res = await fetch(url.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  if (!res.ok) return [];
  const rows = await res.json() as Array<Record<string, any>>;
  return rows.map((m) => ({
    _id: String(m.id || ''),
    slug: String(m.slug || ''),
    name: String(m.name || m.title_vi || m.title_en || m.origin_name || ''),
    origin_name: String(m.origin_name || ''),
    title_vi: m.title_vi || undefined,
    title_en: m.title_en || undefined,
    title_zh: m.title_zh || undefined,
    title_original: m.title_original || undefined,
    normalized_name: m.normalized_name || undefined,
    thumb_url: String(m.thumb_url || m.poster_url || ''),
    poster_url: String(m.poster_url || ''),
    type: String(m.type || 'phim-bo'),
    sub_docquyen: false,
    chieurap: false,
    time: '',
    year: Number(m.year || 0),
    quality: String(m.quality || 'HD'),
    lang: String(m.lang || ''),
    episode_current: String(m.episode_current || ''),
    episode_total: String(m.episode_total || ''),
    current_episode: Number(m.current_episode || 0) || undefined,
    total_episodes: Number(m.total_episodes || 0) || undefined,
    category: Array.isArray(m.category) ? m.category : [],
    country: Array.isArray(m.country) ? m.country : [],
    modified: { time: String(m.updated_at || new Date().toISOString()) },
    source_site: String(m.source_site || 'supabase'),
    source_name: String(m.source_name || 'Supabase'),
  }));
}

function getKnownAliasFallbackResults(keyword: string): MovieItem[] {
  const normalized = normalizeSearchText(keyword);
  const items: MovieItem[] = [];

  if (normalized.includes('my magic prophecy')) {
    items.push({
      _id: 'c1c2adfd-8f7a-4107-90b6-626c27e28c58',
      slug: 'blvietsub-6136-trai-bai-noi-do-la-anh',
      name: 'Trải Bài Nói Đó Là Anh',
      origin_name: 'My Magic Prophecy',
      title_en: 'My Magic Prophecy',
      title_original: 'My Magic Prophecy',
      normalized_name: 'trai-bai-noi-do-la-anh-my-magic-prophecy',
      thumb_url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgcK1nDLrCYoY7Y2dv9bmOkryNXuz2jWsi4fekO0KoUW3QF6YHr-qELTOLHcJ37VH8Z0rhzUYW9a6BRU7U2icZfXL4JKwuIGLmKbAhWJbVyB3ZceAoyvED8XCnkNN0mu5DVvZ6AB8gmwvtEtGoQq9n0ESDdXhoxJZC-VYS1kvsTfrN5auXTmglJDRAYYBw/s320/trai-bai-noi-do-la-anh-mymagic-prophecy-2025.jpeg',
      poster_url: 'https://i.imgur.com/K76O8E8.jpeg',
      type: 'phim-bo',
      sub_docquyen: false,
      chieurap: false,
      time: '',
      year: 2025,
      quality: 'HD',
      lang: 'Vietsub',
      episode_current: 'Tập 10',
      episode_total: '10 Tập',
      current_episode: 10,
      total_episodes: 10,
      category: [],
      country: [],
      modified: { time: new Date().toISOString() },
      source_site: 'blvietsub',
      source_name: 'BLVietsub',
    });
  }

  if (
    normalized.includes('com ga anh trang') ||
    normalized.includes('moonlight chicken')
  ) {
    items.push({
      _id: '76e8d9d1-cc5b-4cc4-94be-279387542f7b',
      slug: 'com-ga-anh-trang',
      name: 'Cơm Gà Ánh Trăng',
      origin_name: 'Moonlight Chicken',
      title_vi: 'Cơm Gà Ánh Trăng',
      title_en: 'Moonlight Chicken',
      title_original: 'Moonlight Chicken',
      normalized_name: 'com ga anh trang moonlight chicken',
      thumb_url: 'https://1.bp.blogspot.com/-2qAkjV11AK0/Y-Si_tQ40PI/AAAAAAAAMNI/DAHj9FskuZcebqWT7ZrOxGLg6DcEop9GwCNcBGAsYHQ/s0/com-ga-anh-trang-moonlight-chicken-2023-cover.jpg',
      poster_url: 'https://1.bp.blogspot.com/-2qAkjV11AK0/Y-Si_tQ40PI/AAAAAAAAMNI/DAHj9FskuZcebqWT7ZrOxGLg6DcEop9GwCNcBGAsYHQ/s0/com-ga-anh-trang-moonlight-chicken-2023-cover.jpg',
      type: 'phim-bo',
      sub_docquyen: false,
      chieurap: false,
      time: '',
      year: 2023,
      quality: 'HD',
      lang: 'Vietsub',
      episode_current: 'Hoàn Tất (8/8)',
      episode_total: '8 Tập',
      current_episode: 8,
      total_episodes: 8,
      category: [],
      country: [],
      modified: { time: new Date().toISOString() },
      source_site: 'blvietsub',
      source_name: 'BLVietsub',
    });
  }

  return items;
}

const VIRTUAL_GENRE_TERMS: Record<string, string[]> = {
};

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getMovieSearchText(movie: MovieItem): string {
  return normalizeSearchText([
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.title_original,
    movie.normalized_name,
    movie.slug,
    movie.episode_current,
    movie.episode_total,
    movie.current_episode ? `tap ${movie.current_episode}` : '',
    movie.total_episodes ? `season ${movie.total_episodes}` : '',
    movie.category?.map((c) => c.name).join(' '),
  ].filter(Boolean).join(' '));
}

function searchResultKey(movie: MovieItem, index: number): string {
  return [
    movie.slug,
    movie._id,
    movie.ophim_id,
    movie.tmdb_id ? `tmdb-${movie.tmdb_id}` : '',
    movie.source_site,
    index,
  ].filter(Boolean).join(':');
}

function getInstantLocalHits(pool: MovieItem[], keyword: string, limit = 12): MovieItem[] {
  const query = normalizeSearchText(keyword.trim());
  if (!query || pool.length === 0) return [];

  const directHits = pool.filter((movie) => getMovieSearchText(movie).includes(query));
  const fuse = new Fuse(pool, {
    keys: ['name', 'origin_name', 'title_vi', 'title_en', 'title_zh', 'slug', 'episode_current', 'episode_total'],
    threshold: 0.32,
    distance: 80,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  const fuzzyHits = fuse.search(keyword.trim()).map((result) => result.item);

  return sortMoviesForSearch(
    mergeMoviesUnique([...directHits, ...fuzzyHits]),
    keyword,
    'relevance'
  ).slice(0, limit);
}
/* ── Search History ── */
const HISTORY_KEY = 'kp_search_history';
const MAX_HISTORY = 10;
const SEARCH_DEBOUNCE_MS = 250;
function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch { return []; }
}

function addToHistory(term: string): void {
  if (!term.trim()) return;
  try {
    const existing = getSearchHistory();
    const cleaned = [term.trim(), ...existing.filter(h => h.toLowerCase() !== term.trim().toLowerCase())].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(cleaned));
  } catch { /* quota */ }
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';

  // ── State ──
  const [query, setQuery] = useState(q);
  const [results, setResults] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [trending, setTrending] = useState<MovieItem[]>([]);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [allLoaded, setAllLoaded] = useState(false);
  const [localPool, setLocalPool] = useState<MovieItem[]>([]);
  const localPoolRef = useRef<MovieItem[]>([]);

  // Filter state
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterAudio, setFilterAudio] = useState('');

  const [suggestions, setSuggestions] = useState<MovieItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sugListRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRunRef = useRef(0);
  const searchIndexLoadRef = useRef<Promise<MovieItem[]> | null>(null);

  useEffect(() => {
    localPoolRef.current = localPool;
  }, [localPool]);

  // ── Effects ──
  useEffect(() => {
    setSearchHistory(getSearchHistory());
    // Defer trending fetch — only if not already in localPool
    if (localPool.length === 0) {
      fetchNewMovies(1).then((d) => setTrending(d.items?.slice(0, 16) ?? []));
    }
  }, []);

  // Preload only lightweight public lists. Supabase search index is loaded lazily on real search intent.
  useEffect(() => {
    Promise.allSettled([fetchNewMovies(1), fetchTrendingMovies()])
      .then(([newResult, trendResult]) => {
        const newItems = newResult.status === 'fulfilled' ? newResult.value.items ?? [] : [];
        const trendItems = trendResult.status === 'fulfilled' ? trendResult.value.items ?? [] : [];
        setLocalPool(mergeMoviesUnique([...newItems, ...trendItems]));
      })
      .catch(() => { /* silently fail */ });
  }, []);

  const ensureSearchIndexLoaded = useCallback(() => {
    if (searchIndexLoadRef.current) return searchIndexLoadRef.current;
    searchIndexLoadRef.current = fetchSupabaseSearchIndex({ limit: 5000 })
      .then((items) => {
        if (items.length > 0) {
          setLocalPool((prev) => {
            const merged = mergeMoviesUnique([...items, ...prev]);
            const prevKeys = new Set(prev.map((movie) => String(movie._id || movie.slug || '')));
            const hasCatalogChange = merged.length !== prev.length || merged.some((movie) => !prevKeys.has(String(movie._id || movie.slug || '')));
            // Returning the previous reference is important: doSearch depends
            // on localPool, so an equivalent new array would restart the
            // search, clear its results and create an index-load loop.
            return hasCatalogChange ? merged : prev;
          });
        }
        return items;
      })
      .finally(() => {
        searchIndexLoadRef.current = null;
      });
    return searchIndexLoadRef.current;
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      searchAbortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // OPTIMIZED: parallel search + cache
  const doSearch = useCallback(async (keyword: string, pg: number) => {
    if (!keyword.trim()) return;
    const runId = ++searchRunRef.current;
    searchAbortRef.current?.abort();
    const searchCtrl = new AbortController();
    searchAbortRef.current = searchCtrl;
    setLoading(true);
    setError('');

    // Check memory cache first (60s TTL for search)
    const normalizedKeyword = keyword.trim();
    const knownAliasItems = pg === 1 ? getKnownAliasFallbackResults(normalizedKeyword) : [];
    const cacheKey = `search_v12_${normalizedKeyword.toLowerCase()}_${pg}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const entry = JSON.parse(cached) as { data: MovieItem[]; totalPages: number; ts: number };
        if (entry.data.length > 0 && Date.now() - entry.ts < 20_000) {
          const cachedItems = pg === 1
            ? sortMoviesForSearch(mergeMoviesUnique([...knownAliasItems, ...entry.data]), normalizedKeyword, 'relevance')
            : entry.data;
          setResults((prev) => pg === 1 ? cachedItems : mergeMoviesUnique([...prev, ...cachedItems]));
          setTotalPages(entry.totalPages);
          setAllLoaded(pg >= entry.totalPages);
          setLoading(false);
          if (searchAbortRef.current === searchCtrl) searchAbortRef.current = null;
          return;
        }
      } catch { /* ignore stale cache */ }
    }

    // Read the latest catalogue through a ref. Depending on localPool here
    // recreated doSearch while the index was loading, which restarted the URL
    // effect and could replace valid mobile results with an empty second run.
    const currentPool = localPoolRef.current;
    const instantItems = pg === 1 && currentPool.length > 0
      ? getInstantLocalHits(currentPool, normalizedKeyword, 16)
      : [];
    const indexPromise = pg === 1
      ? ensureSearchIndexLoaded()
          .then((indexedItems) => {
            if (runId !== searchRunRef.current || searchCtrl.signal.aborted) return;
            const localItems = getInstantLocalHits(indexedItems, normalizedKeyword, 16);
            if (localItems.length === 0) return;
            setError('');
            setResults((prev) => sortMoviesForSearch(mergeMoviesUnique([...prev, ...localItems]), normalizedKeyword, 'relevance'));
          })
          .catch(() => {})
      : Promise.resolve();

    const firstPaintItems = pg === 1
      ? sortMoviesForSearch(mergeMoviesUnique([...knownAliasItems, ...instantItems]), normalizedKeyword, 'relevance')
      : instantItems;

    if (firstPaintItems.length > 0) {
      setResults(firstPaintItems);
      setTotalPages((prev) => Math.max(prev, 1));
      setAllLoaded(false);
    }

    try {
      // Run the direct indexed query beside the multi-source search. The old
      // sequential path could make mobile wait for slow external mirrors
      // before asking Supabase for a result it already had.
      const directSearchPromise = pg === 1
        ? searchMoviesInSupabase(normalizedKeyword, {
            limit: 24,
            timeoutMs: 6000,
            minLength: 2,
            signal: searchCtrl.signal,
          }).catch(() => [])
        : Promise.resolve([]);
      void directSearchPromise.then((directItems) => {
        if (directItems.length === 0 || runId !== searchRunRef.current || searchCtrl.signal.aborted) return;
        setError('');
        setResults((prev) => sortMoviesForSearch(
          mergeMoviesUnique([...(pg === 1 ? knownAliasItems : []), ...prev, ...directItems]),
          normalizedKeyword,
          'relevance',
        ));
      });

      const [apiResult, directSupabaseItems] = await Promise.all([
        searchMovies(normalizedKeyword, pg, searchCtrl.signal)
          .then((value) => ({ status: 'fulfilled' as const, value }))
          .catch((reason) => ({ status: 'rejected' as const, reason })),
        directSearchPromise,
      ]);
      if (runId !== searchRunRef.current) return;

      const apiData = apiResult.status === 'fulfilled'
        ? apiResult.value
        : { items: [], pagination: { currentPage: pg, totalItems: 0, totalItemsPerPage: 24, totalPages: 1 } };
      let items = pg === 1 ? mergeMoviesUnique([...knownAliasItems, ...(apiData.items ?? [])]) : (apiData.items ?? []);

      if (pg === 1 && directSupabaseItems.length > 0) {
        items = mergeMoviesUnique([...items, ...directSupabaseItems]);
      }

      if (pg === 1) {
        const directAliasItems = await fetchDirectAliasResults(normalizedKeyword).catch(() => []);
        if (directAliasItems.length > 0) {
          items = mergeMoviesUnique([...items, ...directAliasItems]);
        }
      }

      if (pg === 1 && items.length < 6) {
        const indexedItems = await ensureSearchIndexLoaded().catch(() => []);
        const indexedHits = getInstantLocalHits(indexedItems, normalizedKeyword, 16);
        if (indexedHits.length > 0) {
          items = mergeMoviesUnique([...items, ...indexedHits]);
        }
      }

      // STEP 2: Merge local index results (searchMovies already includes API, Supabase, and special sources)
      // STEP 3: Fuzzy fallback — only if very few results AND pool loaded
      if (pg === 1 && items.length < 6 && currentPool.length > 0) {
        const fuse = new Fuse(currentPool, {
          keys: ['name', 'origin_name'],
          threshold: 0.3, // stricter = less noise, faster
          distance: 60,
          ignoreLocation: true,
          minMatchCharLength: 1,
        });
        const fuzzyHits = fuse.search(normalizedKeyword).map((r) => r.item);
        items = mergeMoviesUnique([...items, ...fuzzyHits.slice(0, 8)]);
      }
      items = sortMoviesForSearch(mergeMoviesUnique(items), normalizedKeyword, 'relevance');
      // Cache result
      try {
        const totalP = apiData.pagination?.totalPages ?? 1;
        if (items.length > 0) {
          setSmartSessionCache(cacheKey, JSON.stringify({ data: items, totalPages: totalP, ts: Date.now() }));
        }
      } catch { /* quota */ }

      setResults((prev) => {
        if (pg === 1) return items;
        return mergeMoviesUnique([...prev, ...items]);
      });
      setTotalPages(apiData.pagination?.totalPages ?? 1);
      setAllLoaded(pg >= (apiData.pagination?.totalPages ?? 1));
      void indexPromise;
      if (pg === 1 && items.length === 0) setError('Không tìm thấy phim nào cho từ khoá này.');
    } catch {
      if (runId === searchRunRef.current && !searchCtrl.signal.aborted) {
        setError('Không thể kết nối tới kho phim. Vui lòng thử lại.');
      }
    } finally {
      if (runId === searchRunRef.current) {
        setLoading(false);
        if (searchAbortRef.current === searchCtrl) searchAbortRef.current = null;
      }
    }
  }, [ensureSearchIndexLoaded]);

  useEffect(() => {
    if (q) {
      setQuery(q);
      setPage(1);
      setResults([]);
      setAllLoaded(false);
      // Reset filters on new search
      setFilterType('');
      setFilterYear('');
      setFilterGenre('');
      setFilterCountry('');
      setFilterAudio('');
      setSortMode('relevance');
      doSearch(q, 1);
    }
  }, [q, doSearch]);

  const fetchSuggestions = useCallback(async (kw: string) => {
    if (kw.trim().length < 2) {
      setSuggestions([]);
      setHighlightIndex(-1);
      setLoadingSug(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const instantItems = getInstantLocalHits(localPool, kw, 8);
    setSuggestions(instantItems);
    setHighlightIndex(-1);
    setLoadingSug(instantItems.length === 0);
    try {
      let items = instantItems;
      const apiItems = await searchMoviesInSupabase(kw.trim(), { limit: 12, timeoutMs: 1300, minLength: 2, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      items = mergeMoviesUnique([...items, ...apiItems]);

      items = sortMoviesForSearch(mergeMoviesUnique(items), kw.trim(), 'relevance').slice(0, 8);
      if (!ctrl.signal.aborted) {
        setSuggestions(items);
        setHighlightIndex(-1);
      }
      ensureSearchIndexLoaded()
        .then((indexedItems) => {
          if (ctrl.signal.aborted || indexedItems.length === 0) return;
          const indexedHits = getInstantLocalHits(indexedItems, kw, 8);
          if (indexedHits.length === 0) return;
          setSuggestions((prev) => sortMoviesForSearch(mergeMoviesUnique([...prev, ...indexedHits]), kw.trim(), 'relevance').slice(0, 8));
        })
        .catch(() => {});
    } catch {
      if (!ctrl.signal.aborted) setSuggestions([]);
    } finally {
      if (!ctrl.signal.aborted) setLoadingSug(false);
    }
  }, [ensureSearchIndexLoaded, localPool]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setHighlightIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      setShowSuggestions(true);
      const instantItems = getInstantLocalHits(localPool, val, 8);
      setSuggestions(instantItems);
      setLoadingSug(instantItems.length === 0);
      debounceRef.current = setTimeout(() => {
        void fetchSuggestions(val.trim());
      }, SEARCH_DEBOUNCE_MS);
    } else {
      setSuggestions([]);
      setLoadingSug(false);
      setShowSuggestions(true); // Show history/zero-state
    }
  };

  const handleSearchFocus = () => {
    setShowSuggestions(true);
    setHighlightIndex(-1);
    if (query.trim().length > 0) {
      setSuggestions(getInstantLocalHits(localPool, query, 8));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setShowSuggestions(false);
    addToHistory(query.trim());
    setSearchParams({ q: query.trim() });
  };

  const pickSuggestion = (movie: MovieItem) => {
    setQuery(movie.name);
    setShowSuggestions(false);
    addToHistory(movie.name);
    setSearchParams({ q: movie.name });
  };

  const pickHistory = (term: string) => {
    setQuery(term);
    setShowSuggestions(false);
    addToHistory(term);
    setSearchParams({ q: term });
  };

  const removeHistoryItem = (term: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = searchHistory.filter(h => h !== term);
    setSearchHistory(updated);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { /* silently */ }
  };

  // Keyboard navigation
  const totalSugItems = query.trim().length >= 1
    ? suggestions.length + 1 // +1 for "View all"
    : searchHistory.length + HOT_SEARCHES.length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => {
        const next = prev + 1;
        return next >= totalSugItems ? 0 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => {
        const next = prev - 1;
        return next < 0 ? totalSugItems - 1 : next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0) {
        if (query.trim().length >= 1) {
          if (highlightIndex < suggestions.length) {
            const movie = suggestions[highlightIndex];
            if (movie) pickSuggestion(movie);
          } else {
            setShowSuggestions(false);
            addToHistory(query.trim());
            setSearchParams({ q: query.trim() });
          }
        } else {
          const historyCount = searchHistory.length;
          if (highlightIndex < historyCount) {
            const term = searchHistory[highlightIndex];
            if (term) pickHistory(term);
          } else {
            const tag = HOT_SEARCHES[highlightIndex - historyCount];
            if (tag) pickHistory(tag.label);
          }
        }
      } else {
        handleSubmit(e);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightIndex >= 0 && sugListRef.current) {
      const el = sugListRef.current.children[highlightIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightIndex]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    doSearch(q, next);
  };

  // ── Client-side filter & sort ──
  const filteredResults = useMemo(() => {
    let data = [...results];

    // Filter
    if (filterType) {
      data = data.filter((m) => m.type === filterType);
    }
    if (filterYear) {
      data = data.filter((m) => String(parseMovieYear(m)) === filterYear);
    }
    if (filterGenre) {

      const virtualTerms = VIRTUAL_GENRE_TERMS[filterGenre]?.map(normalizeSearchText);
      if (virtualTerms) {
        data = data.filter((m) => virtualTerms.some((term) => getMovieSearchText(m).includes(term)));
      } else {
        data = data.filter((m) => m.category?.some((c) => c.slug === filterGenre));
      }
    }
    if (filterCountry) {
      data = data.filter((m) => m.country?.some((c) => c.slug === filterCountry));
    }
    if (filterAudio) {
      data = data.filter((m) => getAudioLanguageLabels(m.lang).some((item) => item.kind === filterAudio));
    }
    return sortMoviesForSearch(data, q, sortMode);
  }, [results, filterType, filterYear, filterGenre, filterCountry, filterAudio, sortMode, q]);

  const activeFilterCount = [filterType, filterYear, filterGenre, filterCountry, filterAudio].filter(Boolean).length;

  const handleResetFilters = () => {
    setFilterType('');
    setFilterYear('');
    setFilterGenre('');
    setFilterCountry('');
    setFilterAudio('');
  };

  // ── SEO ──
  const searchSchema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang Chủ', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Tìm Kiếm Phim', item: `${SITE_URL}/search` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SearchResultsPage',
      name: q ? `Kết quả tìm kiếm: ${q} – KhoPhim` : 'Tìm Kiếm Phim – KhoPhim',
      url: `${SITE_URL}/search${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      description: q
        ? `Kết quả tìm kiếm phim "${q}" tại KhoPhim. Xem phim online miễn phí HD.`
        : 'Tìm kiếm phim online tại KhoPhim. Hàng nghìn bộ phim chờ bạn khám phá.',
      inLanguage: 'vi',
      isPartOf: {
        '@type': 'WebSite',
        name: 'KhoPhim',
        url: SITE_URL,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    },
  ];

  return (
    <div className="min-h-screen kp-cinema-page text-white">
      <SEO
        title={q ? `Tìm kiếm "${q}" – KhoPhim` : 'Tìm Kiếm Phim – KhoPhim'}
        description={
          q
            ? `Kết quả tìm kiếm phim "${q}" tại KhoPhim. Xem phim online HD miễn phí, cập nhật mới nhất.`
            : 'Tìm kiếm phim online miễn phí tại KhoPhim. Hàng ngàn bộ phim HD vietsub đang chờ bạn khám phá.'
        }
        keywords={q ? `${q}, xem phim online, phim HD, kho phim, ${q} vietsub` : 'tìm kiếm phim, xem phim online, phim hay vietsub, tìm phim theo tên, kho phim HD, khophim'}
        canonical="/search"
        noIndex={true}
        schema={searchSchema}
      />
      <Navbar />

      {/* ── Hero Search Section ── */}
      <div className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/10 via-transparent to-transparent" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(236,180,102,0.10),transparent_65%)]" />


        <div className="relative mx-auto max-w-4xl px-4 pb-7 pt-8 sm:pt-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 mb-6 text-sm justify-center">
            <Link to="/" className="text-white/30 hover:text-white/60 transition-colors">Trang chủ</Link>
            <i className="ri-arrow-right-s-line text-white/20" />
            <span className="text-white/55">Tìm Kiếm</span>
          </nav>

          {/* Title */}
          <div className="text-center mb-8">
            <div className="cinema-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-amber-200/85 mb-4">
              <i className="ri-search-line text-sm" />
              Tìm kiếm trong 50,000+ bộ phim
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">
              {q ? (
                <>Kết quả cho <span className="text-red-400">&ldquo;{q}&rdquo;</span></>
              ) : (
                'Tìm Kiếm Phim'
              )}
            </h1>
            {!q && (
              <p className="text-white/45 text-base">Nhập tên phim, tên gốc, diễn viên hoặc thể loại bạn muốn tìm</p>
            )}
          </div>

          {/* Search bar */}
          <div ref={searchRef} className="relative">
            <form onSubmit={handleSubmit} className="relative group" role="search">
              <div className="cinema-search-shell relative flex items-center overflow-hidden rounded-2xl transition-all">
                <div className="w-10 sm:w-12 h-12 sm:h-14 flex items-center justify-center flex-shrink-0">
                  <i className="ri-search-line text-white/30 text-lg" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleInput}
                  onFocus={handleSearchFocus}
                  onKeyDown={handleKeyDown}
                  placeholder="Tìm tên phim, tên gốc, diễn viên..."
                  autoComplete="off"
                  enterKeyHint="search"
                  className="flex-1 bg-transparent text-white placeholder-white/25 text-base sm:text-base py-3 sm:py-4 pr-4 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Xóa từ khóa tìm kiếm"
                    onClick={() => { setQuery(''); setSuggestions([]); setShowSuggestions(true); inputRef.current?.focus(); }}
                    className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <i className="ri-close-line text-sm" />
                  </button>
                )}
                <button
                  type="submit"
                  aria-label="Tìm kiếm phim"
                  className="m-1.5 sm:m-2 px-3 sm:px-5 h-9 sm:h-10 flex items-center gap-2 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-500 hover:to-amber-500 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  {loadingSug
                    ? <i className="ri-loader-4-line animate-spin" />
                    : <i className="ri-search-line" />}
                  <span className="hidden sm:inline">Tìm kiếm</span>
                </button>
              </div>
            </form>

            {/* Autocomplete dropdown */}
            {showSuggestions && (
              <div
                ref={sugListRef}
                className="cinema-search-shell absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-50 max-h-[420px] overflow-y-auto"
              >
                {/* ── Suggestions (typing >= 2 chars) ── */}
                {query.trim().length >= 1 ? (
                  <>
                    {loadingSug && suggestions.length === 0 && (
                      <div className="flex items-center gap-2 px-4 py-3 text-white/40 text-sm">
                        <i className="ri-loader-4-line animate-spin text-sm" />
                        Đang tìm...
                      </div>
                    )}

                    {!loadingSug && suggestions.length === 0 && (
                      <div className="px-4 py-3 text-white/40 text-sm">
                        Không tìm thấy phim nào — thử tên tiếng Anh hoặc viết tắt
                      </div>
                    )}

                    {suggestions.map((movie, idx) => {
                      const isHighlighted = idx === highlightIndex;
                      const year = parseMovieYear(movie);
                      return (
                        <button
                          key={movie._id}
                          type="button"
                          onClick={() => pickSuggestion(movie)}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer border-b border-white/[0.04] last:border-0 text-left ${
                            isHighlighted ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                            <img
                              src={getOptimizedImageUrl(movie.thumb_url || movie.poster_url, 180, 82)}
                              alt={movie.name}
                              width="40"
                              height="56"
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover object-top"
                              onError={(e) => applyImageElementFallback(e.currentTarget)}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-base font-semibold truncate">{movie.name}</p>
                            <p className="text-white/50 text-sm truncate">{movie.origin_name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {year > 0 && <span className="text-white/40 text-xs">{year}</span>}
                              {movie.quality && <span className="text-red-400 text-xs font-semibold">{movie.quality}</span>}
                              <AudioLanguageBadges value={movie.lang} compact />
                            </div>
                          </div>
                          <i className="ri-arrow-right-line text-white/15 flex-shrink-0 text-sm" />
                        </button>
                      );
                    })}

                    {/* View all */}
                    {suggestions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowSuggestions(false);
                          addToHistory(query.trim());
                          setSearchParams({ q: query.trim() });
                        }}
                        onMouseEnter={() => setHighlightIndex(suggestions.length)}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-red-400 transition-colors cursor-pointer text-sm font-semibold border-t border-white/5 ${
                          highlightIndex === suggestions.length ? 'bg-red-500/10' : 'hover:bg-red-500/5'
                        }`}
                      >
                        <i className="ri-search-line text-sm" />
                        Xem tất cả kết quả cho &quot;{query}&quot;
                      </button>
                    )}
                  </>
                ) : (
                  /* ── Zero-state (not typing enough) ── */
                  <>
                    {/* Recent searches */}
                    {searchHistory.length > 0 && (
                      <div className="border-b border-white/5">
                        <div className="flex items-center justify-between px-4 py-2">
                          <div className="flex items-center gap-1.5 text-white/30 text-xs uppercase tracking-wider">
                            <i className="ri-history-line text-xs" />
                            Tìm kiếm gần đây
                          </div>
                          <button
                            onClick={() => { setSearchHistory([]); try { localStorage.removeItem(HISTORY_KEY); } catch { /* silently */ } }}
                            className="text-xs text-white/25 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            Xóa tất cả
                          </button>
                        </div>
                        {searchHistory.map((term, idx) => {
                          const isHighlighted = idx === highlightIndex;
                          return (
                            <div
                              key={term}
                              onMouseEnter={() => setHighlightIndex(idx)}
                              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left ${
                                isHighlighted ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => pickHistory(term)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                              >
                                <i className="ri-history-line text-white/20 text-sm" />
                                <span className="text-white/60 flex-1 truncate">{term}</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Xóa ${term} khỏi lịch sử tìm kiếm`}
                                onClick={(e) => removeHistoryItem(term, e)}
                                className="w-6 h-6 flex items-center justify-center text-white/15 hover:text-white/40 transition-colors cursor-pointer"
                              >
                                <i className="ri-close-line text-xs" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Hot searches */}
                    <div>
                      <div className="flex items-center gap-1.5 px-4 py-2 text-white/30 text-xs uppercase tracking-wider">
                        <i className="ri-fire-line text-xs text-red-400/60" />
                        Tìm kiếm phổ biến
                      </div>
                      <div className="grid grid-cols-1 gap-0.5">
                        {HOT_SEARCHES.map((tag, idx) => {
                          const globalIdx = searchHistory.length + idx;
                          const isHighlighted = globalIdx === highlightIndex;
                          return (
                            <button
                              key={tag.label}
                              type="button"
                              onClick={() => pickHistory(tag.label)}
                              onMouseEnter={() => setHighlightIndex(globalIdx)}
                              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors cursor-pointer text-left ${
                                isHighlighted ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                              }`}
                            >
                              <i className={`${tag.icon} text-white/20 text-sm`} />
                              <span className="text-white/60 flex-1">{tag.label}</span>
                              <span className="text-[10px] text-white/15 bg-white/[0.04] px-1.5 py-0.5 rounded">Hot</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Hot searches (only when no query) */}
          {!q && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-3 justify-center">
                <i className="ri-fire-line text-red-400 text-sm" />
                <span className="text-white/30 text-sm font-medium uppercase tracking-wider">Tìm kiếm phổ biến</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {HOT_SEARCHES.map((tag) => (
                  <button
                    key={tag.label}
                    onClick={() => {
                      addToHistory(tag.label);
                      setSearchParams({ q: tag.label });
                    }}
                    className="flex items-center gap-1.5 text-sm bg-white/[0.05] hover:bg-red-500/15 text-white/50 hover:text-red-400 border border-white/[0.08] hover:border-red-500/30 px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap"
                  >
                    <i className={`${tag.icon} text-sm`} />
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <main className="cinema-page-container">

        {/* ── Quick Categories (only when no query) ── */}
        {!q && (
          <div className="mb-10">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="cinema-section-title text-base sm:text-lg">Khám Phá Theo Danh Mục</h2>
              <span className="hidden text-xs text-white/30 sm:inline">Chọn nhanh nhóm phim bạn muốn xem</span>
            </div>
            <div className="grid movie-grid-desktop">
              {QUICK_CATEGORIES.map((cat) => (
                <Link
                  key={cat.href}
                  to={cat.href}
                  className={`cinema-category-tile flex flex-col items-center justify-center gap-2 p-4 transition-all cursor-pointer group ${cat.color}`}
                >
                  <div className="text-2xl leading-none">
                    {cat.isIcon
                      ? <i className={`${cat.icon} text-2xl text-white/60 group-hover:text-white transition-colors`} />
                      : cat.icon}
                  </div>
                  <span className="text-sm text-white/60 group-hover:text-white/90 transition-colors font-medium text-center whitespace-nowrap">{cat.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {q ? (
          <div>
            {/* Top bar: count + sort + view toggle */}
            <div className="cinema-toolbar-panel mb-5 flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h2 className="cinema-section-title text-base sm:text-lg">
                  Kết quả: <span className="text-red-400">&ldquo;{q}&rdquo;</span>
                </h2>
                <span className="text-white/35 text-sm sm:text-base bg-white/[0.04] border border-white/[0.06] px-2.5 sm:px-3 py-1 rounded-full">
                  {filteredResults.length} phim
                </span>
                {activeFilterCount > 0 && (
                  <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    {activeFilterCount} lọc
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1 sm:mx-0 sm:px-0">
                {/* Sort dropdown */}
                <div className="relative group">
                  <button className="flex items-center gap-1.5 text-sm text-white/50 bg-white/[0.04] border border-white/[0.08] hover:border-white/15 px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap">
                    <i className="ri-sort-desc text-white/30" />
                    {SORT_OPTIONS.find(s => s.value === sortMode)?.label ?? 'Phù hợp nhất'}
                    <i className="ri-arrow-down-s-line text-white/20" />
                  </button>
                  <div className="absolute top-full right-0 mt-1 w-40 bg-[#141720] border border-white/10 rounded-xl overflow-hidden z-40 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setSortMode(opt.value)}
                        className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer ${
                          sortMode === opt.value
                            ? 'bg-red-500/15 text-red-400 font-semibold'
                            : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                        }`}
                      >
                        <i className={`${opt.icon} flex-shrink-0`} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* View toggle */}
                <div className="flex bg-[#1a1d27] rounded-xl border border-white/[0.06] p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`w-8 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                      viewMode === 'grid' ? 'bg-red-500/20 text-red-400' : 'text-white/30 hover:text-white'
                    }`}
                    title="Dạng lưới"
                  >
                    <i className="ri-grid-fill text-sm" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`w-8 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                      viewMode === 'list' ? 'bg-red-500/20 text-red-400' : 'text-white/30 hover:text-white'
                    }`}
                    title="Dạng danh sách"
                  >
                    <i className="ri-list-check text-sm" />
                  </button>
                </div>
              </div>
            </div>

            {/* Inline filter bar */}
            <div className="mb-5">
              <SearchFilterBar
                selectedType={filterType}
                selectedYear={filterYear}
                selectedGenre={filterGenre}
                selectedCountry={filterCountry}
                selectedAudio={filterAudio}
                onTypeChange={setFilterType}
                onYearChange={setFilterYear}
                onGenreChange={setFilterGenre}
                onCountryChange={setFilterCountry}
                onAudioChange={setFilterAudio}
                onReset={handleResetFilters}
                activeCount={activeFilterCount}
              />
            </div>

            {/* Divider */}
              <div className="h-px bg-gradient-to-r from-white/[0.06] via-amber-200/10 to-transparent mb-5" />

            {/* Loading skeleton */}
            {loading && results.length === 0 ? (
              viewMode === 'grid' ? (
                <div className="grid movie-grid-desktop search-results-grid">
                {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i}>
                      <div className="aspect-[2/3] skeleton rounded-xl" />
                      <div className="mt-2 h-3 skeleton rounded w-3/4" />
                      <div className="mt-1 h-2.5 skeleton rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex gap-4 bg-[#1a1d27] rounded-xl p-3 border border-white/[0.05]">
                      <div className="w-16 h-[88px] skeleton rounded-lg flex-shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-4 skeleton rounded w-3/4" />
                        <div className="h-3 skeleton rounded w-1/2" />
                        <div className="h-3 skeleton rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : error ? (
              <div className="cinema-empty-state flex flex-col items-center justify-center py-12 text-center sm:py-20">
                <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center bg-white/[0.03] border border-white/[0.06] rounded-2xl mb-5">
                  <i className="ri-search-eye-line text-4xl text-white/15" />
                </div>
                <p className="text-white/50 text-lg mb-2">{error}</p>
                <p className="text-white/25 text-base mb-6">Thử tên tiếng Anh hoặc tên gốc của phim</p>
                <div className="flex items-center gap-2 justify-center flex-wrap">
                  {['Action', 'Romance', 'Anime', 'Horror', 'Comedy'].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        addToHistory(s);
                        setSearchParams({ q: s });
                      }}
                      className="text-sm bg-white/[0.04] hover:bg-red-500/15 text-white/40 hover:text-red-400 border border-white/[0.08] hover:border-red-500/25 px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : filteredResults.length > 0 ? (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid movie-grid-desktop search-results-grid">
                    {filteredResults.map((m, index) => (
                      <SearchResultItem key={searchResultKey(m, index)} movie={m} query={q} viewMode="grid" />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredResults.map((m, index) => (
                      <SearchResultItem key={searchResultKey(m, index)} movie={m} query={q} viewMode="list" />
                    ))}
                  </div>
                )}

                {/* Load more */}
                {page < totalPages && !allLoaded && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="flex items-center gap-2 bg-[#1a1d27] hover:bg-red-500/10 text-white/70 hover:text-white border border-white/10 hover:border-red-500/25 text-sm px-8 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {loading
                        ? <><i className="ri-loader-4-line animate-spin" /> Đang tải...</>
                        : <><i className="ri-add-line" /> Xem thêm kết quả</>}
                    </button>
                  </div>
                )}

                {loading && results.length > 0 && (
                  <div className="flex justify-center mt-6">
                    <i className="ri-loader-4-line animate-spin text-red-500 text-xl" />
                  </div>
                )}
              </>
            ) : (
              /* Filtered out everything */
              <div className="flex flex-col items-center justify-center py-10 sm:py-16 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-white/[0.03] border border-white/[0.06] rounded-2xl mb-4">
                  <i className="ri-filter-off-line text-3xl text-white/15" />
                </div>
                <p className="text-white/40 text-base mb-2">Không có phim nào khớp với bộ lọc</p>
                <p className="text-white/25 text-sm mb-5">Thử bỏ một vài bộ lọc để thấy nhiều kết quả hơn</p>
                <button
                  onClick={handleResetFilters}
                  className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-5 py-2.5 rounded-xl text-sm transition-all cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-refresh-line" /> Xóa bộ lọc
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Trending when no query */
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-5 bg-red-500 rounded-full" />
              <h2 className="text-white font-bold">Phim Đang Hot</h2>
              <span className="text-sm text-white/30 bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-full">Cập nhật hàng ngày</span>
            </div>
            {trending.length === 0 ? (
              <div className="grid movie-grid-desktop">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i}>
                    <div className="aspect-[2/3] skeleton rounded-xl" />
                    <div className="mt-2 h-3 skeleton rounded w-3/4" />
                    <div className="mt-1 h-2.5 skeleton rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid movie-grid-desktop">
                {trending.map((m) => (
                  <MovieCard key={m._id} movie={m} />
                ))}
              </div>
            )}

            {/* Browse more CTA */}
            <div className="mt-10 flex flex-col items-center gap-3">
              <p className="text-white/30 text-sm">Không tìm thấy phim bạn muốn?</p>
              <Link
                to="/filter"
                className="flex items-center gap-2 bg-[#1a1d27] hover:bg-white/[0.06] text-white/60 hover:text-white border border-white/10 hover:border-white/20 text-sm px-6 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap"
              >
                <i className="ri-equalizer-2-line text-red-400" />
                Lọc phim nâng cao
              </Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
