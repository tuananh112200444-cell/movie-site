import { startTransition, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { fetchSupabaseSearchIndex, getOptimizedImageUrl, searchMoviesInSupabase } from '../../services/movieApi';
import type { Movie } from '../../types/movie';
import { mergeMoviesUnique, parseMovieYear, sortMoviesForSearch } from '../../utils/searchRanking';
import { movieDetailUrl } from '../../utils/slugEncoder';

interface Props {
  query: string;
  onSelect?: () => void;
  className?: string;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ── Search History in localStorage ── */
const HISTORY_KEY = 'kp_search_history';
const MAX_HISTORY = 8;

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

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getMovieSearchText(movie: Movie): string {
  return normalizeSearchText([
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.title_zh,
    movie.slug,
    movie.episode_current,
    movie.episode_total,
    movie.current_episode ? `tap ${movie.current_episode}` : '',
    movie.total_episodes ? `season ${movie.total_episodes}` : '',
    movie.category?.map((c) => c.name).join(' '),
  ].filter(Boolean).join(' '));
}

const movieSearchTextCache = new WeakMap<Movie, string>();

function getCachedMovieSearchText(movie: Movie): string {
  const cached = movieSearchTextCache.get(movie);
  if (cached) return cached;
  const text = getMovieSearchText(movie);
  movieSearchTextCache.set(movie, text);
  return text;
}

const suggestionFuseOptions = {
  keys: ['name', 'origin_name', 'title_vi', 'title_en', 'title_zh', 'slug', 'episode_current', 'episode_total'],
  threshold: 0.34,
  distance: 90,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

function runWhenIdle(callback: () => void, timeout = 1800): () => void {
  const idle = (globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback;
  const cancelIdle = (globalThis as typeof globalThis & {
    cancelIdleCallback?: (id: number) => void;
  }).cancelIdleCallback;

  if (typeof idle === 'function') {
    const id = idle(callback, { timeout });
    return () => cancelIdle?.(id);
  }

  const id = window.setTimeout(callback, Math.min(timeout, 700));
  return () => window.clearTimeout(id);
}

function getInstantLocalHits(pool: Movie[], keyword: string, limit = 8, fuse?: Fuse<Movie> | null): Movie[] {
  const query = normalizeSearchText(keyword.trim());
  if (!query || pool.length === 0) return [];
  const tokens = query.split(/\s+/).filter((token) => token.length >= 2);
  const hits = pool.filter((movie) => {
    const text = getCachedMovieSearchText(movie);
    return text.includes(query) || tokens.every((token) => text.includes(token));
  });
  const fuzzy = (fuse ?? new Fuse(pool, suggestionFuseOptions)).search(keyword.trim(), { limit: Math.max(limit * 3, 16) }).map((result) => result.item);
  return sortMoviesForSearch(mergeMoviesUnique([...hits, ...fuzzy]), keyword, 'relevance').slice(0, limit);
}

function getMovieHref(movie: Movie): string {
  const href = movieDetailUrl(movie.slug);
  const isOphimSource = movie.source_site === 'ophim' || movie.source_name === 'OPhim';
  return isOphimSource ? `${href}?source=ophim` : href;
}

/* ── Trending searches (static only — no direct OPhim calls) ── */
const STATIC_TRENDING = [
  { label: 'Avengers', icon: 'ri-shield-star-line' },
  { label: 'Squid Game', icon: 'ri-gamepad-line' },
  { label: 'One Piece', icon: 'ri-anchor-line' },
  { label: 'Doraemon', icon: 'ri-robot-line' },
  { label: 'Parasite', icon: 'ri-bug-line' },
  { label: 'Naruto', icon: 'ri-fire-line' },
  { label: 'Interstellar', icon: 'ri-planet-line' },
  { label: 'Hương Mật', icon: 'ri-heart-line' },
];

export default function SearchSuggestions({ query, onSelect, className = '' }: Props) {
  const [suggestions, setSuggestions] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [localPool, setLocalPool] = useState<Movie[]>([]);
  const debouncedQuery = useDebounce(query, 300);
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const indexLoadRef = useRef<Promise<Movie[]> | null>(null);
  const isTyping = query.trim().length >= 2;
  const localFuse = useMemo(
    () => (localPool.length > 0 ? new Fuse(localPool, suggestionFuseOptions) : null),
    [localPool],
  );

  // Load history on mount — NO API calls
  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

  const ensureSearchIndexLoaded = useCallback(() => {
    if (indexLoadRef.current) return indexLoadRef.current;
    indexLoadRef.current = fetchSupabaseSearchIndex({ limit: 1200, persistentCache: false })
      .then((items) => {
        const movies = items as unknown as Movie[];
        if (movies.length > 0) {
          startTransition(() => {
            setLocalPool((prev) => mergeMoviesUnique([...movies, ...prev]));
          });
        }
        return movies;
      })
      .finally(() => {
        indexLoadRef.current = null;
      });
    return indexLoadRef.current;
  }, []);

  useEffect(() => {
    if (localPool.length > 0) return undefined;
    return runWhenIdle(() => {
      void ensureSearchIndexLoaded();
    }, 2200);
  }, [ensureSearchIndexLoaded, localPool.length]);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setHighlightIndex(-1);
       setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const instantItems = getInstantLocalHits(localPool, q, 8, localFuse);
    setSuggestions(instantItems);
    setHighlightIndex(-1);
    setLoading(instantItems.length === 0);
    const cacheKey = `kp_suggest_v9_${q.trim().toLowerCase()}`;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { items: Movie[]; ts: number };
        if (Date.now() - cached.ts < 20_000) {
          setSuggestions(cached.items);
          setHighlightIndex(-1);
          setLoading(false);
          return;
        }
      }
    } catch { /* ignore cache */ }

    try {
      let items = instantItems;
      const apiItems = await searchMoviesInSupabase(q.trim(), { limit: 16, timeoutMs: 1400, minLength: 2, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      items = mergeMoviesUnique([...items, ...apiItems]);

      // Dedupe cross-source results before ranking.
      items = sortMoviesForSearch(items, q.trim(), 'relevance');

      if (!ctrl.signal.aborted) {
        const nextItems = items.slice(0, 8);
        setSuggestions(nextItems);
        setHighlightIndex(-1);
        try {
          if (nextItems.length > 0) {
            sessionStorage.setItem(cacheKey, JSON.stringify({ items: nextItems, ts: Date.now() }));
          }
        } catch { /* quota */ }
      }

    } catch {
      if (!ctrl.signal.aborted) {
        setSuggestions([]);
        setHighlightIndex(-1);
      }
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
      }
    }
  }, [localFuse, localPool]);

  useEffect(() => {
    fetchSuggestions(debouncedQuery);
    return () => { abortRef.current?.abort(); };
  }, [debouncedQuery, fetchSuggestions]);

  // Keyboard navigation
  const totalItems = isTyping
    ? suggestions.length + 1 // +1 for "Xem tất cả"
    : searchHistory.length + STATIC_TRENDING.length;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (totalItems <= 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => {
        const next = prev + 1;
        return next >= totalItems ? 0 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => {
        const next = prev - 1;
        return next < 0 ? totalItems - 1 : next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0) {
        if (isTyping) {
          if (highlightIndex < suggestions.length) {
            const movie = suggestions[highlightIndex];
            if (movie) {
              addToHistory(query.trim());
              navigate(getMovieHref(movie));
              onSelect?.();
            }
          } else {
            // "Xem tất cả"
            addToHistory(query.trim());
            navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            onSelect?.();
          }
        } else {
          // Zero-state: history or trending
          const historyCount = searchHistory.length;
          if (highlightIndex < historyCount) {
            const term = searchHistory[highlightIndex];
            if (term) {
              navigate(`/search?q=${encodeURIComponent(term)}`);
              onSelect?.();
            }
          } else {
            const tag = STATIC_TRENDING[highlightIndex - historyCount];
            if (tag) {
              addToHistory(tag.label);
              navigate(`/search?q=${encodeURIComponent(tag.label)}`);
              onSelect?.();
            }
          }
        }
      }
    } else if (e.key === 'Escape') {
      onSelect?.();
    }
  }, [highlightIndex, isTyping, suggestions, totalItems, query, searchHistory, navigate, onSelect]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightIndex]);

  const removeHistoryItem = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = searchHistory.filter(h => h !== term);
    setSearchHistory(updated);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { /* silently */ }
  };

  // ── Render ──


  return (
    <div
      className={`absolute top-full left-0 right-0 mt-1.5 bg-[#1a1d27] border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl ${className}`}
    >
      {/* ── Suggestions (typing) ── */}
      {isTyping && (
        <>
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-white/40 text-sm">
              <i className="ri-loader-4-line animate-spin text-sm" />
              Đang tìm...
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <div className="px-4 py-3 text-white/40 text-sm">
              Không tìm thấy phim nào
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <ul ref={(node) => { listRef.current = node; }}>
              {suggestions.map((movie, idx) => {
                const thumb = getOptimizedImageUrl(movie.thumb_url || movie.poster_url || '', 180, 82);
                const typeLabel = movie.type === 'series'
                  ? 'Phim Bộ'
                  : movie.type === 'single'
                  ? 'Phim Lẻ'
                  : movie.type === 'hoathinh'
                  ? 'Hoạt Hình'
                  : 'Phim';
                const isHighlighted = idx === highlightIndex;
                const year = parseMovieYear(movie); 

                return (
                  <li key={[movie.slug, movie._id, movie.ophim_id, movie.tmdb_id, movie.source_site, idx].filter(Boolean).join(':')}>
                    <button
                      type="button"
                      onClick={() => {
                        addToHistory(query.trim());
                        navigate(getMovieHref(movie));
                        onSelect?.();
                      }}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer text-left border-b border-white/5 last:border-0 ${
                        isHighlighted ? 'bg-white/8' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="w-9 h-12 flex-shrink-0 rounded-md overflow-hidden bg-white/5">
                        <img
                          src={thumb}
                          alt={movie.name}
                          className="w-full h-full object-cover object-top"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-base font-semibold truncate leading-tight">{movie.name}</p>
                        <p className="text-white/50 text-sm truncate mt-0.5">{movie.origin_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                           {year > 0 && (
                            <span className="text-white/40 text-sm">{year}</span>
                          )}
                          <span className="text-red-400/70 text-sm">{typeLabel}</span>
                          {movie.episode_current && (
                            <span className="text-white/40 text-sm">{movie.episode_current}</span>
                          )}
                        </div>
                      </div>
                      <i className="ri-arrow-right-s-line text-white/20 flex-shrink-0" />
                    </button>
                  </li>
                );
              })}

              {/* "View all results" */}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    addToHistory(query.trim());
                    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                    onSelect?.();
                  }}
                  onMouseEnter={() => setHighlightIndex(suggestions.length)}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-red-400 transition-colors cursor-pointer text-sm font-semibold ${
                    highlightIndex === suggestions.length ? 'bg-red-500/10' : 'hover:bg-red-500/10'
                  }`}
                >
                  <i className="ri-search-line text-sm" />
                  Xem tất cả kết quả cho &quot;{query}&quot;
                </button>
              </li>
            </ul>
          )}
        </>
      )}

      {/* ── Zero-state (not typing enough) ── */}
      {!isTyping && (
        <div ref={(node) => { listRef.current = node; }} className="max-h-[400px] overflow-y-auto">
          {/* Recent searches */}
          {searchHistory.length > 0 && (
            <div className="border-b border-white/5 last:border-0">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-1.5 text-white/30 text-xs uppercase tracking-wider">
                  <i className="ri-history-line text-xs" />
                  Gần đây
                </div>
                <button
                  onClick={() => { setSearchHistory([]); try { localStorage.removeItem(HISTORY_KEY); } catch { /* silently */ } }}
                  className="text-xs text-white/25 hover:text-red-400 transition-colors cursor-pointer"
                >
                  Xóa
                </button>
              </div>
              {searchHistory.map((term, idx) => (
                <div
                  key={term}
                  
                  onMouseEnter={() => setHighlightIndex(idx)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left ${
                    highlightIndex === idx ? 'bg-white/8' : 'hover:bg-white/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      addToHistory(term);
                      navigate(`/search?q=${encodeURIComponent(term)}`);
                      onSelect?.();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                  >
                    <i className="ri-history-line text-white/20 text-sm" />
                    <span className="text-white/60 flex-1 truncate">{term}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Xóa ${term} khỏi lịch sử tìm kiếm`}
                    className="w-6 h-6 flex items-center justify-center text-white/15 hover:text-white/40 transition-colors cursor-pointer"
                    onClick={(e) => removeHistoryItem(term, e)}
                  >
                    <i className="ri-close-line text-xs" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Trending searches */}
          <div className="border-b border-white/5 last:border-0">
            <div className="flex items-center gap-1.5 px-3 py-2 text-white/30 text-xs uppercase tracking-wider">
              <i className="ri-fire-line text-xs text-red-400/60" />
              Tìm kiếm phổ biến
            </div>
            {STATIC_TRENDING.map((tag, idx) => {
              const globalIdx = searchHistory.length + idx;
              return (
                <button
                  key={tag.label}
                  type="button"
                  onClick={() => {
                    addToHistory(tag.label);
                    navigate(`/search?q=${encodeURIComponent(tag.label)}`);
                    onSelect?.();
                  }}
                  onMouseEnter={() => setHighlightIndex(globalIdx)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-left ${
                    highlightIndex === globalIdx ? 'bg-white/8' : 'hover:bg-white/5'
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
      )}
    </div>
  );
}
