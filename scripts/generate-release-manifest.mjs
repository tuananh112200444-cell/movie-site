import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

function git(args, fallback = 'unknown') {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim() || fallback; } catch { return fallback; }
}

const generatedAt = new Date().toISOString();
const commit = git(['rev-parse', '--short=12', 'HEAD']);
const dirty = git(['status', '--porcelain'], '') !== '';
const releaseId = process.env.RELEASE_ID || `${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${commit}${dirty ? '-dirty' : ''}`;
const manifest = {
  release_id: releaseId,
  generated_at: generatedAt,
  commit,
  dirty,
  schema_contract: '20260719-ops-seo-v1',
  components: { frontend: 'cloudflare-pages', worker: 'cloudflare-pages-functions', backend: 'supabase-edge-functions', database: 'supabase-postgres' },
};
await writeFile(new URL('../public/release.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Generated public/release.json (${releaseId}).`);
