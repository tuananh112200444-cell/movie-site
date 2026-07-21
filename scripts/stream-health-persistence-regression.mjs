import fs from 'node:fs';

const connectors = [
  'supabase/functions/sync-glvietsub-feed/index.ts',
  'supabase/functions/sync-onlyflix-feed/index.ts',
  'supabase/functions/sync-cobephim-feed/index.ts',
  'scripts/cobephim-sync-core.mjs',
  'scripts/motchill-sync-core.mjs',
];

const failures = [];
for (const file of connectors) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('const urlChanged')) failures.push(`${file}: missing URL-change health gate`);
  if (!source.includes("!['health_status', 'failure_count', 'last_error'].includes(key)")) {
    failures.push(`${file}: unchanged URLs can reset accumulated health`);
  }
  if (!/select\(['"]id,stream_url,embed_url['"]\)/.test(source)) {
    failures.push(`${file}: existing stream URLs are not loaded before upsert`);
  }
}

console.log(JSON.stringify({ connectors: connectors.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
