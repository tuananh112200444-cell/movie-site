import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type BrainName = 'catalog' | 'playback';

type BrainTask = {
  task_key: string;
  handler: string;
  params: Record<string, unknown> | null;
  attempts: number;
};

type TaskResult = {
  task_key: string;
  handler: string;
  ok: boolean;
  status: number;
  elapsed_ms: number;
  summary: Record<string, unknown>;
};

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

function clamp(raw: string | null, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}

function compactBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    success: body.success,
    error: body.error,
    scanned: body.scanned,
    candidates: body.candidates,
    updated: body.updated,
    added: body.added,
    repaired: body.repaired,
    episodes_inserted: body.episodes_inserted,
    provider_calls: body.provider_calls,
    processed: body.processed,
    skipped: body.skipped,
    errors: Array.isArray(body.errors) ? body.errors.slice(0, 3) : body.errors,
  };
}

async function executeTask(
  task: BrainTask,
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  cronSecret: string,
): Promise<TaskResult> {
  const started = Date.now();
  const params = { ...(task.params || {}) };
  const timeoutMs = clamp(String(params._timeout_ms || ''), 55_000, 5_000, 110_000);
  delete params._timeout_ms;

  if (task.handler.startsWith('rpc:')) {
    const rpcName = task.handler.slice(4);
    const { data, error } = await supabase.rpc(rpcName, params);
    return {
      task_key: task.task_key,
      handler: task.handler,
      ok: !error,
      status: error ? 500 : 200,
      elapsed_ms: Date.now() - started,
      summary: error ? { error: error.message } : { data },
    };
  }

  const endpoint = new URL(`${supabaseUrl}/functions/v1/${task.handler}`);
  const isPost = task.handler === 'enrich-tmdb-metadata';
  if (!isPost) {
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) continue;
      endpoint.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: isPost ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'x-cron-secret': cronSecret,
        'x-sync-secret': cronSecret,
      },
      body: isPost ? JSON.stringify(params) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return {
      task_key: task.task_key,
      handler: task.handler,
      ok: response.ok && body.success !== false && !body.error,
      status: response.status,
      elapsed_ms: Date.now() - started,
      summary: compactBody(body),
    };
  } catch (error) {
    return {
      task_key: task.task_key,
      handler: task.handler,
      ok: false,
      status: 0,
      elapsed_ms: Date.now() - started,
      summary: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

export function serveSystemBrain(brain: BrainName, allowedHandlers: ReadonlySet<string>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (!['GET', 'POST'].includes(req.method)) return json({ success: false, error: 'Method not allowed' }, 405);

    const requestUrl = new URL(req.url);
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    const suppliedSecret = requestUrl.searchParams.get('secret') || req.headers.get('x-cron-secret') || '';
    if (!cronSecret || suppliedSecret !== cronSecret) return json({ success: false, error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: 'Missing Supabase environment' }, 500);

    const started = Date.now();
    const limit = clamp(requestUrl.searchParams.get('limit'), 1, 1, 2);
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: capacity } = await supabase.from('runtime_capacity_state')
      .select('mode,last_reason,last_evaluated_at').eq('singleton', true).maybeSingle();
    if (capacity?.mode === 'protect') {
      return json({ success: true, brain, status: 'capacity_protect', processed: 0, capacity });
    }

    const { data, error: claimError } = await supabase.rpc('claim_system_brain_tasks', {
      p_brain: brain,
      p_limit: limit,
    });
    if (claimError) return json({ success: false, brain, error: `Task claim failed: ${claimError.message}` }, 500);

    const tasks = ((data || []) as BrainTask[]).filter((task) => allowedHandlers.has(task.handler));
    const rejected = ((data || []) as BrainTask[]).filter((task) => !allowedHandlers.has(task.handler));
    const results: TaskResult[] = [];

    for (const task of rejected) {
      const summary = { error: `Handler ${task.handler} is not allowed for ${brain} brain` };
      await supabase.rpc('complete_system_brain_task', {
        p_task_key: task.task_key,
        p_success: false,
        p_error: summary.error,
        p_metadata: summary,
      });
      results.push({ task_key: task.task_key, handler: task.handler, ok: false, status: 400, elapsed_ms: 0, summary });
    }

    for (const task of tasks) {
      const result = await executeTask(task, supabase, supabaseUrl, serviceKey, cronSecret);
      const completion = await supabase.rpc('complete_system_brain_task', {
        p_task_key: task.task_key,
        p_success: result.ok,
        p_error: result.ok ? '' : String(result.summary.error || `HTTP ${result.status}`),
        p_metadata: {
          status: result.status,
          elapsed_ms: result.elapsed_ms,
          summary: result.summary,
        },
      });
      if (completion.error) {
        result.ok = false;
        result.summary.completion_error = completion.error.message;
      }
      results.push(result);
    }

    const success = results.every((result) => result.ok);
    await supabase.from('sync_logs').insert({
      function_name: `${brain}-brain`,
      run_at: new Date().toISOString(),
      success,
      scanned: (data || []).length,
      added: results.filter((result) => result.ok).length,
      skipped: Math.max(0, limit - (data || []).length),
      errors: results.filter((result) => !result.ok).length,
      elapsed_ms: Date.now() - started,
      details: results.filter((result) => !result.ok).map((result) => `${result.task_key}:${String(result.summary.error || result.status)}`).slice(0, 20),
      metadata: { contract: 'system_brain_queue_v1', brain, tasks: results },
    });

    return json({
      success,
      brain,
      contract: 'system_brain_queue_v1',
      claimed: (data || []).length,
      processed: results.length,
      results,
      elapsed_ms: Date.now() - started,
    }, success ? 200 : 207);
  });
}
