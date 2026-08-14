import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const PROVIDERS = ['vsmov', 'nguonc'] as const;
const DEFAULT_PROVIDERS: Provider[] = ['vsmov', 'nguonc'];
type Provider = typeof PROVIDERS[number];
type SupabaseClient = ReturnType<typeof createClient>;

type MovieRow = {
  id: string;
  slug: string;
  name: string;
  origin_name: string;
  title_vi: string | null;
  title_en: string | null;
  title_original: string | null;
  original_title: string | null;
  normalized_name: string | null;
  year: number | null;
  type: string;
  is_published: boolean | null;
  seo_catalog_status: string;
  tmdb_id: number | null;
};

type IssueRow = {
  issue_key: string;
  movie_id: string;
  issue_type: string;
  severity: number;
  evidence: Record<string, unknown> | null;
};

type CoverageRow = {
  movie_id: string;
  provider: Provider;
  state: string;
  next_retry_at: string | null;
};

type StoredStream = {
  movie_id: string;
  episode_slug: string;
  source: string;
  server_name: string;
  stream_url: string;
  embed_url: string;
  health_status: string;
  failure_count: number;
  last_checked_at: string | null;
};

type ParsedEpisode = {
  number: number;
  name: string;
  slug: string;
  serverName: string;
  m3u8: string;
  embed: string;
  raw: Record<string, unknown>;
};

type ProviderMatch = {
  provider: Provider;
  sourceId: string;
  sourceSlug: string;
  title: string;
  originalTitle: string;
  year: number;
  type: 'single' | 'series';
  discoveredEpisodes: number;
  episodes: ParsedEpisode[];
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function clamp(raw: string | null, fallback: number, minimum: number, maximum: number): number {
  const value = Number(raw || fallback);
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.floor(value))) : fallback;
}

