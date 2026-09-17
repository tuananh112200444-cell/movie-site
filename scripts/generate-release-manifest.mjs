import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

async function writeFileWithRetry(filePath, contents, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await writeFile(filePath, contents, 'utf8');
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'UNKNOWN'].includes(error?.code) || attempt === attempts) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 100));
    }
  }
}

function git(args, fallback = 'unknown') {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim() || fallback; } catch { return fallback; }
}

const generatedAt = new Date().toISOString();
const commit = git(['rev-parse', '--short=12', 'HEAD']);
const dirty = git(['status', '--porcelain'], '') !== '';
const releaseId = process.env.RELEASE_ID || `${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${commit}${dirty ? '-dirty' : ''}`;
const appFiles = git([
  'ls-files',
  'src',
  'index.html',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  'public/service-worker.js',
], '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean).sort();
const appHash = createHash('sha256');
for (const file of appFiles) {
  appHash.update(file);
  appHash.update('\0');
  appHash.update(await readFile(file));
  appHash.update('\0');
}
const appReleaseId = process.env.APP_RELEASE_ID || `app-${appHash.digest('hex').slice(0, 16)}`;
const manifest = {
  release_id: releaseId,
  app_release_id: appReleaseId,
  content_release_id: releaseId,
  generated_at: generatedAt,
  commit,
  dirty,
  schema_contract: '20260719-ops-seo-v1',
  components: { frontend: 'cloudflare-pages', worker: 'cloudflare-pages-functions', backend: 'supabase-edge-functions', database: 'supabase-postgres' },
};
await writeFileWithRetry(new URL('../public/release.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated public/release.json (app ${appReleaseId}; content ${releaseId}).`);
