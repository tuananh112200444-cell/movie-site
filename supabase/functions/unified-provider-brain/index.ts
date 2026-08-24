import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Provider = 'kkphim' | 'vsmov' | 'nguonc';

type MovieRow = {
  id: string;
  slug: string;
  name: string | null;
  origin_name: string | null;
  source_site: string | null;
  source_name: string | null;
  current_episode: number | null;
  total_episodes: number | null;
  is_published: boolean | null;
  seo_catalog_status: string | null;
};

type RepairWork = {
  issue_key: string | null;
  issue_type: string;
  movie_id: string;
  slug: string;
  source_site: string | null;
  source_name: string | null;
  current_episode: number | null;
  total_episodes: number | null;
  attempts: number;
  evidence: Record<string, unknown>;
};

// All provider adapters have the same base weight. Health and coverage are
// measured after ingestion; provider identity never changes selection score.
const PROVIDERS: Provider[] = ['kkphim', 'nguonc', 'vsmov'];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://khophim.org',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function clamp(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function uniqueProviders(values: Provider[]): Provider[] {
  return values.filter((provider, index) => values.indexOf(provider) === index);
}

function stableProviderOffset(work: RepairWork): number {
  const identity = `${work.movie_id}:${work.slug}`;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % PROVIDERS.length;
}

function providerOrder(work: RepairWork): Provider[] {
  const offset = stableProviderOffset(work);
  return uniqueProviders([
    ...PROVIDERS.slice(offset),
    ...PROVIDERS.slice(0, offset),
  ]);
}

async function callConnector(
  supabaseUrl: string,
  serviceKey: string,
  secret: string,
  provider: Provider,
  work: RepairWork,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown>; elapsed_ms: number }> {
  const started = Date.now();
  const endpoint = provider === 'kkphim'
    ? new URL(`${supabaseUrl}/functions/v1/sync-ophim-movies`)
    : new URL(`${supabaseUrl}/functions/v1/sync-gap-playback-providers`);

  if (provider === 'kkphim') {
    endpoint.searchParams.set('provider', provider);
    endpoint.searchParams.set('movie_id', work.movie_id);
    endpoint.searchParams.set('slug', work.slug);
    endpoint.searchParams.set('episodes', '1');
    endpoint.searchParams.set('limit', '1');
    endpoint.searchParams.set('strict_missing_detail', '1');
  } else {
    endpoint.searchParams.set('providers', provider);
    endpoint.searchParams.set('slug', work.slug);
    endpoint.searchParams.set('limit', '1');
    endpoint.searchParams.set('scan_limit', '1');
    endpoint.searchParams.set('cooldown_hours', '0');
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'x-cron-secret': secret,
      },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: response.ok && body.success !== false, status: response.status, body, elapsed_ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
      elapsed_ms: Date.now() - started,
    };
  }
}

async function playbackState(
  supabase: ReturnType<typeof createClient>,
  movieId: string,
): Promise<{
  usable: boolean;
  max_episode: number;
  episode_numbers: number[];
  published: boolean;
  current_episode: number;
  provider_coverage: Record<string, string>;
}> {
  const [{ data: usable }, { data: maxEpisode }, { data: episodeRows }, { data: movie }, { data: coverageRows }] = await Promise.all([
    supabase.rpc('movie_has_usable_persisted_playback', { p_movie_id: movieId }),
    supabase.rpc('get_movie_playable_max_episode', { p_movie_id: movieId }),
    supabase.rpc('get_movie_playable_episode_numbers', { p_movie_id: movieId }),
    supabase.from('movies').select('is_published,current_episode').eq('id', movieId).maybeSingle(),
    supabase.from('movie_provider_coverage').select('provider,state').eq('movie_id', movieId),
  ]);
  const episodeNumbers = (Array.isArray(episodeRows) ? episodeRows : [])
    .map((row) => Number((row as Record<string, unknown>).episode_number ?? Object.values(row as Record<string, unknown>)[0] ?? 0))
    .filter((value) => Number.isInteger(value) && value > 0);
  return {
    usable: usable === true,
    max_episode: Number(maxEpisode || 0) || 0,
    episode_numbers: [...new Set(episodeNumbers)].sort((a, b) => a - b),
    published: movie?.is_published === true,
    current_episode: Number(movie?.current_episode || 0) || 0,
    provider_coverage: Object.fromEntries((coverageRows || []).map((row) => [String(row.provider), String(row.state)])),
  };
}

