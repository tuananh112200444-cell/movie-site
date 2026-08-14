import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EDGE_URL = 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sync-ophim-movies';
const cronSecret = String(process.env.SUPABASE_CRON_SECRET || '').trim();
if (!cronSecret) throw new Error('SUPABASE_CRON_SECRET is required');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const once = args.has('--once');
const providerArg = process.argv.find((value) => value.startsWith('--providers='));
const requested = new Set(String(providerArg?.split('=')[1] || 'ophim,kkphim,vsmov,nguonc').split(',').map((value) => value.trim()));
const statePath = path.resolve('tmp_four_provider_backfill_state.json');
const logPath = path.resolve('tmp_four_provider_backfill.log');
const localEnv = Object.fromEntries((await readFile(path.resolve('.env'), 'utf8').catch(() => '')).split(/\r?\n/)
  .map((line) => line.match(/^([^#=]+)=(.*)$/)).filter(Boolean)
  .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]));
const publicSupabaseUrl = String(localEnv.VITE_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const publicSupabaseAnonKey = String(localEnv.VITE_PUBLIC_SUPABASE_ANON_KEY || '');

const providers = {
  ophim: {
    batchPages: 1,
    initialParallelPages: 3,
    maxParallelPages: 3,
    listUrl: 'https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat?page=1&sort_field=modified.time&sort_type=desc',
    listPage: (page) => `https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat?page=${page}&sort_field=modified.time&sort_type=desc`,
    detailUrls: (slug) => [`https://ophim1.com/v1/api/phim/${encodeURIComponent(slug)}`],
  },
  kkphim: {
    batchPages: 1,
    initialParallelPages: 4,
    maxParallelPages: 4,
    listUrl: 'https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1',
    listPage: (page) => `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${page}`,
    detailUrls: (slug) => [
      `https://phimapi.com/phim/${encodeURIComponent(slug)}`,
      `https://phimapi.net/phim/${encodeURIComponent(slug)}`,
    ],
  },
  vsmov: {
    batchPages: 1,
    initialParallelPages: 3,
    maxParallelPages: 3,
    listUrl: 'https://vsmov.com/api/danh-sach/phim-moi-cap-nhat?page=1',
    listPage: (page) => `https://vsmov.com/api/danh-sach/phim-moi-cap-nhat?page=${page}`,
    detailUrls: (slug) => [`https://vsmov.com/api/phim/${encodeURIComponent(slug)}`],
  },
  nguonc: {
    batchPages: 1,
    initialParallelPages: 3,
    maxParallelPages: 4,
    listUrl: 'https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1',
    listPage: (page) => `https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=${page}`,
    detailUrls: (slug) => [`https://phim.nguonc.com/api/film/${encodeURIComponent(slug)}`],
  },
};

let stopping = false;
let storagePaused = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Page discovery can use the local machine freely, but database mutations
// must share one global budget. Per-provider limits previously multiplied to
// as many as nine concurrent Edge/PostgREST writers.
const edgeMutationLimit = Math.max(1, Math.min(9, Number(process.env.CATALOG_EDGE_WRITERS || 3) || 3));
const detailFetchLimit = Math.max(4, Math.min(32, Number(process.env.CATALOG_DETAIL_FETCHES || 16) || 16));
let activeEdgeMutations = 0;
const edgeMutationWaiters = [];
let activeDetailFetches = 0;
const detailFetchWaiters = [];

async function withEdgeMutationSlot(operation) {
  if (activeEdgeMutations >= edgeMutationLimit) {
    await new Promise((resolve) => edgeMutationWaiters.push(resolve));
  }
  activeEdgeMutations += 1;
  try {
    return await operation();
  } finally {
    activeEdgeMutations -= 1;
    edgeMutationWaiters.shift()?.();
  }
}

async function withDetailFetchSlot(operation) {
  if (activeDetailFetches >= detailFetchLimit) {
    await new Promise((resolve) => detailFetchWaiters.push(resolve));
  }
  activeDetailFetches += 1;
  try {
    return await operation();
  } finally {
    activeDetailFetches -= 1;
    detailFetchWaiters.shift()?.();
  }
}

async function log(event, details = {}) {
  const row = JSON.stringify({ at: new Date().toISOString(), event, ...details });
  await appendFile(logPath, `${row}\n`, 'utf8');
  console.log(row);
}

async function loadState() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    return { startedAt: new Date().toISOString(), providers: {} };
  }
}

let saveQueue = Promise.resolve();
async function saveState(state, { heartbeatOnly = false } = {}) {
  const now = new Date().toISOString();
  state.workerHeartbeatAt = now;
  if (!heartbeatOnly) state.updatedAt = now;
  saveQueue = saveQueue.then(() => writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8'));
  await saveQueue;
}

async function fetchJson(url, options = {}, attempts = 4, timeoutMs = 300_000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 KhoPhim-Catalog-Backfill/1.0 (+https://khophim.org)',
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 1000) }; }
      if (response.ok || response.status === 207) return { response, body };
      if (response.status === 507 || body?.paused) return { response, body };
      throw new Error(`HTTP ${response.status}: ${body?.error || body?.message || 'request failed'}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

function totalPagesFrom(payload) {
  const candidates = [
    payload?.pagination?.totalPages,
    payload?.pagination?.total_pages,
    payload?.paginate?.total_page,
    payload?.data?.params?.pagination?.totalPages,
    payload?.data?.params?.pagination?.total_pages,
  ].map(Number).filter((value) => Number.isInteger(value) && value > 0 && value <= 10_000);
  return candidates[0] || 0;
}

async function remoteStatus(provider) {
  const url = new URL(EDGE_URL);
  url.searchParams.set('provider', provider);
  url.searchParams.set('status', '1');
  const { body } = await fetchJson(url, { headers: { 'x-cron-secret': cronSecret } });
  return body;
}

async function discoverTotalPages(provider, config) {
  const remote = await remoteStatus(provider);
  if (remote?.storage?.can_continue === false) {
    storagePaused = true;
    throw new Error(`Supabase storage soft limit reached at ${remote.storage.database_bytes} bytes`);
  }
  const { body } = await fetchJson(config.listUrl);
  const totalPages = totalPagesFrom(body);
  if (!totalPages) throw new Error(`${provider}: provider pagination is missing`);
  return { totalPages, remoteProgress: remote?.progress || null };
}

function listItems(payload) {
  return Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.data?.items) ? payload.data.items : [];
}

function providerEpisodeRows(detail) {
  const roots = [detail, detail?.data?.item, detail?.item].filter(Boolean);
  for (const root of roots) {
    const episodes = Array.isArray(root?.episodes) ? root.episodes : [];
    if (episodes.length) {
      return episodes.reduce((sum, server) => sum + (Array.isArray(server?.server_data) ? server.server_data.length : 0), 0);
    }
  }
  const items = Array.isArray(detail?.movie?.episodes) ? detail.movie.episodes : [];
  return items.reduce((sum, server) => sum + (Array.isArray(server?.server_data) ? server.server_data.length : 0), 0);
}

function detailChunks(details, maxItems = 5, maxBytes = 600_000, maxEpisodeRows = 160) {
  const chunks = [];
  let current = [];
  let bytes = 32;
  let episodeRows = 0;
  for (const detail of details) {
    const size = Buffer.byteLength(JSON.stringify(detail), 'utf8') + 1;
    const detailRows = providerEpisodeRows(detail);
    if (current.length && (
      current.length >= maxItems
      || bytes + size > maxBytes
      || episodeRows + detailRows > maxEpisodeRows
    )) {
      chunks.push(current);
      current = [];
      bytes = 32;
      episodeRows = 0;
    }
    current.push(detail);
    bytes += size;
    episodeRows += detailRows;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function splitLargeDetail(detail, maxEpisodeRows = 120) {
  if (!Array.isArray(detail?.episodes) || providerEpisodeRows(detail) <= maxEpisodeRows) return [detail];
  const parts = [];
  for (const server of detail.episodes) {
    const rows = Array.isArray(server?.server_data) ? server.server_data : [];
    if (!rows.length) continue;
    for (let offset = 0; offset < rows.length; offset += maxEpisodeRows) {
      parts.push({
        ...detail,
        episodes: [{ ...server, server_data: rows.slice(offset, offset + maxEpisodeRows) }],
      });
    }
  }
  return parts.length ? parts : [detail];
}

async function missingEpisodeDetailParts(provider, detail) {
  if (provider !== 'kkphim' || providerEpisodeRows(detail) <= 120 ||
      !publicSupabaseUrl || !publicSupabaseAnonKey) return splitLargeDetail(detail);
  const providerId = String(detail?.movie?._id || '').trim();
  if (!providerId) return splitLargeDetail(detail);
  const headers = { apikey: publicSupabaseAnonKey, Authorization: `Bearer ${publicSupabaseAnonKey}` };
  const movieUrl = new URL(`${publicSupabaseUrl}/rest/v1/movies`);
  movieUrl.searchParams.set('select', 'id');
  movieUrl.searchParams.set('ophim_id', `eq.${providerId}`);
  movieUrl.searchParams.set('limit', '2');
  const { body: movies } = await fetchJson(movieUrl, { headers }, 1, 15_000);
  if (!Array.isArray(movies) || movies.length !== 1) return splitLargeDetail(detail);
  const stored = new Set();
  for (let offset = 0; ; offset += 1000) {
    const streamUrl = new URL(`${publicSupabaseUrl}/rest/v1/streams`);
    streamUrl.searchParams.set('select', 'episode_slug,server_name');
    streamUrl.searchParams.set('movie_id', `eq.${movies[0].id}`);
    streamUrl.searchParams.set('source', 'eq.phimapi');
    streamUrl.searchParams.set('limit', '1000');
    streamUrl.searchParams.set('offset', String(offset));
    const { body: streams } = await fetchJson(streamUrl, { headers }, 1, 15_000);
    if (!Array.isArray(streams)) return splitLargeDetail(detail);
    for (const stream of streams) {
      stored.add(`${String(stream.server_name || '').toLowerCase()}|${String(stream.episode_slug || '').toLowerCase()}`);
    }
    if (streams.length < 1000) break;
  }
  const episodes = (detail.episodes || []).map((server) => ({
    ...server,
    server_data: (server.server_data || []).filter((row) => !stored.has(
      `${String(server.server_name || '').toLowerCase()}|${String(row.slug || '').toLowerCase()}`
    )),
  })).filter((server) => server.server_data.length);
  const missing = { ...detail, episodes };
  await log('provider_large_detail_delta', {
    provider,
    slug: detail?.movie?.slug,
    totalEpisodeRows: providerEpisodeRows(detail),
    missingEpisodeRows: providerEpisodeRows(missing),
  });
  return splitLargeDetail(missing);
}

async function fetchProviderDetail(config, slug) {
  let lastError;
  for (const url of config.detailUrls(slug)) {
    try {
      // Provider detail endpoints normally respond in under a few seconds.
      // A bounded timeout prevents one stalled title from freezing an entire
      // exact-checkpoint wave for 5–15 minutes; the title is then retried by
      // the durable per-slug recovery path before the page may advance.
      const { body } = await fetchJson(url, {}, 1, 7_000);
      if (body && typeof body === 'object') return body;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`detail unavailable: ${slug}`);
}

async function fetchProviderPage(provider, config, page) {
  const { body: list } = await fetchJson(config.listPage(page));
  const items = listItems(list);
  const details = [];
  const missingSlugs = [];
  const rows = await Promise.all(items.map(async (item) => {
      const slug = String(item?.slug || '').trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
      try {
        return await withDetailFetchSlot(() => fetchProviderDetail(config, slug));
      } catch (error) {
        // Some providers retain a title in pagination after removing its
        // detail route. Preserve the list metadata privately with no streams;
        // later syncs can promote it when the detail endpoint returns.
        await log('provider_detail_fallback', { provider, page, slug, error: error instanceof Error ? error.message : String(error) });
        return { movie: item, episodes: [] };
      }
    }));
  details.push(...rows.filter(Boolean));
  if (items.length && !details.length) throw new Error(`${provider} page ${page}: no details could be fetched`);
  return { details, itemCount: items.length, missingSlugs };
}

async function syncSubmittedPage(provider, config, page, totalPages) {
  const { details, itemCount, missingSlugs } = await fetchProviderPage(provider, config, page);
  if (!itemCount) return { next_page: totalPages + 1, scanned: 0, success: true };
  let combined = { next_page: page + 1, scanned: 0, created: 0, updated: 0, episodes_inserted: 0, errors: [], transient_errors: [] };
  // NguonC amortizes Edge startup in groups. KKPhim uses small groups and
  // splits any failed group into exact single-movie retries below.
  const chunkSize = provider === 'nguonc' ? 12 : 4;
  const chunkResults = await Promise.all(detailChunks(details, chunkSize, 900_000, 220).map(async (chunk) => {
    const chunkSlugs = chunk
      .map((detail) => String(detail?.movie?.slug || detail?.data?.item?.slug || detail?.item?.slug || '').trim())
      .filter(Boolean);
    const url = new URL(EDGE_URL);
    for (const [key, value] of Object.entries({
      provider, episodes: '1', cursor: '1', cursor_key: `full-catalog-20260812-${provider}`,
      start_page: String(page), total_pages: String(totalPages), limit: String(chunk.length),
      ...(['kkphim', 'nguonc'].includes(provider) ? { set_based_bulk: '1', bulk_fast_path: '1' } : {}),
      ...(dryRun ? { dry_run: '1' } : {}),
    })) url.searchParams.set(key, value);
    let body;
    try {
      ({ body } = await withEdgeMutationSlot(() => fetchJson(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
          body: JSON.stringify({ page, details: chunk }),
        }, 1, provider === 'kkphim' ? 45_000 : 150_000)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/http 503|function failed to start|storage soft limit/i.test(message)) throw error;
      return {
        scanned: 0, created: 0, updated: 0, episodes_inserted: 0,
        errors: chunkSlugs.map((slug) => `[${slug}] submitted chunk: ${message}`),
      };
    }
    if (body?.paused || body?.reason === 'storage_soft_limit') {
      storagePaused = true;
      throw new Error('Supabase storage soft limit reached');
    }
    const responseErrors = [...(body?.errors || []), ...(body?.transient_errors || [])];
    const unscopedErrors = responseErrors.filter((message) => !/^\[[^\]]+\]/.test(String(message || '')));
    const scopedErrors = responseErrors.filter((message) => /^\[[^\]]+\]/.test(String(message || '')));
    if (unscopedErrors.length || Number(body?.scanned || 0) !== chunk.length) {
      const reason = unscopedErrors.join('; ') || `bulk scanned ${Number(body?.scanned || 0)}/${chunk.length}`;
      scopedErrors.push(...chunkSlugs.map((slug) => `[${slug}] submitted chunk incomplete: ${reason}`));
    }
    return {
      scanned: Number(body?.scanned || 0),
      created: Number(body?.created || 0),
      updated: Number(body?.updated || 0),
      episodes_inserted: Number(body?.episodes_inserted || 0),
      errors: scopedErrors,
    };
  }));
  combined = chunkResults.reduce((total, part) => ({
    ...total,
    scanned: total.scanned + part.scanned,
    created: total.created + part.created,
    updated: total.updated + part.updated,
    episodes_inserted: total.episodes_inserted + part.episodes_inserted,
    errors: [...total.errors, ...part.errors],
  }), combined);
  combined.errors.push(...missingSlugs.map((slug) => `[${slug}] local detail unavailable`));
  combined.item_count = itemCount;
  return combined;
}

async function syncServerBatch(provider, page, totalPages, batchPages) {
  const pages = Math.min(batchPages, totalPages - page + 1);
  const url = new URL(EDGE_URL);
  for (const [key, value] of Object.entries({
    provider, pages: String(pages), limit: String(pages * 24), episodes: '1',
    start_page: String(page), max_page: String(totalPages),
    total_pages: String(totalPages), ...(dryRun ? { dry_run: '1' } : {}),
  })) url.searchParams.set(key, value);
  const { body } = await fetchJson(url, { headers: { 'x-cron-secret': cronSecret } });
  if (body?.paused || body?.reason === 'storage_soft_limit') {
    storagePaused = true;
    throw new Error('Supabase storage soft limit reached');
  }
  return body;
}

function failedSlugs(result) {
  return [...new Set([...(result?.errors || []), ...(result?.transient_errors || [])]
    .map((message) => String(message || '').match(/^\[([^\]]+)\]/)?.[1] || '')
    .filter((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))];
}

async function retryFailedSlugs(provider, result) {
  if (dryRun) return [];
  const unresolved = [];
  for (const slug of failedSlugs(result).slice(0, 24)) {
    let repaired = false;
    for (let attempt = 1; attempt <= 2 && !repaired; attempt += 1) {
      try {
        const detail = await withDetailFetchSlot(() => fetchProviderDetail(providers[provider], slug));
        const parts = provider === 'kkphim' ? await missingEpisodeDetailParts(provider, detail) : [detail];
        repaired = true;
        for (const part of parts) {
          const url = new URL(EDGE_URL);
          for (const [key, value] of Object.entries({
            provider, episodes: '1', set_based_bulk: '1', bulk_fast_path: '1', limit: '1',
          })) url.searchParams.set(key, value);
          const { body } = await withEdgeMutationSlot(() => fetchJson(
            url,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
              body: JSON.stringify({ page: 1, details: [part] }),
            },
            1,
            provider === 'kkphim' ? 45_000 : 150_000,
          ));
          if (!body?.success || Number(body?.scanned || 0) !== 1 ||
              (body?.errors || []).length || (body?.transient_errors || []).length) {
            await log('provider_repair_part_rejected', {
              provider,
              slug,
              scanned: Number(body?.scanned || 0),
              error: body?.error || body?.message || '',
              errors: [...(body?.errors || []), ...(body?.transient_errors || [])].slice(0, 5),
            });
            repaired = false;
            break;
          }
        }
      } catch {
        repaired = false;
      }
      if (!repaired && attempt < 2) await sleep(2000);
    }
    if (!repaired) unresolved.push(slug);
  }
  return unresolved;
}

async function drainPendingSlug(provider, local) {
  if (!(local.pendingSlugs || []).length) return;
  const slug = local.pendingSlugs[0];
  const unresolved = await retryFailedSlugs(provider, { errors: [`[${slug}] deferred retry`] });
  if (!unresolved.includes(slug)) {
    local.pendingSlugs = local.pendingSlugs.filter((value) => value !== slug);
    await log('provider_deferred_recovered', { provider, slug });
  }
}

async function runProvider(provider, config, state) {
  const hadLocalCheckpoint = Boolean(state.providers[provider]);
  const local = state.providers[provider] || { nextPage: 1, status: 'pending', batches: 0, failures: 0 };
  state.providers[provider] = local;
  try {
    const { totalPages, remoteProgress } = await discoverTotalPages(provider, config);
    local.totalPages = totalPages;
    if (!dryRun && local.status === 'dry-run') {
      local.nextPage = Number(remoteProgress?.next_page || 1);
      local.batches = 0;
      local.failures = 0;
    }
    // The local checkpoint is contiguous and therefore authoritative. A
    // concurrent later page may finish before an earlier page and make the
    // remote high-water mark jump; adopting that mark after a restart could
    // skip the unfinished lower page. Remote progress is only a bootstrap
    // fallback when this machine has no checkpoint yet.
    if (!hadLocalCheckpoint && remoteProgress?.next_page > local.nextPage) {
      local.nextPage = Number(remoteProgress.next_page);
    }
    const concurrencyProfile = `exact-bulk-fast-v10:${edgeMutationLimit}:${detailFetchLimit}:${config.maxParallelPages}`;
    if (local.concurrencyProfile !== concurrencyProfile) {
      local.concurrencyProfile = concurrencyProfile;
      local.parallelPages = config.initialParallelPages;
      local.cleanWaves = 0;
    } else {
      local.parallelPages = Math.max(
        1,
        Math.min(config.maxParallelPages, Number(local.parallelPages || config.initialParallelPages)),
      );
      local.cleanWaves = Number(local.cleanWaves || 0);
    }
    if (remoteProgress?.status === 'complete' || local.nextPage > totalPages) {
      if (!dryRun && (local.pendingSlugs || []).length) {
        const attempted = [...new Set(local.pendingSlugs)].slice(0, 24);
        local.status = 'repairing';
        await saveState(state);
        const unresolved = await retryFailedSlugs(provider, {
          errors: attempted.map((slug) => `[${slug}] post-scan repair`),
        });
        const unresolvedSet = new Set(unresolved);
        const attemptedSet = new Set(attempted);
        local.pendingSlugs = (local.pendingSlugs || []).filter((slug) =>
          !attemptedSet.has(slug) || unresolvedSet.has(slug)
        );
        await log('provider_postscan_repairs', {
          provider,
          attempted: attempted.length,
          recovered: attempted.length - unresolved.length,
          unresolved,
        });
      }
      local.status = (local.pendingSlugs || []).length ? 'retrying' : 'complete';
      if (local.status === 'complete') delete local.lastError;
      else local.lastError = `${provider}: ${local.pendingSlugs.length} post-scan repair(s) remain`;
      await saveState(state);
      return;
    }
    local.status = dryRun ? 'dry-run' : 'running';
    await saveState(state);
    await log('provider_started', { provider, nextPage: local.nextPage, totalPages, dryRun });

    while (!stopping && !storagePaused && local.nextPage <= totalPages) {
      const waveStart = local.nextPage;
      const pages = Array.from(
        { length: Math.min(local.parallelPages, totalPages - waveStart + 1) },
        (_, index) => waveStart + index,
      );
      try {
        // Historical per-slug repairs are retained durably and handled after
        // the contiguous page scan. Interleaving them here previously let one
        // stale/removed provider slug stall otherwise healthy pages for minutes.
        const wave = await Promise.all(pages.map(async (page) => {
          const result = await syncSubmittedPage(provider, config, page, totalPages);
          const unresolvedSlugs = await retryFailedSlugs(provider, result);
          if (unresolvedSlugs.length) {
            throw new Error(`${provider} page ${page}: ${unresolvedSlugs.length} movie(s) remain unresolved`);
          }
          const next = Number(result?.next_page || 0);
          if (!Number.isInteger(next) || next <= page) throw new Error(`${provider}: invalid checkpoint ${next}`);
          return { page, next, result, unresolvedSlugs };
        }));
        local.nextPage = Math.max(...wave.map((item) => item.next));
        local.batches += wave.length;
        local.failures = 0;
        delete local.lastError;
        const waveMessages = wave.flatMap(({ result }) => [
          ...(result?.errors || []),
          ...(result?.transient_errors || []),
        ]);
        const scannedInWave = wave.reduce((sum, { result }) => sum + Number(result?.scanned || 0), 0);
        const pressureMessages = waveMessages.filter((message) =>
          /timeout|timed out|statement timeout|http 5\d\d/i.test(String(message))
        );
        const unresolvedInWave = wave.reduce((sum, item) => sum + item.unresolvedSlugs.length, 0);
        const upstreamPressure = waveMessages.some((message) =>
          /http 429|too many requests|rate limit/i.test(String(message))
        ) || (unresolvedInWave > 0 && pressureMessages.length >= Math.max(3, Math.ceil(scannedInWave * 0.1)));
        if (upstreamPressure) {
          local.parallelPages = Math.max(1, Math.floor(local.parallelPages / 2));
          local.cleanWaves = 0;
        } else {
          local.cleanWaves += 1;
          if (local.cleanWaves >= 5 && local.parallelPages < config.maxParallelPages) {
            local.parallelPages += 1;
            local.cleanWaves = 0;
          }
        }
        for (const item of wave.sort((a, b) => a.page - b.page)) {
          const { page, next, result, unresolvedSlugs } = item;
          local.lastResult = {
            at: new Date().toISOString(), page, nextPage: next,
            scanned: result?.scanned || 0, created: result?.created || 0,
            updated: result?.updated || 0, episodes: result?.episodes_inserted || 0,
            errors: [...(result?.errors || []), ...(result?.transient_errors || [])].slice(0, 20),
            unresolvedSlugs,
          };
          local.pendingSlugs = [...new Set([...(local.pendingSlugs || []), ...unresolvedSlugs])].slice(-500);
          await log('provider_batch', { provider, parallelPages: local.parallelPages, ...local.lastResult });
        }
        local.status = local.nextPage > totalPages ? 'complete' : local.status;
        await saveState(state);
        if (once) break;
        await sleep(1200);
      } catch (error) {
        local.failures += 1;
        local.parallelPages = Math.max(1, Math.floor(local.parallelPages / 2));
        local.cleanWaves = 0;
        local.status = storagePaused ? 'paused' : 'retrying';
        local.lastError = error instanceof Error ? error.message : String(error);
        await saveState(state);
        await log('provider_retry', {
          provider,
          page: waveStart,
          parallelPages: local.parallelPages,
          failures: local.failures,
          error: local.lastError,
        });
        if (storagePaused || once) break;
        await sleep(Math.min(60_000, 3000 * 2 ** Math.min(local.failures, 4)));
      }
    }
  } catch (error) {
    local.status = storagePaused ? 'paused' : 'error';
    local.lastError = error instanceof Error ? error.message : String(error);
    await saveState(state);
    await log('provider_error', { provider, error: local.lastError });
  }
}

const state = await loadState();
const selected = Object.entries(providers).filter(([provider]) => requested.has(provider));
const heartbeatTimer = setInterval(() => {
  void saveState(state, { heartbeatOnly: true }).catch(() => undefined);
}, 30_000);
heartbeatTimer.unref();
try {
  await log('backfill_started', { providers: selected.map(([provider]) => provider), dryRun, once });
  await Promise.all(selected.map(([provider, config]) => runProvider(provider, config, state)));
  await saveState(state);
  await log('backfill_stopped', { stopping, storagePaused, statuses: state.providers });
} finally {
  clearInterval(heartbeatTimer);
}
