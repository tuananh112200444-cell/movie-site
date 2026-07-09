#!/usr/bin/env node
import { makeSupabaseClient, runCobephimSync } from './cobephim-sync-core.mjs';

function getArg(name, fallback = '') {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const dryRun = process.argv.includes('--dry-run');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const movieUrl = getArg('movie-url', '');
const sitemapUrl = getArg('sitemap-url', '');
const sitemapPage = Math.max(1, Number(getArg('sitemap-page', '1')) || 1);
const limit = Math.max(1, Math.min(Number(getArg('limit', '10')) || 10, 50));
const offset = Math.max(0, Number(getArg('offset', '0')) || 0);

const supabase = dryRun ? null : makeSupabaseClient({ supabaseUrl, serviceRoleKey });
const result = await runCobephimSync({
  supabase,
  movieUrl,
  sitemapUrl,
  sitemapPage,
  limit,
  offset,
  dryRun,
});

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.success ? 0 : 1;
