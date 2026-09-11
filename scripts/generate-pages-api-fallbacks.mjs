import { mkdir, readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../public/home-fallback.json', import.meta.url);
const apiDirectory = new URL('../public/api/', import.meta.url);
const KKPHIM_CINEMA_URL = 'https://phimapi.com/v1/api/danh-sach/phim-chieu-rap?limit=64&page=1&sort_field=modified.time&sort_type=desc';
const KKPHIM_VIETNAM_URL = 'https://phimapi.com/v1/api/quoc-gia/viet-nam?limit=64&page=1&sort_field=modified.time&sort_type=desc';
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const sections = source?.sections && typeof source.sections === 'object' ? source.sections : {};
const storedCinemaItems = Array.isArray(sections['phim-chieu-rap'])
  ? sections['phim-chieu-rap'].filter((item) => item && item.chieurap === true)
  : [];
const storedVietnamItems = Array.isArray(sections['viet-nam']) ? sections['viet-nam'] : [];

function absoluteKkphimImage(value, cdnBase) {
  const path = String(value || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${String(cdnBase || 'https://phimimg.com').replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function normalizeCinemaItems(items, cdnBase) {
  const seen = new Set();
  return items
    .filter((item) => item && item.chieurap === true && String(item.episode_current || '').toLowerCase().trim() !== 'trailer')
    .filter((item) => {
      const slug = String(item.slug || '').trim();
      if (!slug || !item.name || seen.has(slug)) return false;
      seen.add(slug);
      return true;
    })
    .sort((left, right) => (Date.parse(right.modified?.time || '') || 0) - (Date.parse(left.modified?.time || '') || 0))
    .slice(0, 18)
    .map((item) => ({
      ...item,
      thumb_url: absoluteKkphimImage(item.thumb_url, cdnBase),
      poster_url: absoluteKkphimImage(item.poster_url, cdnBase),
      source_site: 'phimapi',
      source_name: 'KKPhim',
    }));
}

function normalizeVietnamItems(items, cdnBase) {
  const seen = new Set();
  return items
    .filter((item) => item
      && String(item.episode_current || '').toLowerCase().trim() !== 'trailer'
      && Array.isArray(item.country)
      && item.country.some((country) => country?.slug === 'viet-nam'))
    .filter((item) => {
      const slug = String(item.slug || '').trim();
      if (!slug || !item.name || seen.has(slug)) return false;
      seen.add(slug);
      return true;
    })
    .sort((left, right) => (Date.parse(right.modified?.time || '') || 0) - (Date.parse(left.modified?.time || '') || 0))
    .slice(0, 24)
    .map((item) => ({
      ...item,
      thumb_url: absoluteKkphimImage(item.thumb_url, cdnBase),
      poster_url: absoluteKkphimImage(item.poster_url, cdnBase),
      source_site: 'phimapi',
      source_name: 'KKPhim',
    }))
    .filter((item) => item.poster_url || item.thumb_url);
}

async function fetchCurrentCinemaItems() {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(`${KKPHIM_CINEMA_URL}&build=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (response?.ok) {
      const payload = await response.json().catch(() => null);
      const items = normalizeCinemaItems(payload?.data?.items || [], payload?.data?.APP_DOMAIN_CDN_IMAGE);
      if (items.length >= 12) return items;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  return [];
}

async function fetchCurrentVietnamItems() {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(`${KKPHIM_VIETNAM_URL}&build=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (response?.ok) {
      const payload = await response.json().catch(() => null);
      const items = normalizeVietnamItems(payload?.data?.items || [], payload?.data?.APP_DOMAIN_CDN_IMAGE);
      if (items.length >= 12) return items;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  return [];
}

const [currentCinemaItems, currentVietnamItems] = await Promise.all([
  fetchCurrentCinemaItems(),
  fetchCurrentVietnamItems(),
]);
const cinemaItems = currentCinemaItems.length >= 12
  ? currentCinemaItems
  : normalizeCinemaItems(storedCinemaItems, 'https://phimimg.com');
const vietnamItems = currentVietnamItems.length >= 12
  ? currentVietnamItems
  : normalizeVietnamItems(storedVietnamItems, 'https://phimimg.com');

if (cinemaItems.length < 6) {
  throw new Error(`Static cinema API fallback is too small (${cinemaItems.length} items).`);
}
if (vietnamItems.length < 6) {
  throw new Error(`Static Vietnam API fallback is too small (${vietnamItems.length} items).`);
}

await mkdir(apiDirectory, { recursive: true });
const generatedAt = new Date().toISOString();
const hasLiveVietnam = currentVietnamItems.length >= 12;
const hasLiveCinema = currentCinemaItems.length >= 12;
const refreshedSource = {
  ...source,
  generated_at: hasLiveVietnam || hasLiveCinema ? generatedAt : source.generated_at,
  sections: {
    ...sections,
    'phim-chieu-rap': cinemaItems,
    'viet-nam': vietnamItems,
  },
};
await Promise.all([
  ...(hasLiveVietnam || hasLiveCinema ? [writeFile(sourcePath, JSON.stringify(refreshedSource))] : []),
  writeFile(new URL('kkphim-cinema-hot', apiDirectory), JSON.stringify({
    status: true,
    source: hasLiveCinema ? 'kkphim-live-build-fallback' : 'static-pages-fallback',
    generated_at: hasLiveCinema ? generatedAt : source.generated_at || generatedAt,
    items: cinemaItems,
  })),
  writeFile(new URL('kkphim-vietnam-latest', apiDirectory), JSON.stringify({
    status: true,
    source: hasLiveVietnam ? 'kkphim-live-build-fallback' : 'static-pages-fallback',
    generated_at: hasLiveVietnam ? generatedAt : source.generated_at || generatedAt,
    items: vietnamItems,
  })),
  writeFile(new URL('home', apiDirectory), JSON.stringify({
    ...refreshedSource,
    status: true,
    source: hasLiveVietnam || hasLiveCinema ? 'static-pages-fallback-with-live-feeds' : 'static-pages-fallback',
  })),
]);

console.log(`Generated static Pages API fallbacks with ${cinemaItems.length} cinema movies (${hasLiveCinema ? 'live KKPhim' : 'stored snapshot'}) and ${vietnamItems.length} Vietnam movies (${hasLiveVietnam ? 'live KKPhim' : 'stored snapshot'}).`);
