import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PROJECT = 'movie-site';
const PRODUCTION_BRANCH = 'release-production-locked';
const LIVE_RELEASE_URL = 'https://khophim.org/release.json';
const deployRequested = process.argv.includes('--deploy');

function fail(message) {
  console.error(`[deploy-safe] BLOCKED: ${message}`);
  process.exit(1);
}

function git(args, options = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
  } catch (error) {
    fail(`git ${args.join(' ')} failed: ${String(error?.stderr || error?.message || error).trim()}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

async function readJson(url, attempts = 1) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}verify=${Date.now()}`, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
}

const initialStatus = git(['status', '--porcelain']);
if (initialStatus) fail('working tree is not clean. Commit or preserve every change before production build.');

git(['fetch', 'origin', 'main']);
const head = git(['rev-parse', 'HEAD']);
const originMain = git(['rev-parse', 'origin/main']);
if (head !== originMain) fail(`HEAD ${head.slice(0, 12)} does not equal origin/main ${originMain.slice(0, 12)}.`);

let liveBefore = null;
try {
  liveBefore = await readJson(LIVE_RELEASE_URL, 2);
  const liveCommit = String(liveBefore?.commit || '').trim();
  if (liveCommit && /^[0-9a-f]{7,40}$/i.test(liveCommit)) {
    const isAncestor = spawnSync('git', ['merge-base', '--is-ancestor', liveCommit, head], {
      cwd: process.cwd(), shell: process.platform === 'win32', stdio: 'ignore',
    }).status === 0;
    if (!isAncestor) fail(`candidate ${head.slice(0, 12)} would roll back or diverge from live commit ${liveCommit}.`);
  }
} catch (error) {
  fail(`cannot verify the current live release: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`[deploy-safe] source verified: ${head}`);
if (!deployRequested) {
  console.log('[deploy-safe] CHECK PASSED. No deployment was created.');
  process.exit(0);
}

if (process.env.KHOPHIM_PRODUCTION_DEPLOY !== 'YES') {
  fail('set KHOPHIM_PRODUCTION_DEPLOY=YES for the intentional production release.');
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
if (!process.env.CLOUDFLARE_API_TOKEN) {
  const auth = spawnSync(npx, ['wrangler', 'whoami'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  if (auth.status !== 0) fail('Cloudflare authentication is unavailable. Sign in with Wrangler or provide CLOUDFLARE_API_TOKEN.');
}
run(npm, ['run', 'build']);

const manifestPath = 'out/release.json';
if (!existsSync(manifestPath)) fail('out/release.json is missing after build.');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (String(manifest.commit || '') !== head.slice(0, 12)) {
  fail(`artifact commit ${manifest.commit || 'missing'} does not match HEAD ${head.slice(0, 12)}.`);
}
if (!existsSync('out/_worker.js')) fail('compiled Pages worker is missing from the artifact.');

const message = git(['show', '-s', '--format=%s', 'HEAD']).slice(0, 120);
const deployOutput = run(npx, [
  'wrangler', 'pages', 'deploy', 'out',
  '--project-name', PROJECT,
  '--branch', PRODUCTION_BRANCH,
  '--commit-hash', head,
  '--commit-message', message,
  '--commit-dirty=false',
]);
const deploymentUrl = deployOutput.match(/https:\/\/[a-z0-9]+\.[a-z0-9-]+\.pages\.dev/i)?.[0];
if (!deploymentUrl) fail('Wrangler did not return a deployment URL.');

const deployed = await readJson(`${deploymentUrl}/release.json`, 5);
if (String(deployed?.commit || '') !== head.slice(0, 12)) {
  fail(`deployment URL reports ${deployed?.commit || 'no commit'}, expected ${head.slice(0, 12)}.`);
}
const liveAfter = await readJson(LIVE_RELEASE_URL, 8);
if (String(liveAfter?.commit || '') !== head.slice(0, 12)) {
  fail(`khophim.org still reports ${liveAfter?.commit || 'no commit'}, expected ${head.slice(0, 12)}.`);
}
console.log(`[deploy-safe] PRODUCTION VERIFIED: ${head} at ${deploymentUrl}`);

