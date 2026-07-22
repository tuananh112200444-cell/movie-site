#!/usr/bin/env node
import { makeSupabaseClient, runMotchillSync } from './motchill-sync-core.mjs';

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
const query = getArg('query', '');
const limit = Math.max(1, Math.min(Number(getArg('limit', '10')) || 10, 50));

if (!movieUrl && !query) {
  throw new Error('Use --movie-url=https://www.motchillkz.org/phim-bo/... or --query="movie title"');
}

const supabase = dryRun ? null : makeSupabaseClient({ supabaseUrl, serviceRoleKey });
const result = await runMotchillSync({
  supabase,
  movieUrl,
  query,
  limit,
  dryRun,
});

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.success ? 0 : 1;
