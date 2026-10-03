import { useState, useCallback, useEffect } from 'react';
import type { MovieItem } from '../types/movie';
import { ACCOUNT_DATA_CHANGED_EVENT, pushSyncItem } from '@/services/accountSync';

const KEY = 'kp_favorites';

export type FavMovie = Pick<MovieItem,
  '_id' | 'slug' | 'name' | 'origin_name' | 'thumb_url' | 'poster_url' |
  'year' | 'quality' | 'lang' | 'episode_current' | 'type' | 'category' | 'country'
>;

function load(): FavMovie[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

function save(list: FavMovie[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavMovie[]>(load);

  useEffect(() => {
    const refresh = () => setFavorites(load());
    window.addEventListener(ACCOUNT_DATA_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ACCOUNT_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const isFav = useCallback((id: string) =>
    favorites.some((f) => f._id === id), [favorites]);

  const toggle = useCallback((movie: MovieItem): boolean => {
    let added = false;
    setFavorites((prev) => {
      const exists = prev.some((f) => f._id === movie._id);
      const favorite = { _id: movie._id, slug: movie.slug, name: movie.name, origin_name: movie.origin_name ?? '',
             thumb_url: movie.thumb_url, poster_url: movie.poster_url, year: movie.year,
             quality: movie.quality, lang: movie.lang, episode_current: movie.episode_current,
             type: movie.type, category: movie.category, country: movie.country
           };
      const next = exists
        ? prev.filter((f) => f._id !== movie._id)
        : [favorite, ...prev];
      save(next);
      void pushSyncItem('favorite', movie._id || movie.slug, favorite as unknown as Record<string, unknown>, exists).catch(() => {});
      added = !exists;
      return next;
    });
    return added;
  }, []);

  const remove = useCallback((id: string) => {
    setFavorites((prev) => {
      const removed = prev.find((f) => f._id === id);
      const n = prev.filter((f) => f._id !== id);
      save(n);
      if (removed) void pushSyncItem('favorite', removed._id || removed.slug, {}, true).catch(() => {});
      return n;
    });
  }, []);

  return { favorites, isFav, toggle, remove };
}
