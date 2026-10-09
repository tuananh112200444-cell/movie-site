import { useEffect, useMemo, useState } from 'react';
import { getLandscapeImagePaths, getPortraitImagePaths } from '../services/movieApi';

export type ArtworkPaths = { primary?: string; fallback?: string };

type ArtworkMovie = {
  slug?: string;
  source_site?: string;
  source_name?: string;
  thumb_url?: string;
  poster_url?: string;
  hero_backdrop_url?: string;
  hero_poster_url?: string;
};

const recoveredArtworkCache = new Map<string, Promise<ArtworkMovie | null>>();

function preferredArtworkSource(movie: ArtworkMovie): string {
  const source = String(movie.source_site || '').trim().toLowerCase();
  if (source === 'phimapi') return 'kkphim';
  return ['kkphim', 'vsmov', 'ophim', 'nguonc'].includes(source) ? source : '';
}

async function recoverMovieArtwork(movie: ArtworkMovie): Promise<ArtworkMovie | null> {
  const slug = String(movie.slug || '').trim();
  if (!slug || typeof window === 'undefined') return null;
  const source = preferredArtworkSource(movie);
  const key = `${slug}:${source || 'auto'}`;
  const cached = recoveredArtworkCache.get(key);
  if (cached) return cached;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4500);
    try {
      const url = new URL('/api/artwork-recovery', window.location.origin);
      url.searchParams.set('slug', slug);
      if (source) url.searchParams.set('source', source);
      const response = await fetch(url, { signal: controller.signal, cache: 'default' });
      if (!response.ok) return null;
      const payload = await response.json() as { movie?: ArtworkMovie };
      return payload.movie || null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  recoveredArtworkCache.set(key, request);
  return request;
}

export function useMovieArtworkPaths(movie: ArtworkMovie, aspect: 'portrait' | 'landscape'): ArtworkPaths {
  const original = useMemo(
    () => aspect === 'portrait' ? getPortraitImagePaths(movie) : getLandscapeImagePaths(movie),
    [aspect, movie],
  );
  const [recovered, setRecovered] = useState<ArtworkPaths | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecovered(null);
    if (original.primary || !movie.slug) return () => { cancelled = true; };

    void recoverMovieArtwork(movie).then((freshMovie) => {
      if (cancelled || !freshMovie) return;
      const fresh = aspect === 'portrait'
        ? getPortraitImagePaths(freshMovie)
        : getLandscapeImagePaths(freshMovie);
      if (fresh.primary) setRecovered(fresh);
    });

    return () => { cancelled = true; };
  }, [aspect, movie, original.primary]);

  return recovered || original;
}
