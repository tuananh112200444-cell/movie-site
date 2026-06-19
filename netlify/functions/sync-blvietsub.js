import { makeSupabaseClient, runBlvietsubSync } from '../../scripts/blvietsub-sync-core.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const params = event.queryStringParameters || {};
  const secret = params.secret || event.headers['x-cron-secret'] || event.headers['X-Cron-Secret'] || '';
  const expectedSecret = process.env.BLVIETSUB_SYNC_SECRET || process.env.CRON_SECRET || '';
  if (expectedSecret && secret !== expectedSecret) {
    return json(401, { success: false, error: 'Unauthorized' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    const dryRun = params.dry_run === '1' || params.dry_run === 'true';
    const supabase = dryRun ? null : makeSupabaseClient({ supabaseUrl, serviceRoleKey });
    const result = await runBlvietsubSync({
      supabase,
      supabaseUrl,
      feedUrl: process.env.BLVIETSUB_FEED_URL,
      limit: Math.max(1, Math.min(Number(params.limit || 10) || 10, 200)),
      offset: Math.max(0, Number(params.offset || 0) || 0),
      concurrency: Math.max(1, Math.min(Number(params.concurrency || 3) || 3, 6)),
      useCursor: params.cursor === '1' || params.cursor === 'true',
      cursorKey: params.cursor_key || 'blvietsub_sitemap_external',
      movieUrl: params.movie_url || '',
      dryRun,
      refreshSearch: params.refresh_search === '1' || params.refresh_search === 'true',
    });
    return json(result.success ? 200 : 207, result);
  } catch (error) {
    return json(500, { success: false, error: error.message || String(error) });
  }
}