function issueSatisfied(work: RepairWork, state: {
  usable: boolean;
  max_episode: number;
  episode_numbers: number[];
  provider_coverage: Record<string, string>;
}): boolean {
  if (!state.usable) return false;
  const requestedEpisode = Number(work.evidence?.requested_episode || 0) || 0;
  if (requestedEpisode > 0 && !state.episode_numbers.includes(requestedEpisode)) return false;

  const advertised = Number(work.evidence?.advertised || work.evidence?.expected_episode || work.current_episode || 0) || 0;
  if (['episode_count_mismatch', 'episode_sequence_gap', 'targeted_repair'].includes(work.issue_type)) {
    if (advertised > 0 && state.max_episode < advertised) return false;
    const expectedNumbers = Array.isArray(work.evidence?.missing_episode_numbers)
      ? work.evidence.missing_episode_numbers.map(Number).filter((value) => Number.isInteger(value) && value > 0)
      : [];
    if (expectedNumbers.some((episode) => !state.episode_numbers.includes(episode))) return false;
  }

  const missingProviders = Array.isArray(work.evidence?.missing_providers)
    ? work.evidence.missing_providers.map(String).filter((provider) => provider !== 'ophim')
    : [];
  if (missingProviders.some((provider) => !['ready', 'pending', 'degraded'].includes(state.provider_coverage[provider] || 'missing'))) {
    return false;
  }
  return true;
}

