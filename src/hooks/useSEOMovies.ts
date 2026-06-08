import { useState, useEffect, useCallback } from 'react';
import { fetchMoviesByCategory, fetchMoviesByType, searchMovies } from '../services/movieApi';
import type { MovieItem } from '../types/movie';

export type FetchStrategy =
  | { type: 'year'; year: string }
  | { type: 'quality'; quality: string }
  | { type: 'language'; language: string }
  | { type: 'status'; status: 'completed' | 'ongoing' | 'trailer' }
  | { type: 'platform'; keyword: string }
  | { type: 'country'; country: string }
  | { type: 'genre'; genre: string }
  | { type: 'type'; movieType: string };

const PAGE_SIZE = 24;
const CACHE_TTL = 3 * 60 * 1000; // 3 phút cho SEO landing

/* ════════════════════════════════════════════
   In-memory cache cho SEO landing pages
   ════════════════════════════════════════════ */
interface SEOCacheEntry {
  movies: MovieItem[];
  ts: number;
}
const seoCache = new Map<string, SEOCacheEntry>();

function getSEOSCache(key: string): MovieItem[] | null {
  const entry = seoCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { seoCache.delete(key); return null; }
  return entry.movies;
}

function setSEOSCache(key: string, movies: MovieItem[]): void {
  seoCache.set(key, { movies, ts: Date.now() });
}

function cacheKey(strategy: FetchStrategy, limit: number): string {
  return JSON.stringify(strategy) + ':' + limit;
}

function matchesQuality(movie: MovieItem, quality: string): boolean {
  const q = (movie.quality ?? '').toLowerCase();
  if (quality === '4k') return q.includes('4k') || q.includes('2160p') || q.includes('uhd');
  if (quality === 'full-hd') return q.includes('full hd') || q.includes('1080p') || q.includes('fhd');
  if (quality === 'hd') return q.includes('hd') && !q.includes('full hd');
  return q.includes(quality.toLowerCase());
}

function matchesLanguage(movie: MovieItem, language: string): boolean {
  const lang = (movie.lang ?? '').toLowerCase();
  if (language === 'vietsub') return lang.includes('vietsub') || lang.includes('sub') || lang.includes('thuyet minh');
  if (language === 'long-tieng') return lang.includes('lồng tiếng') || lang.includes('long tieng') || lang.includes('lt') || lang.includes('dub');
  if (language === 'thuyet-minh') return lang.includes('thuyết minh') || lang.includes('thuyet minh') || lang.includes('tm');
  return lang.includes(language.toLowerCase());
}

function matchesStatus(movie: MovieItem, status: string): boolean {
  const ep = (movie.episode_current ?? '').toLowerCase().trim();
  const total = movie.episode_total ?? '';
  if (status === 'completed') {
    return ep === 'full' || ep === 'full hd' || ep.startsWith('hoàn tất') || (total && ep.includes(String(total)));
  }
  if (status === 'ongoing') {
    return !matchesStatus(movie, 'completed') && !matchesStatus(movie, 'trailer');
  }
  if (status === 'trailer') {
    return ep === 'trailer' || ep === 'đang cập nhật' || ep === 'dang cap nhat';
  }
  return false;
}

export function useSEOMovies(strategy: FetchStrategy, limit = 24, enabled = true) {
  const key = cacheKey(strategy, limit);
  const cached = getSEOSCache(key);
  const [movies, setMovies] = useState<MovieItem[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached && enabled);

  const fetchMovies = useCallback(async () => {
    // Nếu có cache tươi, không fetch lại
    const fresh = getSEOSCache(key);
    if (fresh) {
      setMovies(fresh);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let items: MovieItem[] = [];

      switch (strategy.type) {
        case 'year': {
          const res = await fetchMoviesByCategory({ year: strategy.year, page: 1, sortField: 'modified.time', sortType: 'desc' });
          items = res.items ?? [];
          break;
        }
        case 'country': {
          const res = await fetchMoviesByCategory({ country: strategy.country, page: 1, sortField: 'modified.time', sortType: 'desc' });
          items = res.items ?? [];
          break;
        }
        case 'genre': {
          const res = await fetchMoviesByCategory({ category: strategy.genre, page: 1, sortField: 'modified.time', sortType: 'desc' });
          items = res.items ?? [];
          break;
        }
        case 'type': {
          const res = await fetchMoviesByType(strategy.movieType, 1, 'modified.time', 'desc');
          items = res.items ?? [];
          break;
        }
        case 'platform': {
          const res = await searchMovies(strategy.keyword, 1);
          items = res.items ?? [];
          break;
        }
        case 'quality':
        case 'language':
        case 'status': {
          // Fetch recent movies then filter client-side
          const res = await fetchMoviesByCategory({ page: 1, sortField: 'modified.time', sortType: 'desc' });
          items = res.items ?? [];
          if (strategy.type === 'quality') {
            items = items.filter(m => matchesQuality(m, strategy.quality));
          } else if (strategy.type === 'language') {
            items = items.filter(m => matchesLanguage(m, strategy.language));
          } else if (strategy.type === 'status') {
            items = items.filter(m => matchesStatus(m, strategy.status));
          }
          break;
        }
      }

      // Deduplicate by slug
      const seen = new Set<string>();
      const deduped = items.filter(m => {
        if (seen.has(m.slug)) return false;
        seen.add(m.slug);
        return true;
      });

      const result = deduped.slice(0, limit);
      setMovies(result);
      setSEOSCache(key, result);
    } catch {
      setMovies([]);
    } finally {
      setLoading(false);
    }
  }, [strategy, limit, key]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    fetchMovies();
  }, [fetchMovies, enabled]);

  return { movies, loading };
}