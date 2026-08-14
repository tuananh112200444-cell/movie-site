import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../supabase/', import.meta.url);
const functionRoot = fileURLToPath(new URL('functions/', root));
const migrationRoot = fileURLToPath(new URL('migrations/', root));
const findings = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const path of walk(functionRoot)) {
  if (!path.endsWith('.ts')) continue;
  const source = readFileSync(path, 'utf8');
  const relative = path.slice(functionRoot.length + 1).replaceAll('\\', '/');
  const checks = [
    [/khophim-admin-fallback/, 'hard-coded admin secret fallback'],
    [/token\.length\s*>\s*20/, 'token accepted by length instead of signature'],
    [/allowed\.length\s*===\s*0\s*\|\|/, 'missing secret permits access'],
    [/if\s*\(CRON_SECRET\s*&&\s*providedSecret/, 'missing cron secret permits access'],
    [/running without auth/i, 'missing secret permits access'],
  ];
  for (const [pattern, message] of checks) if (pattern.test(source)) findings.push(`${relative}: ${message}`);
}

for (const path of walk(migrationRoot)) {
  if (!path.endsWith('.sql')) continue;
  const source = readFileSync(path, 'utf8');
  if (/secret=YOUR_CRON_SECRET/.test(source)) findings.push(`${path}: cron secret placeholder in URL`);
}

const playbackCloseout = readFileSync(
  join(migrationRoot, '20260810132000_close_publication_playback_and_security_gaps.sql'),
  'utf8',
);
if (
  !playbackCloseout.includes('revoke all on function public.pick_unchecked_stream_health_candidates(uuid[], integer)')
  || !playbackCloseout.includes('to service_role;')
) {
  findings.push('raw stream health RPC remains executable outside service_role');
}

if (findings.length) {
  console.error(`Supabase security audit failed (${findings.length}):\n- ${findings.join('\n- ')}`);
  process.exit(1);
}
console.log('Supabase security audit passed: privileged endpoints fail closed and no runtime secret placeholders remain.');
