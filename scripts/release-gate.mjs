import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Production-wide source:brain audits are deliberately operational checks, not
// release blockers: large live queries can be throttled by Supabase and make an
// otherwise valid artifact nondeterministically fail. Deterministic source
// contracts remain covered by system:contracts, watch:test and diagnostics:test.
const steps = [
  ['security:secrets'], ['security:supabase'], ['schema:test'], ['seo:audit'], ['seo:upcoming:test'], ['seo:ongoing:test'], ['seo:indexing:test'], ['seo:gsc:test'], ['seo:brain:test'], ['seo:hot:test'], ['seo:people-first:test'], ['seo:category:test'], ['system:contracts'], ['sync:safety:test'], ['type-check'], ['build'],
  ['home:test'], ['list:test'], ['search:test'], ['movie:data:test'], ['watch:test'], ['diagnostics:test'],
];
const report = { started_at: new Date().toISOString(), status: 'running', steps: [] };

async function writeReport() {
  const contents = `${JSON.stringify(report, null, 2)}\n`;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await writeFile('release-gate-report.json', contents, 'utf8');
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'UNKNOWN'].includes(error?.code) || attempt === 6) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 100));
    }
  }
}

function run(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(npm, ['run', name], { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
    child.on('exit', (code, signal) => resolve({ name, ok: code === 0, exit_code: code, signal, elapsed_ms: Date.now() - started }));
    child.on('error', (error) => resolve({ name, ok: false, exit_code: null, error: error.message, elapsed_ms: Date.now() - started }));
  });
}

for (const [name] of steps) {
  console.log(`\n[release-gate] ${name}`);
  const result = await run(name);
  report.steps.push(result);
  if (!result.ok) {
    report.status = 'failed'; report.failed_step = name; report.finished_at = new Date().toISOString();
    await writeReport();
    console.error(`[release-gate] STOP: ${name} failed. Deployment is not allowed.`);
    process.exit(1);
  }
}
report.status = 'passed'; report.finished_at = new Date().toISOString();
await writeReport();
console.log('\n[release-gate] PASSED. The artifact is eligible for deployment.');