function compactConnectorResult(provider: Provider, result: Awaited<ReturnType<typeof callConnector>>) {
  return {
    provider,
    ok: result.ok,
    status: result.status,
    elapsed_ms: result.elapsed_ms,
    summary: {
      success: result.body.success,
      scanned: result.body.scanned,
      updated: result.body.updated,
      episodes_inserted: result.body.episodes_inserted,
      targeted_slug: result.body.targeted_slug,
      error: result.body.error,
      errors: Array.isArray(result.body.errors) ? result.body.errors.slice(0, 3) : undefined,
    },
    checked_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (!['GET', 'POST'].includes(req.method)) return json({ success: false, error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const suppliedSecret = req.headers.get('x-cron-secret') || url.searchParams.get('secret') || '';
  if (!cronSecret || suppliedSecret !== cronSecret) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase environment' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const targetSlug = String(url.searchParams.get('slug') || '').trim();
  const requestedEpisode = clamp(url.searchParams.get('episode'), 0, 0, 5000);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const limit = clamp(url.searchParams.get('limit'), targetSlug ? 1 : 2, 1, 4);
  const providerBudget = clamp(url.searchParams.get('provider_budget'), targetSlug ? 4 : 2, 1, 4);
  const started = Date.now();

  // A batch dry-run must never claim and mutate queue rows. Targeted dry-runs
  // remain read-only and expose the exact provider order for one movie.
  if (dryRun && !targetSlug) {
    return json({ success: false, error: 'dry_run requires a slug' }, 400);
  }

  const { data: capacity } = await supabase.from('runtime_capacity_state')
    .select('mode,last_reason').eq('singleton', true).maybeSingle();
  if (!targetSlug && capacity?.mode === 'protect') {
    return json({ success: true, status: 'capacity_protect', processed: 0, capacity });
  }

  let workItems: RepairWork[] = [];
  if (targetSlug) {
    const { data: movie } = await supabase.from('movies')
      .select('id,slug,name,origin_name,source_site,source_name,current_episode,total_episodes,is_published,seo_catalog_status')
      .eq('slug', targetSlug).maybeSingle();
    if (!movie) return json({ success: false, error: 'Movie not found' }, 404);
    const { data: issue } = await supabase.from('catalog_integrity_issues')
      .select('issue_key,issue_type,attempts,evidence')
      .eq('movie_id', movie.id)
      .in('status', ['open', 'repairing'])
      .order('severity', { ascending: false }).limit(1).maybeSingle();
    workItems = [{
      issue_key: issue?.issue_key || null,
      issue_type: issue?.issue_type || 'targeted_repair',
      movie_id: movie.id,
      slug: movie.slug,
      source_site: movie.source_site,
      source_name: movie.source_name,
      current_episode: movie.current_episode,
      total_episodes: movie.total_episodes,
      attempts: Number(issue?.attempts || 0),
      evidence: {
        ...((issue?.evidence || {}) as Record<string, unknown>),
        ...(requestedEpisode > 0 ? { requested_episode: requestedEpisode } : {}),
      },
    }];
  } else {
    const { data, error } = await supabase.rpc('claim_unified_provider_repairs', { p_limit: limit });
    if (error) return json({ success: false, error: `Queue claim failed: ${error.message}` }, 500);
    workItems = (data || []) as RepairWork[];
  }

  const results: Array<Record<string, unknown>> = [];
  let remainingBudget = providerBudget;

  for (const work of workItems) {
    const before = await playbackState(supabase, work.movie_id);
    const order = providerOrder(work);
    const initialCursor = Number(work.evidence?.unified_provider_cursor || 0) % order.length;
    const currentOrder = [
      ...order.slice(initialCursor),
      ...order.slice(0, initialCursor),
    ];
    if (dryRun) {
      results.push({
        slug: work.slug,
        outcome: 'dry_run',
        provider_order: currentOrder,
        provider_policy: 'equal_parallel_health_score',
        cursor: initialCursor,
        state: before,
      });
      continue;
    }
    if (issueSatisfied(work, before)) {
      await supabase.rpc('reconcile_movie_release_state', { p_movie_id: work.movie_id });
      if (work.issue_key) await supabase.from('catalog_integrity_issues').update({
        status: 'resolved', resolved_at: new Date().toISOString(), last_error: null,
      }).eq('issue_key', work.issue_key);
      results.push({ slug: work.slug, outcome: 'already_satisfied', state: before });
      continue;
    }

    const calls: Array<Record<string, unknown>> = [];
    let resolved = false;
    const perMovieBudget = Math.min(order.length, remainingBudget);
    const selectedProviders = currentOrder.slice(0, perMovieBudget);
    const connectorResults = await Promise.all(selectedProviders.map(async (provider) => ({
      provider,
      result: await callConnector(supabaseUrl, serviceKey, cronSecret, provider, work),
    })));
    calls.push(...connectorResults.map(({ provider, result }) => compactConnectorResult(provider, result)));
    remainingBudget -= selectedProviders.length;
    const cursor = (initialCursor + selectedProviders.length) % order.length;
    const after = await playbackState(supabase, work.movie_id);
    if (issueSatisfied(work, after)) {
      await supabase.rpc('reconcile_movie_release_state', { p_movie_id: work.movie_id });
      if (work.issue_key) await supabase.from('catalog_integrity_issues').update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        last_error: null,
        evidence: {
          ...work.evidence,
          unified_provider_cursor: cursor,
          unified_last_result: calls,
          unified_resolved_at: new Date().toISOString(),
          provider_policy: 'equal_parallel_health_score',
        },
      }).eq('issue_key', work.issue_key);
      await Promise.allSettled([
        supabase.from('movie_api_cache').delete().eq('slug', work.slug),
        supabase.from('home_page_cache').update({ expires_at: new Date().toISOString() }).in('id', ['homepage_v3', 'search_index_v4_rows']),
      ]);
      results.push({ slug: work.slug, outcome: 'resolved', providers: selectedProviders, calls, state: after });
      resolved = true;
    }

    if (!resolved) {
      const lastCall = calls.at(-1) as Record<string, unknown> | undefined;
      const completedProviderCycle = work.attempts > 0 && work.attempts % order.length === 0;
      const retryDelayMs = (completedProviderCycle ? 6 * 60 : 20) * 60_000;
      if (work.issue_key) await supabase.from('catalog_integrity_issues').update({
        status: 'open',
        resolved_at: null,
        last_error: `Unified provider repair pending after ${calls.length} connector call(s)`,
        evidence: {
          ...work.evidence,
          unified_provider_cursor: cursor,
          unified_last_result: calls.length > 0 ? calls : lastCall,
          unified_next_attempt_at: new Date(Date.now() + retryDelayMs).toISOString(),
          unified_contract: 'equal_provider_brain_v2',
          provider_policy: 'equal_parallel_health_score',
        },
      }).eq('issue_key', work.issue_key);
      results.push({ slug: work.slug, outcome: 'pending', next_provider: order[cursor], calls });
    }
  }

  await supabase.from('sync_logs').insert({
    function_name: 'unified-provider-brain',
    run_at: new Date().toISOString(),
    success: true,
    scanned: workItems.length,
    added: results.filter((item) => item.outcome === 'resolved').length,
    skipped: results.filter((item) => item.outcome === 'already_satisfied').length,
    errors: results.filter((item) => item.outcome === 'pending').length,
    elapsed_ms: Date.now() - started,
    details: [],
    metadata: { contract: 'equal_provider_brain_v2', provider_policy: 'equal_parallel_health_score', target_slug: targetSlug || null, provider_budget: providerBudget, results },
  });

  return json({
    success: true,
    contract: 'equal_provider_brain_v2',
    provider_policy: 'equal_parallel_health_score',
    target_slug: targetSlug || null,
    processed: workItems.length,
    provider_calls: providerBudget - remainingBudget,
    results,
    elapsed_ms: Date.now() - started,
  });
});
