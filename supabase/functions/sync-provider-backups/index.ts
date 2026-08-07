import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

type MovieRow = {
  id: string;
  slug: string;
  name: string | null;
  source_site: string | null;
  source_name: string | null;
};

type StreamRow = {
  movie_id: string;
  episode_slug: string | null;
  source: string | null;
  stream_url: string | null;
  embed_url: string | null;
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

function providerFromText(value: unknown): 'ophim' | 'kkphim' | null {
  const text = String(value || '').toLowerCase();
  if (/kkphim|phimapi|phim1280/.test(text)) return 'kkphim';
  if (/ophim|opstream/.test(text)) return 'ophim';
  return null;
}

function providerFromStream(row: StreamRow): string | null {
  const explicit = providerFromText(row.source);
  if (explicit) return explicit;
  const host = `${row.stream_url || ''} ${row.embed_url || ''}`;
  return providerFromText(host);
}

function otherProvider(primary: 'ophim' | 'kkphim'): 'ophim' | 'kkphim' {
  return primary === 'ophim' ? 'kkphim' : 'ophim';
}

function normalizedEpisode(row: StreamRow): string {
  return String(row.episode_slug || 'full').trim().toLowerCase() || 'full';
}

function needsPartnerCoverage(movie: MovieRow, rows: StreamRow[]): { provider: 'ophim' | 'kkphim'; missing: number; primary: number } | null {
  const primary = providerFromText(`${movie.source_site || ''} ${movie.source_name || ''}`);
  if (!primary) return null;
  const partner = otherProvider(primary);
  const byEpisode = new Map<string, Set<string>>();
  for (const row of rows) {
    const provider = providerFromStream(row);
    if (!provider) continue;
    const episode = normalizedEpisode(row);
    const current = byEpisode.get(episode) || new Set<string>();
    current.add(provider);
    byEpisode.set(episode, current);
  }

  let primaryEpisodes = 0;
  let missingPartner = 0;
  for (const providers of byEpisode.values()) {
    if (!providers.has(primary)) continue;
    primaryEpisodes += 1;
    if (!providers.has(partner)) missingPartner += 1;
  }
  // The source catalog can have stale metadata without stream rows. Do not
  // attempt an ambiguous repair in that case.
  if (primaryEpisodes === 0 || missingPartner === 0) return null;
  return { provider: partner, missing: missingPartner, primary: primaryEpisodes };
}

async function invokePartnerSync(
  supabaseUrl: string,
  cronSecret: string,
  movie: MovieRow,
  provider: 'ophim' | 'kkphim',
  dryRun: boolean,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  const query = new URLSearchParams({
    provider,
    movie_id: movie.id,
    episodes: '1',
    strict_missing_detail: '1',
  });
  if (dryRun) query.set('dry_run', '1');
  const response = await fetch(`${supabaseUrl}/functions/v1/sync-ophim-movies?${query}`, {
    headers: { 'x-cron-secret': cronSecret },
    signal: AbortSignal.timeout(55_000),
  });
  let body: Record<string, unknown> | null = null;
  try { body = await response.json() as Record<string, unknown>; } catch { /* status is enough */ }
  return { ok: response.ok && body?.success !== false, status: response.status, body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const requestUrl = new URL(req.url);
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const providedSecret = requestUrl.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
  if (!cronSecret || providedSecret !== cronSecret) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase service configuration' }, 500);

  const dryRun = requestUrl.searchParams.get('dry_run') === '1';
  const limit = clamp(requestUrl.searchParams.get('limit'), 3, 1, 4);
  const scanLimit = clamp(requestUrl.searchParams.get('scan_limit'), 36, limit, 72);
  const cursorKey = 'sync-provider-backups:published:v1';
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: cursor } = await supabase.from('sync_cursors').select('page').eq('key', cursorKey).maybeSingle();
  const page = Math.max(1, Number(cursor?.page || 1) || 1);
  const from = (page - 1) * scanLimit;
  const { data: movies, error: movieError } = await supabase
    .from('movies')
    .select('id,slug,name,source_site,source_name')
    .eq('is_published', true)
    .order('id', { ascending: true })
    .range(from, from + scanLimit - 1);
  if (movieError) return json({ success: false, error: `movie scan: ${movieError.message}` }, 500);

  const batch = (movies || []) as MovieRow[];
  const ids = batch.map((movie) => movie.id);
  const { data: streams, error: streamError } = ids.length
    ? await supabase.from('streams')
      .select('movie_id,episode_slug,source,stream_url,embed_url')
      .in('movie_id', ids)
      .eq('is_active', true)
      .limit(5000)
    : { data: [], error: null };
  if (streamError) return json({ success: false, error: `stream scan: ${streamError.message}` }, 500);

  const streamsByMovie = new Map<string, StreamRow[]>();
  for (const row of (streams || []) as StreamRow[]) {
    const current = streamsByMovie.get(row.movie_id) || [];
    current.push(row);
    streamsByMovie.set(row.movie_id, current);
  }

  const candidates = batch
    .map((movie) => ({ movie, coverage: needsPartnerCoverage(movie, streamsByMovie.get(movie.id) || []) }))
    .filter((item): item is { movie: MovieRow; coverage: { provider: 'ophim' | 'kkphim'; missing: number; primary: number } } => item.coverage !== null)
    .sort((a, b) => b.coverage.missing - a.coverage.missing)
    .slice(0, limit);

  const results: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    const result = await invokePartnerSync(supabaseUrl, cronSecret, candidate.movie, candidate.coverage.provider, dryRun);
    results.push({
      movie_id: candidate.movie.id,
      slug: candidate.movie.slug,
      target_provider: candidate.coverage.provider,
      primary_episodes: candidate.coverage.primary,
      missing_partner_episodes: candidate.coverage.missing,
      ok: result.ok,
      status: result.status,
      result: result.body,
    });
  }

  const nextPage = batch.length < scanLimit ? 1 : page + 1;
  if (!dryRun) {
    await supabase.from('sync_cursors').upsert({ key: cursorKey, page: nextPage, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    await supabase.from('sync_logs').insert({
      function_name: 'sync-provider-backups',
      run_at: new Date().toISOString(),
      scanned: batch.length,
      added: results.reduce((total, result) => total + Number((result.result as Record<string, unknown> | null)?.episodes_inserted || 0), 0),
      skipped: batch.length - results.length,
      errors: results.filter((result) => !result.ok).length,
      details: results.filter((result) => !result.ok).map((result) => `${result.slug}:${result.status}`),
      elapsed_ms: 0,
      success: results.every((result) => result.ok),
      metadata: { page, next_page: nextPage, scan_limit: scanLimit, limit, candidates: results.length },
    });
  }

  return json({
    success: results.every((result) => result.ok),
    dry_run: dryRun,
    page,
    next_page: nextPage,
    scanned: batch.length,
    candidates: results.length,
    results,
  }, results.some((result) => !result.ok) ? 207 : 200);
});
