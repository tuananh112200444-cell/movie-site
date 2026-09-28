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
const FALLBACK_SUPABASE_PUBLIC_KEY = 'sb_publishable_Juh45t-R83dfgJI0O4_PQw_iYYoU-yh';
const VSMOV_4K_URL = 'https://vsmov.com/api/danh-sach/4k?page=1';
const CANONICAL_HOME_SELECT = [
  'id','slug','name','origin_name','title_vi','title_en','poster_url','thumb_url',
  'episode_current','episode_total','current_episode','total_episodes','year','type',
  'quality','lang','category','country','source_site','source_name','is_published',
  'seo_catalog_status','superseded_by_movie_id','created_at','updated_at','published_at',
  'last_episode_change_at','tmdb_id','tmdb_vote_average','tmdb_vote_count','tmdb_popularity',
].join(',');
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

function taxonomyHasSlug(value, slug) {
  return Array.isArray(value) && value.some((item) => (
    item && typeof item === 'object' && String(item.slug || '').toLowerCase() === slug
  ));
}

function itemFreshness(item) {
  return Math.max(
    Date.parse(item.last_episode_change_at || '') || 0,
    Date.parse(item.published_at || '') || 0,
    Date.parse(item.updated_at || '') || 0,
    Date.parse(item.created_at || '') || 0,
  );
}

async function fetchCanonicalHomeSection(publicKey, key) {
  const url = new URL(TOP_RATED_URL);
  url.searchParams.set('select', CANONICAL_HOME_SELECT);
  url.searchParams.set('is_published', 'eq.true');
  url.searchParams.set('superseded_by_movie_id', 'is.null');
  url.searchParams.set('order', 'last_episode_change_at.desc.nullslast,published_at.desc.nullslast,updated_at.desc.nullslast');
  url.searchParams.set('limit', '120');

  if (key === 'phim-le') url.searchParams.set('type', 'in.(single,phim-le)');
  if (key === 'phim-bo') url.searchParams.set('type', 'in.(series,phim-bo)');
  if (key === 'hoat-hinh') url.searchParams.set('type', 'eq.hoathinh');
  if (['han-quoc', 'au-my', 'trung-quoc', 'thai-lan'].includes(key)) {
    url.searchParams.set('country', `cs.${JSON.stringify([{ slug: key }])}`);
  }
  if (key === 'trending') {
    const year = new Date().getUTCFullYear();
    url.searchParams.set('year', `gte.${year - 1}`);
    url.searchParams.append('year', `lte.${year + 1}`);
  }

  const response = await fetch(url, {
    headers: { accept: 'application/json', apikey: publicKey, authorization: `Bearer ${publicKey}` },
    signal: AbortSignal.timeout(18_000),
  });
  if (!response.ok) throw new Error(`${key} canonical fallback HTTP ${response.status}`);
  const rows = await response.json();
  const seen = new Set();
  return (Array.isArray(rows) ? rows : [])
    .filter((item) => !/trailer|teaser/i.test(String(item.episode_current || '')))
    .filter((item) => item.poster_url || item.thumb_url)
    .filter((item) => !/(?:^|[^a-z0-9])ophim(?:[^a-z0-9]|$)|ophim1\.com|opstream/i.test(`${item.source_site || ''} ${item.source_name || ''}`))
    .filter((item) => !['hidden', 'draft', 'superseded'].includes(String(item.seo_catalog_status || 'published').toLowerCase()))
    .filter((item) => !['han-quoc', 'au-my', 'trung-quoc', 'thai-lan'].includes(key) || taxonomyHasSlug(item.country, key))
    .map((item) => sanitizeMovie({ ...item, _id: item.id, modified: { time: item.last_episode_change_at || item.published_at || item.updated_at } }))
    .filter(isCanonicalMovie)
    .sort((a, b) => itemFreshness(b) - itemFreshness(a))
    .filter((item) => {
      const slug = String(item.slug || '');
      if (!slug || seen.has(slug)) return false;
      seen.add(slug);
      return true;
    })
    .slice(0, 18);
}

