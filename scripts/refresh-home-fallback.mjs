import { readFile, writeFile } from 'node:fs/promises';

const OUTPUT_URL = new URL('../public/home-fallback.json', import.meta.url);
const HOME_PROXY_URL = new URL(
  'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/home-proxy',
);
const REQUIRED_SECTIONS = [
  'trending',
  'top10-single',
  'top10-series',
  'phim-chieu-rap',
  'phim-le',
  'phim-bo',
  'hoat-hinh',
  'han-quoc',
  'au-my',
  'trung-quoc',
  'thai-lan',
];

function isValidMovie(item) {
  return Boolean(
    item
    && typeof item === 'object'
    && String(item.slug || '').trim()
    && String(item.name || '').trim(),
  );
}

function validateSections(sections) {
  if (!sections || typeof sections !== 'object') return false;
  return REQUIRED_SECTIONS.every((key) => (
    Array.isArray(sections[key])
    && sections[key].filter(isValidMovie).length >= 6
  ));
}

async function keepExistingFallback(reason) {
  try {
    const current = JSON.parse(await readFile(OUTPUT_URL, 'utf8'));
    if (validateSections(current.sections)) {
      console.warn(`Home fallback refresh skipped: ${reason}. Kept the existing valid snapshot.`);
      return;
    }
  } catch {
    // The build still owns the release decision. This helper must not turn a
    // temporary network incident into an unrelated frontend build failure.
  }
  console.warn(`Home fallback refresh unavailable: ${reason}. No valid snapshot could be confirmed.`);
}

try {
  HOME_PROXY_URL.searchParams.set('sections', REQUIRED_SECTIONS.join(','));
  const response = await fetch(HOME_PROXY_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json();
  if (!payload?.status || !validateSections(payload.sections)) {
    throw new Error('response failed the homepage section contract');
  }

  const snapshot = {
    status: true,
    source: 'static-home-fallback',
    generated_at: new Date().toISOString(),
    sections: Object.fromEntries(
      REQUIRED_SECTIONS.map((key) => [
        key,
        payload.sections[key].filter(isValidMovie),
      ]),
    ),
  };
  await writeFile(OUTPUT_URL, `${JSON.stringify(snapshot)}\n`, 'utf8');
  console.log(
    `Refreshed public/home-fallback.json (${REQUIRED_SECTIONS.length} sections, `
    + `${snapshot.sections.trending.length} trending movies).`,
  );
} catch (error) {
  await keepExistingFallback(error instanceof Error ? error.message : String(error));
}
