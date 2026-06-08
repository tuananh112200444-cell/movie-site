import { useState, useCallback } from 'react';
import type { MovieItem } from '../types/movie';

const KEY = 'kp_favorites';

export type FavMovie = Pick<MovieItem,
  '_id' | 'slug' | 'name' | 'origin_name' | 'thumb_url' | 'poster_url' |
  'year' | 'quality' | 'lang' | 'episode_current'
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

  const isFav = useCallback((id: string) =>
    favorites.some((f) => f._id === id), [favorites]);

  const toggle = useCallback((movie: MovieItem): boolean => {
    let added = false;
    setFavorites((prev) => {
      const exists = prev.some((f) => f._id === movie._id);
      const next = exists
        ? prev.filter((f) => f._id !== movie._id)
        : [{ _id: movie._id, slug: movie.slug, name: movie.name, origin_name: movie.origin_name ?? '',
             thumb_url: movie.thumb_url, poster_url: movie.poster_url, year: movie.year,
             quality: movie.quality, lang: movie.lang, episode_current: movie.episode_current
           }, ...prev];
      save(next);
      added = !exists;
      return next;
    });
    return added;
  }, []);

  const remove = useCallback((id: string) => {
    setFavorites((prev) => { const n = prev.filter((f) => f._id !== id); save(n); return n; });
  }, []);

  return { favorites, isFav, toggle, remove };
}
