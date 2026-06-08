import { useState, useCallback } from 'react';
import type { MovieItem } from '../types/movie';

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
  lastEpSlug: string;
  lastEpName: string;
  watchedAt: number;
  /** Thời gian xem dở (giây) của tập cuối */
  watchedTime?: number;
  /** Tổng thời lượng tập cuối (giây) */
  watchedDuration?: number;
}

function load(): WatchEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

function save(list: WatchEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* ignore */ }
}

export function useWatchHistory() {
  const [history, setHistory] = useState<WatchEntry[]>(load);

  const addEntry = useCallback((movie: MovieItem, epSlug = '', epName = '') => {
    setHistory((prev) => {
      const filtered = prev.filter((e) => e._id !== movie._id);
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
        lastEpSlug: epSlug,
        lastEpName: epName,
        watchedAt: Date.now(),
        watchedTime: 0,
        watchedDuration: 0,
      };
      const next = [entry, ...filtered];
      save(next);
      return next;
    });
  }, []);

  /** Cập nhật thời gian xem dở mà không thay đổi thứ tự lịch sử */
  const updateProgress = useCallback((movieId: string, watchedTime: number, watchedDuration: number) => {
    setHistory((prev) => {
      const idx = prev.findIndex((e) => e._id === movieId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], watchedTime, watchedDuration };
      save(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e._id !== id);
      save(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    setHistory([]);
  }, []);

  return { history, addEntry, updateProgress, removeEntry, clearAll };
}
