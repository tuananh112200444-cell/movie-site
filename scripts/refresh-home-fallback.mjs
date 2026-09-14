import { readFile, writeFile } from 'node:fs/promises';

const OUTPUT_URL = new URL('../public/home-fallback.json', import.meta.url);
const TOP_RATED_OUTPUT_URL = new URL('../public/top-rated-fallback.json', import.meta.url);
const ENV_URL = new URL('../.env', import.meta.url);
const HOME_PROXY_URL = new URL(
  'https://ceoxbhsdodllziyxmbqr.supabase.co/functions/v1/home-proxy',
);
const TOP_RATED_URL = new URL(
  'https://ceoxbhsdodllziyxmbqr.supabase.co/rest/v1/movies',
);
const VSMOV_4K_URL = 'https://vsmov.com/api/danh-sach/4k?page=1';
const REQUIRED_SECTIONS = [
  'top-rated',
  'vsmov-4k',
  'trending',
  'top10-single',
  'top10-series',
  'onlyflix-moi',
  'phim-chieu-rap',
  'phim-le',
  'phim-bo',
  'hoat-hinh',
  'han-quoc',
  'au-my',
  'trung-quoc',
  'thai-lan',
];
const PLAYBACK_REQUIRED_SECTIONS = [
  'top-rated',
  'vsmov-4k',
  'trending',
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

function isCanonicalMovie(item) {
  return isValidMovie(item)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(item._id || item.id || ''));
}

function repairUtf8Mojibake(value) {
  const text = String(value || '');
  if (!/(?:Ã|Ä|áº|á»)/.test(text)) return text;
  const decoded = Buffer.from(text, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) return text;
  return /(?:Ã|Ä|áº|á»)/.test(decoded) ? text : decoded;
}

function sanitizeMovie(item) {
  if (!isValidMovie(item)) return item;
  return {
    ...item,
    name: repairUtf8Mojibake(item.name),
    origin_name: repairUtf8Mojibake(item.origin_name),
    episode_current: repairUtf8Mojibake(item.episode_current),
  };
}

async function fetchTopRatedFallback(publicKey) {
  const url = new URL(TOP_RATED_URL);
  url.searchParams.set('select', 'id,slug,name,origin_name,poster_url,thumb_url,hero_backdrop_url,hero_poster_url,episode_current,episode_total,current_episode,total_episodes,quality,lang,year,type,category,country,source_site,source_name,is_published,seo_catalog_status,superseded_by_movie_id,created_at,published_at,last_episode_change_at,tmdb_id,tmdb_vote_average,tmdb_vote_count,tmdb_popularity');
  url.searchParams.set('is_published', 'eq.true');
  url.searchParams.set('tmdb_vote_average', 'gt.0');
  url.searchParams.set('tmdb_vote_count', 'gte.10');
  url.searchParams.set('superseded_by_movie_id', 'is.null');
  url.searchParams.set('order', 'tmdb_vote_average.desc.nullslast,tmdb_vote_count.desc.nullslast,tmdb_popularity.desc.nullslast');
  url.searchParams.set('limit', '100');
  const response = await fetch(url, {
    headers: { accept: 'application/json', apikey: publicKey, authorization: `Bearer ${publicKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.warn(`Top-rated fallback query failed with HTTP ${response.status}: ${detail.slice(0, 240)}`);
    return [];
  }
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((item) => !/trailer|teaser/i.test(String(item.episode_current || '')))
    .filter((item) => !['hidden', 'draft', 'superseded', 'awaiting_playback'].includes(String(item.seo_catalog_status || 'published').toLowerCase()))
    .filter((item) => !/(?:^|[^a-z0-9])ophim(?:[^a-z0-9]|$)|ophim1\.com|opstream|tmdb.?catalog/i.test(`${item.source_site || ''} ${item.source_name || ''}`))
    .map((item) => sanitizeMovie({ ...item, _id: item.id }))
    .filter(isCanonicalMovie)
    .slice(0, 8);
}

function providerItems(payload) {
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function providerDetailEpisodes(payload) {
  const root = payload?.data?.item || payload?.data || payload || {};
  const servers = Array.isArray(root.episodes)
    ? root.episodes
    : Array.isArray(payload?.episodes)
      ? payload.episodes
      : [];
  return servers.flatMap((server) => (
    Array.isArray(server?.server_data)
      ? server.server_data
      : Array.isArray(server?.items)
        ? server.items
        : []
  ));
}

async function fetchVerifiedVsmov4KFallback() {
  const listResponse = await fetch(VSMOV_4K_URL, {
    headers: { accept: 'application/json', 'user-agent': 'KhoPhim/1.0 (+https://khophim.org)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!listResponse.ok) return [];
  const listPayload = await listResponse.json();
  const candidates = providerItems(listPayload).filter(isValidMovie).slice(0, 24);
  const verified = await Promise.all(candidates.map(async (item) => {
    try {
      const detailResponse = await fetch(`https://vsmov.com/api/phim/${encodeURIComponent(item.slug)}`, {
        headers: { accept: 'application/json', 'user-agent': 'KhoPhim/1.0 (+https://khophim.org)' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!detailResponse.ok) return null;
      const detailPayload = await detailResponse.json();
      if (providerDetailEpisodes(detailPayload).length === 0) return null;
      const detailRoot = detailPayload?.data?.item || detailPayload?.data?.movie || detailPayload?.movie || {};
      return sanitizeMovie({
        ...item,
        ...detailRoot,
        slug: item.slug,
        _id: String(item._id || item.id || detailRoot._id || detailRoot.id || item.slug),
        quality: '4K',
        source_site: 'vsmov',
        source_name: 'VSMov',
      });
    } catch {
      return null;
    }
  }));
  return verified.filter(isValidMovie);
}