function normalizeTitle(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function splitNames(...values: unknown[]): string[] {
  return [...new Set(values
    .flatMap((value) => String(value || '').split(/\s*(?:,|;|\||\s\/\s)\s*/))
    .map(normalizeTitle)
    .filter((value) => value.length >= 2))];
}

function normalizeType(value: unknown): 'single' | 'series' | null {
  const normalized = normalizeTitle(value);
  if (['single', 'movie', 'phim le'].includes(normalized)) return 'single';
  if (['series', 'tvshows', 'tv show', 'phim bo'].includes(normalized)) return 'series';
  return null;
}

function movieNames(movie: MovieRow): string[] {
  return splitNames(
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.title_original,
    movie.original_title,
    movie.normalized_name,
  );
}

function identityMatches(
  movie: MovieRow,
  candidate: { names: unknown[]; year: unknown; type: unknown },
): boolean {
  const expectedYear = Number(movie.year || 0);
  const candidateYear = Number(candidate.year || 0);
  const expectedType = normalizeType(movie.type);
  const candidateType = normalizeType(candidate.type);
  if (!Number.isInteger(expectedYear) || expectedYear < 1888 || expectedYear > 2200) return false;
  if (candidateYear !== expectedYear || !expectedType || candidateType !== expectedType) return false;
  const expectedNames = new Set(movieNames(movie));
  return splitNames(...candidate.names).some((name) => expectedNames.has(name));
}

function safeHttpsUrl(value: unknown): string {
  const raw = String(value || '').trim().replace(/&amp;/g, '&');
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function slugify(value: unknown): string {
  return normalizeTitle(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

function episodeNumber(name: unknown, slug: unknown): number {
  const label = `${String(name || '')} ${String(slug || '')}`;
  if (/\bfull\b|trọn\s*bộ|hoàn\s*tất/i.test(label)) return 1;
  const numbers = label.match(/\d+/g);
  return numbers?.length ? Number(numbers.at(-1)) || 0 : 0;
}

function episodeSlug(name: unknown, slug: unknown, number: number): string {
  const label = `${String(name || '')} ${String(slug || '')}`;
  if (/\bfull\b|trọn\s*bộ|hoàn\s*tất/i.test(label)) return 'full';
  return slugify(slug) || slugify(name) || (number > 0 ? `tap-${number}` : 'special');
}

function isTrailer(name: unknown, slug: unknown): boolean {
  return /\btrailer\b|nhá\s*hàng/i.test(`${String(name || '')} ${String(slug || '')}`);
}

function isVsmovEmbed(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)streamvsmov\.com$/i.test(url.hostname)
      && /^\/video\/[a-z0-9-]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function isNguoncEmbed(value: string): boolean {
  try {
    const url = new URL(value);
    return /^embed\d+\.streamc\.xyz$/i.test(url.hostname) && url.pathname === '/embed.php';
  } catch {
    return false;
  }
}

function vsmovEpisodes(raw: unknown): ParsedEpisode[] {
  const result: ParsedEpisode[] = [];
  for (const server of Array.isArray(raw) ? raw : []) {
    const record = server as Record<string, unknown>;
    const upstreamServer = String(record.server_name || 'Vietsub').replace(/\s+/g, ' ').trim();
    for (const item of Array.isArray(record.server_data) ? record.server_data : []) {
      const episode = item as Record<string, unknown>;
      if (isTrailer(episode.name, episode.slug)) continue;
      const embed = safeHttpsUrl(episode.link_embed);
      if (!embed || !isVsmovEmbed(embed)) continue;
      const number = episodeNumber(episode.name, episode.slug);
      result.push({
        number,
        name: String(episode.name || (number > 0 ? `Tập ${number}` : 'Đặc biệt')).trim(),
        slug: episodeSlug(episode.name, episode.slug, number),
        serverName: `VSMOV - ${upstreamServer}`,
        // VSMOV uses more than one playlist layout. Never infer this URL from
        // the iframe hostname; resolve the exact playlist from player HTML.
        m3u8: '',
        embed,
        raw: episode,
      });
    }
  }
  return result;
}

function existingStreamCanRemain(row: StoredStream | undefined, episode: ParsedEpisode): boolean {
  if (!row) return false;
  const status = String(row.health_status || '').toLowerCase();
  const healthyOrPending = ['ok', 'unchecked', 'degraded'].includes(status);
  return healthyOrPending && String(row.embed_url || '') === episode.embed && Boolean(row.stream_url);
}

async function resolveVsmovHls(embed: string): Promise<string> {
  if (!isVsmovEmbed(embed)) return '';
  const response = await fetch(embed, {
    headers: {
      Accept: 'text/html,*/*',
      Referer: 'https://vsmov.com/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return '';
  const html = (await response.text()).slice(0, 160_000);
  const candidates = [...html.matchAll(/https:\/\/[^\s"'`<>]+\.m3u8(?:\?[^\s"'`<>]*)?/gi)]
    .map((match) => safeHttpsUrl(match[0].replaceAll('\\/', '/')))
    .filter(Boolean);
  return candidates.find((candidate) => {
    try { return /(^|\.)streamvsmov\.com$/i.test(new URL(candidate).hostname); } catch { return false; }
  }) || '';
}

async function hydrateVsmovEpisodes(
  episodes: ParsedEpisode[],
  existingStreams: StoredStream[],
  limit = 8,
): Promise<ParsedEpisode[]> {
  const existing = new Map(existingStreams
    .filter((row) => row.source === 'vsmov')
    .map((row) => [streamKey(row), row]));
  const pending = episodes.filter((episode) => {
    const stored = existing.get(streamKey({ source: 'vsmov', server_name: episode.serverName, episode_slug: episode.slug }));
    return !existingStreamCanRemain(stored, episode);
  }).slice(0, limit);
  const resolved: ParsedEpisode[] = [];
  for (let index = 0; index < pending.length; index += 3) {
    const batch = pending.slice(index, index + 3);
    const hydrated = await Promise.all(batch.map(async (episode) => ({
      ...episode,
      m3u8: await resolveVsmovHls(episode.embed),
    })));
    resolved.push(...hydrated.filter((episode) => Boolean(episode.m3u8)));
  }
  return resolved;
}

function nguoncEpisodes(raw: unknown): ParsedEpisode[] {
  const result: ParsedEpisode[] = [];
  for (const server of Array.isArray(raw) ? raw : []) {
    const record = server as Record<string, unknown>;
    const upstreamServer = String(record.server_name || 'Vietsub').replace(/\s+/g, ' ').trim();
    for (const item of Array.isArray(record.items) ? record.items : []) {
      const episode = item as Record<string, unknown>;
      if (isTrailer(episode.name, episode.slug)) continue;
      const embed = safeHttpsUrl(episode.embed);
      if (!embed || !isNguoncEmbed(embed)) continue;
      const number = episodeNumber(episode.name, episode.slug);
      result.push({
        number,
        name: String(episode.name || (number > 0 ? `Tập ${number}` : 'Đặc biệt')).trim(),
        slug: episodeSlug(episode.name, episode.slug, number),
        serverName: `Nguồn C - ${upstreamServer}`,
        m3u8: '',
        embed,
        raw: episode,
      });
    }
  }
  return result;
}

async function fetchJson(
  url: string,
  timeoutMs = 18_000,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 KhoPhim-GapSync/1.0',
      ...extraHeaders,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/json/i.test(contentType)) throw new Error(`Unexpected content-type ${contentType}`);
  return await response.json() as Record<string, unknown>;
}

function nguoncYear(movie: Record<string, unknown>): number {
  const category = JSON.stringify(movie.category || {});
  const years = [...category.matchAll(/\b((?:19|20)\d{2})\b/g)].map((match) => Number(match[1]));
  return years.find((year) => year >= 1888 && year <= 2200) || 0;
}

function nguoncType(movie: Record<string, unknown>): 'single' | 'series' | null {
  const categoryText = normalizeTitle(JSON.stringify(movie.category || {}));
  if (categoryText.includes('phim le')) return 'single';
  if (categoryText.includes('phim bo')) return 'series';
  const total = Number(movie.total_episodes || 0);
  return total > 1 ? 'series' : total === 1 ? 'single' : null;
}

async function findVsmov(movie: MovieRow, existingStreams: StoredStream[]): Promise<ProviderMatch | null> {
  const query = movie.origin_name || movie.title_en || movie.name;
  const search = await fetchJson(`https://vsmov.com/api/tim-kiem?keyword=${encodeURIComponent(query)}&limit=8`);
  const expectedNames = new Set(movieNames(movie));
  const candidates = (Array.isArray(search.items) ? search.items : [])
    .map((item) => item as Record<string, unknown>)
    .filter((item) => splitNames(item.name, item.origin_name).some((name) => expectedNames.has(name)))
    .filter((item) => !item.year || Number(item.year) === Number(movie.year));

  for (const candidate of candidates.slice(0, 3)) {
    const slug = slugify(candidate.slug);
    if (!slug) continue;
    const detail = await fetchJson(`https://vsmov.com/api/phim/${encodeURIComponent(slug)}`);
    const providerMovie = (detail.movie || {}) as Record<string, unknown>;
    const discovered = vsmovEpisodes(detail.episodes);
    if (!discovered.length || !identityMatches(movie, {
      names: [providerMovie.name, providerMovie.origin_name],
      year: providerMovie.year,
      type: providerMovie.type,
    })) continue;
    const episodes = await hydrateVsmovEpisodes(discovered, existingStreams);
    if (!episodes.length) continue;
    return {
      provider: 'vsmov',
      sourceId: String(providerMovie._id || candidate._id || ''),
      sourceSlug: slug,
      title: String(providerMovie.name || ''),
      originalTitle: String(providerMovie.origin_name || ''),
      year: Number(providerMovie.year),
      type: normalizeType(providerMovie.type)!,
      discoveredEpisodes: discovered.length,
      episodes,
    };
  }
  return null;
}

async function findNguonc(movie: MovieRow, internalProxySecret: string): Promise<ProviderMatch | null> {
  const query = movie.origin_name || movie.title_en || movie.name;
  const expectedNames = new Set(movieNames(movie));
  const candidateSlugs = new Set<string>();
  const lookupErrors: string[] = [];
  const exactSlug = slugify(movie.slug);
  if (exactSlug) candidateSlugs.add(exactSlug);
  // NguonC may allow an exact detail endpoint while rate-limiting or blocking
  // its search endpoint for a data-centre network. Exact slug is only a lookup
  // hint: title + year + type below remain mandatory before any write.
  try {
    const search = await fetchJson(`https://phim.nguonc.com/api/films/search?keyword=${encodeURIComponent(query)}`);
    const candidates = (Array.isArray(search.items) ? search.items : [])
      .map((item) => item as Record<string, unknown>)
      .filter((item) => splitNames(item.name, item.original_name).some((name) => expectedNames.has(name)));
    for (const candidate of candidates.slice(0, 3)) {
      const slug = slugify(candidate.slug);
      if (slug) candidateSlugs.add(slug);
    }
  } catch (error) {
    lookupErrors.push(`search: ${error instanceof Error ? error.message : String(error)}`);
    // Continue with the guarded exact-detail lookup.
  }

  for (const slug of candidateSlugs) {
    if (!slug) continue;
    let detail: Record<string, unknown>;
    try {
      detail = await fetchJson(`https://phim.nguonc.com/api/film/${encodeURIComponent(slug)}`);
    } catch (error) {
      lookupErrors.push(`direct ${slug}: ${error instanceof Error ? error.message : String(error)}`);
      if (!internalProxySecret) continue;
      try {
        detail = await fetchJson(
          `https://movie-site-eds.pages.dev/internal/nguonc-detail?slug=${encodeURIComponent(slug)}`,
          10_000,
          { 'x-khophim-proxy-secret': internalProxySecret },
        );
      } catch (bridgeError) {
        lookupErrors.push(`bridge ${slug}: ${bridgeError instanceof Error ? bridgeError.message : String(bridgeError)}`);
        continue;
      }
    }
    const providerMovie = (detail.movie || {}) as Record<string, unknown>;
    const year = nguoncYear(providerMovie);
    const type = nguoncType(providerMovie);
    const episodes = nguoncEpisodes(providerMovie.episodes);
    if (!episodes.length || !identityMatches(movie, {
      names: [providerMovie.name, providerMovie.original_name],
      year,
      type,
    })) continue;
    return {
      provider: 'nguonc',
      sourceId: String(providerMovie.id || ''),
      sourceSlug: slug,
      title: String(providerMovie.name || ''),
      originalTitle: String(providerMovie.original_name || ''),
      year,
      type: type!,
      discoveredEpisodes: episodes.length,
      episodes,
    };
  }
  if (lookupErrors.length > 0 && candidateSlugs.size > 0) {
    throw new Error(`NguonC lookup unavailable: ${lookupErrors.slice(0, 4).join('; ')}`);
  }
  return null;
}

async function probeMatch(match: ProviderMatch): Promise<{ ok: boolean; status: number | null; error: string }> {
  const first = match.episodes.find((episode) => episode.m3u8 || episode.embed);
  const url = first?.m3u8 || first?.embed || '';
  if (!url) return { ok: false, status: null, error: 'No playable URL' };
  try {
    const response = await fetch(url, {
      headers: {
        Accept: match.provider === 'vsmov' ? 'application/vnd.apple.mpegurl,*/*' : 'text/html,*/*',
        Referer: 'https://khophim.org/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    const text = (await response.text()).slice(0, 120_000);
    if (match.provider === 'vsmov' && !text.includes('#EXTM3U')) {
      return { ok: false, status: response.status, error: 'Invalid HLS master playlist' };
    }
    if (match.provider === 'nguonc' && /\b404\s+not\s+found\b|video\s+(?:not\s+found|deleted|removed)/i.test(text)) {
      return { ok: false, status: 404, error: 'Embed reports missing video' };
    }
    return { ok: true, status: response.status, error: '' };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function streamKey(row: { source: string; server_name: string; episode_slug: string }): string {
  return `${row.source.trim().toLowerCase()}|${row.server_name.trim().toLowerCase()}|${row.episode_slug.trim().toLowerCase()}`;
}

async function persistMatch(
  supabase: SupabaseClient,
  movie: MovieRow,
  match: ProviderMatch,
  existingStreams: StoredStream[],
): Promise<{ episodes: number; streams: number; unchanged: number }> {
  const existing = new Map(existingStreams
    .filter((row) => row.source === match.provider)
    .map((row) => [streamKey(row), row]));
  const changedEpisodes = match.episodes.filter((episode) => {
    const key = streamKey({ source: match.provider, server_name: episode.serverName, episode_slug: episode.slug });
    const stored = existing.get(key);
    if (!stored) return true;
    const healthyOrPending = ['ok', 'unchecked', 'degraded'].includes(String(stored.health_status || '').toLowerCase());
    if (healthyOrPending) return false;
    // An exact provider match may publish the same URL again after a transient
    // outage. Requeue failed/dead rows even when the URL string is unchanged;
    // they remain hidden behind Provider verification pending until the
    // health checker or browser-validation policy accepts them.
    return true;
  });
  if (!changedEpisodes.length) {
    return { episodes: 0, streams: 0, unchanged: match.episodes.length };
  }

  const sourceId = `${match.provider}:${match.sourceId || match.sourceSlug}`.slice(0, 240);
  const now = new Date().toISOString();
  const numericRows = changedEpisodes.filter((episode) => episode.number > 0).map((episode) => ({
    movie_id: movie.id,
    ophim_id: sourceId,
    episode_number: episode.number,
    episode_name: episode.name,
    slug: episode.slug,
    server_name: episode.serverName,
    link_m3u8: episode.m3u8,
    link_embed: episode.embed,
    thumbnail_url: '',
    duration: '',
    source: match.provider,
    is_backup: true,
    updated_at: now,
  }));
  const episodeRows = changedEpisodes.map((episode) => ({
    movie_id: movie.id,
    ophim_id: sourceId,
    server_name: episode.serverName,
    episode_number: episode.number,
    episode_name: episode.name,
    episode_slug: episode.slug,
    link_m3u8: episode.m3u8,
    link_embed: episode.embed,
    server_data: episode.raw,
  }));
  const streamRows = changedEpisodes.map((episode) => ({
    movie_id: movie.id,
    ophim_id: sourceId,
    episode_slug: episode.slug,
    source: match.provider,
    server_name: episode.serverName,
    stream_url: episode.m3u8,
    embed_url: episode.embed,
    subtitle_url: '',
    quality: 'HD',
    priority: match.provider === 'vsmov' ? 8 : 2,
    is_active: true,
    health_status: 'unchecked',
    failure_count: 0,
    last_error: `Provider verification pending: ${match.provider}`,
    last_checked_at: null,
    updated_at: now,
  }));

  if (numericRows.length) {
    const { error } = await supabase.from('movie_episodes')
      .upsert(numericRows, { onConflict: 'movie_id,server_name,episode_number' });
    if (error) throw new Error(`movie_episodes: ${error.message}`);
  }
  const { error: episodeError } = await supabase.from('episodes')
    .upsert(episodeRows, { onConflict: 'movie_id,server_name,episode_slug' });
  if (episodeError) throw new Error(`episodes: ${episodeError.message}`);
  const { error: streamError } = await supabase.from('streams')
    .upsert(streamRows, { onConflict: 'movie_id,episode_slug,source,server_name' });
  if (streamError) throw new Error(`streams: ${streamError.message}`);

  await supabase.from('movie_api_cache')
    .update({ expires_at: new Date().toISOString() })
    .eq('slug', movie.slug);
  return {
    episodes: Math.max(numericRows.length, episodeRows.length),
    streams: streamRows.length,
    unchanged: match.episodes.length - changedEpisodes.length,
  };
}

function isVietnamPeak(now = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now));
  return (hour >= 11 && hour <= 14) || (hour >= 19 && hour <= 23);
}

function recentProviderCheck(evidence: Record<string, unknown> | null, cooldownHours: number): boolean {
  const checkedAt = Date.parse(String(evidence?.gap_provider_checked_at || ''));
  return Number.isFinite(checkedAt) && Date.now() - checkedAt < cooldownHours * 60 * 60 * 1000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const started = Date.now();
  const url = new URL(req.url);
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const suppliedSecret = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  if (!cronSecret || suppliedSecret !== cronSecret) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const internalProxySecret = Deno.env.get('MOVIE_DETAIL_PROXY_SECRET') || '';
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase service configuration' }, 500);

  const dryRun = url.searchParams.get('dry_run') === '1';
  const targetSlug = String(url.searchParams.get('slug') || '').trim();
  const limit = clamp(url.searchParams.get('limit'), 2, 1, 3);
  const scanLimit = clamp(url.searchParams.get('scan_limit'), 12, limit, 30);
  const cooldownHours = clamp(url.searchParams.get('cooldown_hours'), 24, 6, 168);
  const diagnosticOffset = dryRun ? clamp(url.searchParams.get('offset'), 0, 0, Math.max(0, scanLimit - limit)) : 0;
  const requestedProviders = String(url.searchParams.get('providers') || '')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider): provider is Provider => (PROVIDERS as readonly string[]).includes(provider));
  // NguonC can reject the Supabase Edge network, but findNguonc has a guarded
  // Cloudflare bridge. Both providers therefore participate in the scheduled
  // discovery pool without making a viewer wait for either upstream.
  const activeProviders = requestedProviders.length ? [...new Set(requestedProviders)] : DEFAULT_PROVIDERS;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: capacity } = await supabase.from('runtime_capacity_state')
    .select('mode,last_evaluated_at,last_reason').eq('singleton', true).maybeSingle();
  if (!dryRun && !targetSlug && (capacity?.mode === 'protect' || isVietnamPeak())) {
    return json({
      success: true,
      skipped: true,
      reason: capacity?.mode === 'protect' ? 'runtime_capacity_protect' : 'vietnam_viewing_peak',
      capacity,
    });
  }

  let issues: IssueRow[] = [];
  const missingProvidersByMovie = new Map<string, Provider[]>();
  if (targetSlug) {
    const { data: targetMovie, error: targetError } = await supabase.from('movies')
      .select('id')
      .eq('slug', targetSlug)
      .maybeSingle();
    if (targetError) return json({ success: false, error: `target lookup: ${targetError.message}` }, 500);
    if (!targetMovie?.id) return json({ success: false, error: 'Target movie not found' }, 404);
    issues = [{
      issue_key: `targeted_gap_provider:${targetMovie.id}`,
      movie_id: String(targetMovie.id),
      issue_type: 'targeted_gap_provider',
      severity: 5,
      evidence: {},
    }];
  } else {
    const { data: rawCoverage, error: coverageError } = await supabase.from('movie_provider_coverage')
      .select('movie_id,provider,state,next_retry_at')
      .in('provider', activeProviders)
      .in('state', ['missing', 'unavailable', 'error', 'degraded'])
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order('next_retry_at', { ascending: true, nullsFirst: true })
      .order('updated_at', { ascending: true })
      .limit(scanLimit * 3);
    if (coverageError) return json({ success: false, error: `coverage scan: ${coverageError.message}` }, 500);
    for (const row of (rawCoverage || []) as CoverageRow[]) {
      const current = missingProvidersByMovie.get(row.movie_id) || [];
      if (!current.includes(row.provider)) current.push(row.provider);
      missingProvidersByMovie.set(row.movie_id, current);
    }
    issues = [...missingProvidersByMovie.keys()].map((movieId) => ({
      issue_key: `provider_coverage:${movieId}`,
      movie_id: movieId,
      issue_type: 'provider_coverage_gap',
      severity: 3,
      evidence: {},
    }));
  }
  const eligibleIssues = issues
    .filter((issue) => issue.movie_id && !recentProviderCheck(issue.evidence, cooldownHours))
    .slice(0, scanLimit);
  const movieIds = [...new Set(eligibleIssues.map((issue) => issue.movie_id))];
  if (!movieIds.length) {
    return json({ success: true, dry_run: dryRun, scanned: issues.length, candidates: 0, results: [] });
  }

  const [{ data: rawMovies, error: movieError }, { data: rawStreams, error: streamError }] = await Promise.all([
    supabase.from('movies')
      .select('id,slug,name,origin_name,title_vi,title_en,title_original,original_title,normalized_name,year,type,is_published,seo_catalog_status,tmdb_id')
      .in('id', movieIds),
    supabase.from('streams')
      .select('movie_id,episode_slug,source,server_name,stream_url,embed_url,health_status,failure_count,last_checked_at')
      .in('movie_id', movieIds)
      .in('source', PROVIDERS as unknown as string[]),
  ]);
  if (movieError) return json({ success: false, error: `movie scan: ${movieError.message}` }, 500);
  if (streamError) return json({ success: false, error: `stream scan: ${streamError.message}` }, 500);

  const moviesById = new Map(((rawMovies || []) as MovieRow[]).map((movie) => [movie.id, movie]));
  const issuesByMovie = new Map(eligibleIssues.map((issue) => [issue.movie_id, issue]));
  const streamsByMovie = new Map<string, StoredStream[]>();
  for (const row of (rawStreams || []) as StoredStream[]) {
    const current = streamsByMovie.get(row.movie_id) || [];
    current.push(row);
    streamsByMovie.set(row.movie_id, current);
  }

  const candidates = movieIds
    .map((id) => moviesById.get(id))
    .filter((movie): movie is MovieRow => Boolean(movie))
    .filter((movie) => Number(movie.year) >= 1888 && Number(movie.year) <= 2200 && normalizeType(movie.type) !== null)
    .slice(diagnosticOffset, diagnosticOffset + limit);
  const results: Array<Record<string, unknown>> = [];

  for (const movie of candidates) {
    const issue = issuesByMovie.get(movie.id)!;
    const providerResults: Array<Record<string, unknown>> = [];
    let wroteAnything = false;
    const providersForMovie = missingProvidersByMovie.get(movie.id) || activeProviders;
    for (const provider of providersForMovie) {
      try {
        const movieStreams = streamsByMovie.get(movie.id) || [];
        const match = provider === 'vsmov'
          ? await findVsmov(movie, movieStreams)
          : await findNguonc(movie, internalProxySecret);
        if (!match) {
          providerResults.push({ provider, outcome: 'no_exact_playable_match' });
          if (!dryRun) await supabase.from('movie_provider_coverage').upsert({
            movie_id: movie.id,
            provider,
            state: 'unavailable',
            last_attempt_at: new Date().toISOString(),
            next_retry_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
            last_error: 'No exact title + year + type match',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'movie_id,provider' });
          continue;
        }
        const probe = await probeMatch(match);
        if (!probe.ok) {
          providerResults.push({ provider, outcome: 'probe_failed', probe, matched_slug: match.sourceSlug });
          if (!dryRun) await supabase.from('movie_provider_coverage').upsert({
            movie_id: movie.id,
            provider,
            state: 'error',
            last_attempt_at: new Date().toISOString(),
            next_retry_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
            last_error: probe.error,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'movie_id,provider' });
          continue;
        }
        if (dryRun) {
          providerResults.push({
            provider,
            outcome: 'dry_run_match',
            matched_slug: match.sourceSlug,
            discovered_episodes: match.discoveredEpisodes,
            resolved_episodes: match.episodes.length,
            probe,
          });
          continue;
        }
        const persisted = await persistMatch(supabase, movie, match, movieStreams);
        wroteAnything = wroteAnything || persisted.streams > 0;
        providerResults.push({
          provider,
          outcome: persisted.streams > 0 ? 'stored_pending_health_check' : 'unchanged_or_already_healthy',
          matched_slug: match.sourceSlug,
          matched_title: match.title,
          matched_year: match.year,
          discovered_episodes: match.discoveredEpisodes,
          resolved_episodes: match.episodes.length,
          ...persisted,
        });
        await supabase.from('movie_provider_coverage').upsert({
          movie_id: movie.id,
          provider,
          state: persisted.streams > 0 ? 'pending' : 'ready',
          episode_count: match.discoveredEpisodes,
          playable_stream_count: match.episodes.length,
          last_attempt_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          next_retry_at: null,
          last_error: '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'movie_id,provider' });
      } catch (error) {
        providerResults.push({
          provider,
          outcome: 'provider_error',
          error: error instanceof Error ? error.message : String(error),
        });
        if (!dryRun) await supabase.from('movie_provider_coverage').upsert({
          movie_id: movie.id,
          provider,
          state: 'error',
          last_attempt_at: new Date().toISOString(),
          next_retry_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
          last_error: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'movie_id,provider' });
      }
    }

    if (!dryRun) {
      if (!targetSlug && issue.issue_type !== 'provider_coverage_gap') await supabase.from('catalog_integrity_issues').update({
        evidence: {
          ...(issue.evidence || {}),
          gap_provider_checked_at: new Date().toISOString(),
          gap_provider_results: providerResults,
          gap_provider_contract: 'exact_title_year_type_pending_health_v1',
        },
      }).eq('issue_key', issue.issue_key);
    }
    results.push({
      movie_id: movie.id,
      slug: movie.slug,
      issue_type: issue.issue_type,
      published: movie.is_published,
      wrote_pending_sources: wroteAnything,
      providers: providerResults,
    });
  }

  if (!dryRun) {
    if (candidates.length > 0) {
      await supabase.rpc('refresh_movie_provider_coverage', {
        p_movie_ids: candidates.map((movie) => movie.id),
      });
    }
    await supabase.from('sync_logs').insert({
      function_name: 'sync-gap-playback-providers',
      run_at: new Date().toISOString(),
      scanned: issues.length,
      added: results.filter((result) => result.wrote_pending_sources).length,
      skipped: Math.max(0, issues.length - candidates.length),
      errors: results.reduce((count, result) => count + ((result.providers as Array<Record<string, unknown>>)
        .filter((provider) => provider.outcome === 'provider_error').length), 0),
      details: [],
      elapsed_ms: Date.now() - started,
      success: true,
      metadata: {
        contract: 'exact_title_year_type_pending_health_v1',
        candidates: candidates.length,
        providers: activeProviders,
        dry_run: false,
      },
    });
  }

  return json({
    success: true,
    dry_run: dryRun,
    targeted_slug: targetSlug || null,
    peak_bypass_for_dry_run: dryRun && isVietnamPeak(),
    scanned: issues.length,
    candidates: candidates.length,
    providers: activeProviders,
    results,
    elapsed_ms: Date.now() - started,
  });
});