async function fetchCanonicalHomeSections(publicKey) {
  const keys = ['trending','phim-le','phim-bo','hoat-hinh','han-quoc','au-my','trung-quoc','thai-lan'];
  const results = await Promise.all(keys.map(async (key) => [key, await fetchCanonicalHomeSection(publicKey, key)]));
  return Object.fromEntries(results);
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
    .slice(0, 5);
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
  return required.every((key) => {
    // Cinema and VSMov 4K are verified provider snapshots and can retain their
    // upstream identity. Every database-owned rail must use canonical UUIDs.
    const identityCheck = ['phim-chieu-rap', 'vsmov-4k'].includes(key) ? isValidMovie : isCanonicalMovie;
    const items = Array.isArray(sections[key]) ? sections[key].filter(identityCheck) : [];
    const minimum = key === 'vsmov-4k' ? 2 : 5;
    if (items.length < minimum) return false;
    if (['han-quoc','au-my','trung-quoc','thai-lan'].includes(key)) {
      return items.every((item) => taxonomyHasSlug(item.country, key));
    }
    if (key === 'phim-le') return items.every((item) => ['single','phim-le'].includes(String(item.type || '').toLowerCase()));
    if (key === 'phim-bo') return items.every((item) => ['series','phim-bo'].includes(String(item.type || '').toLowerCase()));
    if (key === 'hoat-hinh') return items.every((item) => String(item.type || '').toLowerCase() === 'hoathinh');
    if (key === 'phim-chieu-rap') return items.every((item) => item.chieurap === true);
    if (key === 'top-rated') return items.every((item) => Number(item.tmdb_vote_average || 0) > 0 && Number(item.tmdb_vote_count || 0) >= 10);
    if (key === 'vsmov-4k') return items.every((item) => /vsmov/i.test(`${item.source_site || ''} ${item.source_name || ''}`) && /(?:4k|2160p|uhd)/i.test(String(item.quality || '')));
    return true;
  });
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

async function normalizeExistingTopRatedFallback() {
  try {
    const current = JSON.parse(await readFile(TOP_RATED_OUTPUT_URL, 'utf8'));
    const movies = (Array.isArray(current?.movies) ? current.movies : [])
      .filter(isCanonicalMovie)
      .filter((item) => Number(item.tmdb_vote_average || 0) > 0 && Number(item.tmdb_vote_count || 0) >= 10)
      .filter((item) => !/(?:^|[^a-z0-9])ophim(?:[^a-z0-9]|$)|ophim1\.com|opstream|tmdb.?catalog/i.test(`${item.source_site || ''} ${item.source_name || ''}`))
      .sort((a, b) => Number(b.tmdb_vote_average || 0) - Number(a.tmdb_vote_average || 0) || Number(b.tmdb_vote_count || 0) - Number(a.tmdb_vote_count || 0))
      .slice(0, 5);
    if (movies.length !== 5) return;
    await writeFile(TOP_RATED_OUTPUT_URL, `${JSON.stringify({ ...current, movies }, null, 2)}\n`, 'utf8');
  } catch {
    // A live refresh below can still recreate the fallback.
  }
}

await normalizeExistingTopRatedFallback();

try {
  const envText = await readFile(ENV_URL, 'utf8').catch(() => '');
  const publicKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || envText.match(/^VITE_PUBLIC_SUPABASE_ANON_KEY\s*=\s*["']?([^"'\r\n]+)["']?/m)?.[1]?.trim()
    || FALLBACK_SUPABASE_PUBLIC_KEY;
  if (!publicKey) throw new Error('missing public Supabase key');
  const [verifiedVsmov4K, directTopRated, canonicalSections] = await Promise.all([
    fetchVerifiedVsmov4KFallback(),
    fetchTopRatedFallback(publicKey),
    fetchCanonicalHomeSections(publicKey),
  ]);
  await writeVerifiedVsmovSection(verifiedVsmov4K);
  // Keep the initial five-slide hero fresh even if another homepage shelf
  // is briefly unavailable and prevents a full fallback refresh.
  if (directTopRated.length >= 5) {
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
  // Country/type rails come from canonical Singapore rows. External provider
  // country query parameters are discovery hints only and have historically
  // returned the same generic list for every country.
  const existingSnapshot = JSON.parse(await readFile(OUTPUT_URL, 'utf8').catch(() => '{"sections":{}}'));
  const sourceSections = { ...(existingSnapshot.sections || {}) };
  for (const [key, items] of Object.entries(payload.sections)) {
    if (Array.isArray(items) && items.length >= (key === 'vsmov-4k' ? 2 : 5)) sourceSections[key] = items;
  }
  Object.assign(sourceSections, canonicalSections);
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
        sourceSections[key]
          .filter(['phim-chieu-rap', 'vsmov-4k'].includes(key) ? isValidMovie : isCanonicalMovie)
          .map(sanitizeMovie),
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
