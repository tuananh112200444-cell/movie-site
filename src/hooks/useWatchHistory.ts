import { useState, useCallback, useEffect } from 'react';
import type { MovieItem } from '../types/movie';
import { ACCOUNT_DATA_CHANGED_EVENT, pushSyncItem } from '@/services/accountSync';

const KEY = 'kp_watch_history';
const MAX = 20;

export interface WatchEntry {
  _id: string;
  slug: string;
  name: string;
  origin_name: string;
  thumb_url: string;
  poster_url: string;
  year: number;
  quality: string;
  lang: string;
  episode_current: string;
  type?: string;
  category?: MovieItem['category'];
  country?: MovieItem['country'];
  lastEpSlug: string;
  lastEpName: string;
  watchedAt: number;
  /** Thời gian xem dở (giây) của tập cuối */
  watchedTime?: number;
  /** Tổng thời lượng tập cuối (giây) */
  watchedDuration?: number;
}

function load(): WatchEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((entry): entry is WatchEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const slug = String(entry.slug ?? '').trim();
      if (!slug || slug === 'undefined' || slug === 'null' || seen.has(slug)) return false;
      seen.add(slug);
      return true;
    }).slice(0, MAX);
  }
  catch { return []; }
}

function save(list: WatchEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* ignore */ }
}

export function persistWatchHistoryProgress(
  movieId: string,
  movieSlug: string,
  watchedTime: number,
  watchedDuration: number,
): void {
  if (!Number.isFinite(watchedTime) || !Number.isFinite(watchedDuration) || watchedTime < 0 || watchedDuration <= 0) return;
  const list = load();
  const idx = list.findIndex((entry) =>
    (movieSlug && entry.slug === movieSlug) || (movieId && entry._id === movieId)
  );
  if (idx < 0) return;
  list[idx] = { ...list[idx], watchedTime, watchedDuration };
  save(list);
  const entry = list[idx];
  void pushSyncItem('watch_history', entry.slug || entry._id, entry as unknown as Record<string, unknown>).catch(() => {});
}

export function useWatchHistory() {
  const [history, setHistory] = useState<WatchEntry[]>(load);

  useEffect(() => {
    const refresh = () => setHistory(load());
    window.addEventListener(ACCOUNT_DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ACCOUNT_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const addEntry = useCallback((movie: MovieItem, epSlug = '', epName = '') => {
    setHistory((prev) => {
      const existing = prev.find((entry) => entry.slug === movie.slug || (movie._id && entry._id === movie._id));
      const sameEpisode = Boolean(existing && existing.lastEpSlug === epSlug);
      const filtered = prev.filter((entry) => entry.slug !== movie.slug && (!movie._id || entry._id !== movie._id));
      const entry: WatchEntry = {
        _id: movie._id,
        slug: movie.slug,
        name: movie.name,
        origin_name: movie.origin_name ?? '',
        thumb_url: movie.thumb_url,
        poster_url: movie.poster_url,
        year: movie.year,
        quality: movie.quality,
        lang: movie.lang,
        episode_current: movie.episode_current,
        type: movie.type,
        category: movie.category,
        country: movie.country,
        lastEpSlug: epSlug,
        lastEpName: epName,
        watchedAt: Date.now(),
        watchedTime: sameEpisode ? existing?.watchedTime ?? 0 : 0,
        watchedDuration: sameEpisode ? existing?.watchedDuration ?? 0 : 0,
      };
      const next = [entry, ...filtered];
      save(next);
      void pushSyncItem('watch_history', entry.slug || entry._id, entry as unknown as Record<string, unknown>).catch(() => {});
      return next;
    });
  }, []);

  /** Cập nhật thời gian xem dở mà không thay đổi thứ tự lịch sử */
  const updateProgress = useCallback((movieId: string, watchedTime: number, watchedDuration: number, movieSlug = '') => {
    setHistory((prev) => {
      const idx = prev.findIndex((entry) =>
        (movieSlug && entry.slug === movieSlug) || (movieId && entry._id === movieId)
      );
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], watchedTime, watchedDuration };
      save(next);
      void pushSyncItem('watch_history', next[idx].slug || next[idx]._id, next[idx] as unknown as Record<string, unknown>).catch(() => {});
      return next;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const removed = prev.find((e) => e._id === id);
      const next = prev.filter((e) => e._id !== id);
      save(next);
      if (removed) void pushSyncItem('watch_history', removed.slug || removed._id, {}, true).catch(() => {});
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    const existing = load();
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    existing.forEach((entry) => {
      void pushSyncItem('watch_history', entry.slug || entry._id, {}, true).catch(() => {});
    });
    setHistory([]);
  }, []);

  return { history, addEntry, updateProgress, removeEntry, clearAll };
}
