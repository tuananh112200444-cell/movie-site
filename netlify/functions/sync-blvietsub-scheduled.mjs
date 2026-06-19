import { makeSupabaseClient, runBlvietsubSync } from '../../scripts/blvietsub-sync-core.mjs';

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const supabase = makeSupabaseClient({ supabaseUrl, serviceRoleKey });
  const result = await runBlvietsubSync({
    supabase,
    supabaseUrl,
    feedUrl: process.env.BLVIETSUB_FEED_URL,
    limit: Math.max(1, Math.min(Number(process.env.BLVIETSUB_SYNC_LIMIT || 8) || 8, 30)),
    concurrency: Math.max(1, Math.min(Number(process.env.BLVIETSUB_SYNC_CONCURRENCY || 2) || 2, 4)),
    useCursor: true,
    cursorKey: 'blvietsub_sitemap_external',
    refreshSearch: true,
  });
  console.log(JSON.stringify(result));
};

export const config = {
  schedule: '*/15 * * * *',
};