async function writeVerifiedVsmovSection(movies) {
  if (movies.length < 2) return;
  try {
    const current = JSON.parse(await readFile(OUTPUT_URL, 'utf8'));
    current.status = true;
    current.source = 'static-home-fallback';
    current.generated_at = new Date().toISOString();
    current.sections = { ...(current.sections || {}), 'vsmov-4k': movies };
    await writeFile(OUTPUT_URL, `${JSON.stringify(current)}\n`, 'utf8');
    console.log(`Refreshed verified VSMov 4K fallback (${movies.length} movies).`);
  } catch {
    // The regular full-snapshot path below can still create the file.
  }
}

function validateSections(sections, requireTopRated = true) {
  if (!sections || typeof sections !== 'object') return false;
  const required = requireTopRated
    ? PLAYBACK_REQUIRED_SECTIONS
    : PLAYBACK_REQUIRED_SECTIONS.filter((key) => key !== 'top-rated');
  return required.every((key) => (
    Array.isArray(sections[key])
    && sections[key].filter(isCanonicalMovie).length >= (key === 'vsmov-4k' ? 2 : 5)
  ));
}

async function keepExistingFallback(reason) {
  try {
    const current = JSON.parse(await readFile(OUTPUT_URL, 'utf8'));
    if (validateSections(current.sections, false)) {
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
  const envText = await readFile(ENV_URL, 'utf8').catch(() => '');
  const publicKey = envText.match(/^VITE_PUBLIC_SUPABASE_ANON_KEY\s*=\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim() ?? '';
  if (!publicKey) throw new Error('missing public Supabase key');
  const verifiedVsmov4K = await fetchVerifiedVsmov4KFallback();
  await writeVerifiedVsmovSection(verifiedVsmov4K);
  // Keep the initial eight-slide hero fresh even if another homepage shelf
  // is briefly unavailable and prevents a full fallback refresh.
  const directTopRated = await fetchTopRatedFallback(publicKey);
  if (directTopRated.length >= 8) {
    await writeFile(TOP_RATED_OUTPUT_URL, `${JSON.stringify({
      status: true,
      source: 'supabase-top-rated-fallback',
      generated_at: new Date().toISOString(),
      movies: directTopRated,
    }, null, 2)}\n`, 'utf8');
  }
  HOME_PROXY_URL.searchParams.set('sections', REQUIRED_SECTIONS.join(','));
  const response = await fetch(HOME_PROXY_URL, {
    headers: { accept: 'application/json', apikey: publicKey, origin: 'https://khophim.org' },
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json();
  if (!payload?.status || !payload.sections) throw new Error('response failed the homepage section contract');
  let sourceSections = payload.sections;
  if (verifiedVsmov4K.length >= 2) sourceSections['vsmov-4k'] = verifiedVsmov4K;
  if (!validateSections(sourceSections, false)) {
    const current = JSON.parse(await readFile(OUTPUT_URL, 'utf8'));
    if (!validateSections(current.sections, false)) {
      const counts = Object.fromEntries(REQUIRED_SECTIONS.map((key) => [key, payload?.sections?.[key]?.length ?? 0]));
      throw new Error(`response failed the homepage section contract: ${JSON.stringify(counts)}`);
    }
    sourceSections = current.sections;
  }
  sourceSections['top-rated'] = directTopRated;
  if (!validateSections(sourceSections)) throw new Error('top-rated fallback contains fewer than five canonical movies');

  if ((sourceSections['top10-single']?.length ?? 0) < 6) {
    sourceSections['top10-single'] = (sourceSections['phim-le'] ?? []).slice(0, 10);
  }
  if ((sourceSections['top10-series']?.length ?? 0) < 6) {
    sourceSections['top10-series'] = (sourceSections['phim-bo'] ?? []).slice(0, 10);
  }

  const snapshot = {
    status: true,
    source: 'static-home-fallback',
    generated_at: new Date().toISOString(),
    sections: Object.fromEntries(
      REQUIRED_SECTIONS.map((key) => [
        key,
        sourceSections[key].filter(isCanonicalMovie).map(sanitizeMovie),
      ]),
    ),
  };
  if (/(?:Ã|Ä|áº|á»)/.test(JSON.stringify(snapshot))) {
    throw new Error('response still contains mojibake after sanitization');
  }
  await writeFile(OUTPUT_URL, `${JSON.stringify(snapshot)}\n`, 'utf8');
  console.log(
    `Refreshed public/home-fallback.json (${REQUIRED_SECTIONS.length} sections, `
    + `${snapshot.sections.trending.length} trending movies).`,
  );
} catch (error) {
  await keepExistingFallback(error instanceof Error ? error.message : String(error));
}
