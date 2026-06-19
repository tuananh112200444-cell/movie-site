#!/usr/bin/env node
import { makeSupabaseClient, runBlvietsubSync } from './blvietsub-sync-core.mjs';

function getArg(name, fallback = '') {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const dryRun = process.argv.includes('--dry-run');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const limit = Math.max(1, Math.min(Number(getArg('limit', '10')) || 10, 200));
const offset = Math.max(0, Number(getArg('offset', '0')) || 0);
const concurrency = Math.max(1, Math.min(Number(getArg('concurrency', '3')) || 3, 6));
const movieUrl = getArg('movie-url', '');
const refreshSearch = process.argv.includes('--refresh-search');

const supabase = dryRun ? null : makeSupabaseClient({ supabaseUrl, serviceRoleKey });
const result = await runBlvietsubSync({
  supabase,
  supabaseUrl,
  feedUrl: process.env.BLVIETSUB_FEED_URL,
  limit,
  offset,
  concurrency,
  movieUrl,
  dryRun,
  refreshSearch,
});

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.success ? 0 : 1;
