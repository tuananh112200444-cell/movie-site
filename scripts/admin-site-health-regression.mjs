import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/admin-site-health/index.ts', 'utf8');
const failures = [];

const apiChecks = source.match(/group: 'api' as const/g) ?? [];
const authenticatedApiChecks = source.match(/headers: \{ \.\.\.SUPABASE_PUBLIC_HEADERS/g) ?? [];

if (!source.includes("Deno.env.get('SUPABASE_ANON_KEY')")) {
  failures.push('Site Health does not read the legacy Supabase public API key.');
}
if (!source.includes("Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')")) {
  failures.push('Site Health does not support hosted Supabase publishable keys.');
}
if (apiChecks.length === 0 || authenticatedApiChecks.length !== apiChecks.length) {
  failures.push(`Only ${authenticatedApiChecks.length}/${apiChecks.length} Site Health API checks send the required apikey header.`);
}
if (!source.includes('search-index-proxy?q=ben%20bo&limit=8')) {
  failures.push('Site Health search probe still loads the full index instead of a bounded real query.');
}
if (!source.includes("check.group !== 'api'") || !source.includes('first_elapsed_ms: first.elapsed_ms')) {
  failures.push('Site Health does not retry a one-off slow API cold start.');
}

console.log(JSON.stringify({
  status: failures.length ? 'failed' : 'passed',
  api_checks: apiChecks.length,
  authenticated_api_checks: authenticatedApiChecks.length,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
