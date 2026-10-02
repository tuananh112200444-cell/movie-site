import fs from 'node:fs';

const guard = fs.readFileSync('scripts/deploy-production-safe.mjs', 'utf8');
const rules = fs.readFileSync('AGENTS.md', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const failures = [];

for (const contract of [
  "git(['status', '--porcelain'])",
  "git(['fetch', 'origin', 'main'])",
  "head !== originMain",
  "merge-base', '--is-ancestor'",
  "KHOPHIM_PRODUCTION_DEPLOY !== 'YES'",
  "--branch', PRODUCTION_BRANCH",
  "--commit-hash', head",
  "out/release.json",
  "khophim.org still reports",
]) {
  if (!guard.includes(contract)) failures.push(`Missing production guard contract: ${contract}`);
}
if (!rules.includes('Never deploy Cloudflare Pages production with a raw')) failures.push('AGENTS.md must prohibit raw production deploys.');
if (pkg.scripts?.['deploy:production'] !== 'node scripts/deploy-production-safe.mjs --deploy') failures.push('deploy:production must use the guarded release script.');
if (pkg.scripts?.['deploy:check'] !== 'node scripts/deploy-production-safe.mjs --check') failures.push('deploy:check must use the guarded release script.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('production deployment guard regression passed');

