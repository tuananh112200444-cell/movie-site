const VIEWER_REGION_CACHE_KEY = 'khophim.viewer-region.v1';
const VIEWER_REGION_TTL_MS = 24 * 60 * 60 * 1000;
export const VIEWER_REGION_UPDATED_EVENT = 'kp:viewer-region-updated';

type ViewerRegionCache = {
  country: string;
  expiresAt: number;
};

let memoryCountry = '';
let inflight: Promise<string> | null = null;

function readCachedCountry(): string {
  if (memoryCountry) return memoryCountry;
  if (typeof window === 'undefined') return '';
  try {
    const cached = JSON.parse(window.localStorage.getItem(VIEWER_REGION_CACHE_KEY) || 'null') as ViewerRegionCache | null;
    if (!cached?.country || cached.expiresAt <= Date.now()) return '';
    memoryCountry = cached.country.toUpperCase();
    return memoryCountry;
  } catch {
    return '';
  }
}

function writeCountry(country: string): void {
  memoryCountry = country.toUpperCase();
  try {
    window.localStorage.setItem(VIEWER_REGION_CACHE_KEY, JSON.stringify({
      country: memoryCountry,
      expiresAt: Date.now() + VIEWER_REGION_TTL_MS,
    } satisfies ViewerRegionCache));
  } catch {
    // Private browsing may reject storage; the in-memory value still works.
  }
  window.dispatchEvent(new CustomEvent(VIEWER_REGION_UPDATED_EVENT, {
    detail: { country: memoryCountry },
  }));
}

function timezoneSuggestsVietnam(): boolean {
  try {
    return ['Asia/Ho_Chi_Minh', 'Asia/Saigon'].includes(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

export function getViewerCountry(): string {
  return readCachedCountry();
}

export function isInternationalViewer(): boolean {
  const country = readCachedCountry();
  if (country) return country !== 'VN';
  return !timezoneSuggestsVietnam();
}

export function warmViewerRegion(): Promise<string> {
  const cached = readCachedCountry();
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    try {
      // Cloudflare serves this system endpoint without invoking our Worker.
      // Parse and retain only the two-letter country code; never store the IP.
      const response = await fetch('/cdn-cgi/trace', {
        cache: 'no-store',
        headers: { Accept: 'text/plain' },
        signal: controller.signal,
      });
      if (!response.ok) return '';
      const text = await response.text();
      const country = text.match(/^loc=([A-Z]{2})$/m)?.[1] || '';
      if (country) writeCountry(country);
      return country;
    } catch {
      return '';
    } finally {
      window.clearTimeout(timer);
      inflight = null;
    }
  })();
  return inflight;
}
