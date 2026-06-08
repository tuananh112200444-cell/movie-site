/**
 * Global Image Preloader — aggressively cache images in browser
 *
 * Strategy:
 * - Preload images with browser native loading
 * - Track loaded state so UI components skip skeleton immediately
 * - Use IMG_BASE directly (no proxy) for fastest loading
 */

import { IMG_BASE } from '../services/movieApi';

const PRELOADED = new Set<string>();
const PRELOADING = new Map<string, HTMLImageElement>();

/** Check if an image URL has been fully loaded into browser cache */
export function isImagePreloaded(url: string): boolean {
  return PRELOADED.has(url);
}

/** Mark an image as preloaded */
export function markImagePreloaded(url: string): void {
  if (url) PRELOADED.add(url);
}

/** Preload a single image — idempotent */
export function preloadImage(url: string): Promise<void> {
  if (!url || PRELOADED.has(url)) return Promise.resolve();

  const existing = PRELOADING.get(url);
  if (existing) {
    return new Promise((resolve) => {
      const onDone = () => resolve();
      existing.addEventListener('load', onDone, { once: true });
      existing.addEventListener('error', onDone, { once: true });
    });
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      PRELOADED.add(url);
      PRELOADING.delete(url);
      resolve();
    };
    img.onerror = () => {
      PRELOADING.delete(url);
      resolve();
    };
    PRELOADING.set(url, img);
    img.src = url;
  });
}

export interface PreloadBatchOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  delayBetweenImages?: number;
  priorityUrls?: string[];
  /** Chỉ preload N ảnh đầu tiên, tránh preload hàng trăm ảnh một lúc */
  limit?: number;
}

/** Preload multiple images in staggered batches */
export function preloadBatch(urls: string[], options: PreloadBatchOptions = {}): void {
  const {
    batchSize = 3,           // Giảm từ 6 → 3 (ít tải song song hơn, nhẹ main thread)
    delayBetweenBatches = 400, // Giảm từ 200 → 400ms (ít batch hơn mỗi giây)
    delayBetweenImages = 60,   // Giảm từ 30 → 60ms (ít Image object tạo cùng lúc)
    priorityUrls = [],
    limit = 18,               // Giới hạn mặc định: chỉ preload tối đa 18 ảnh
  } = options;

  const allUrls = [...new Set([...priorityUrls.filter(Boolean), ...urls.filter(Boolean)])];
  const limitedUrls = allUrls.slice(0, limit);
  const neededUrls = limitedUrls.filter((url) => !PRELOADED.has(url));

  if (neededUrls.length === 0) return;

  for (let i = 0; i < neededUrls.length; i += batchSize) {
    const batch = neededUrls.slice(i, i + batchSize);
    const batchDelay = Math.floor(i / batchSize) * delayBetweenBatches;

    setTimeout(() => {
      batch.forEach((url, idx) => {
        setTimeout(() => preloadImage(url), idx * delayBetweenImages);
      });
    }, batchDelay);
  }
}

/** Preload all poster URLs from a movie list — giới hạn số ảnh */
export function preloadMoviePosters(
  movies: Array<{ poster_url?: string; thumb_url?: string }>,
  getImageUrl: (path: string) => string,
  options?: PreloadBatchOptions,
): void {
  const urls: string[] = [];
  for (const m of movies) {
    if (m.poster_url) urls.push(getImageUrl(m.poster_url));
    if (m.thumb_url) urls.push(getImageUrl(m.thumb_url));
  }
  preloadBatch(urls, { limit: 18, ...options });
}

/** Inject <link rel="preload"> for critical LCP images */
export function injectPreloadLink(url: string): void {
  if (!url || PRELOADED.has(url)) return;
  const selector = `link[rel="preload"][href="${url}"]`;
  if (document.querySelector(selector)) return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}
