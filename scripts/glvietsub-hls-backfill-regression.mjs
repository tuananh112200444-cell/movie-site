import fs from 'node:fs';

const source = fs.readFileSync('supabase/migrations/20261014173000_backfill_glvietsub_server_one_hls.sql', 'utf8');
const checks = [
  [source.includes("'*/5 17-22 * * *'"), 'Backfill must run only overnight in Vietnam'],
  [source.includes("not between 17 and 22"), 'Manual dispatch must respect the off-peak window'],
  [source.includes("is distinct from 'normal'"), 'Backfill must stop during capacity protection'],
  [source.includes("least(coalesce(p_limit, 2), 2)"), 'Each run must be limited to two movies'],
  [source.includes("attempt.attempted_at < now() - interval '24 hours'") && source.includes('attempt.attempt_count < 3'), 'Failed or unavailable HLS may retry twice without looping forever'],
  [source.includes("episode.server_name like 'GLVietsub%HLS 1'"), 'Already-upgraded films must be skipped'],
  [source.includes("vault.decrypted_secrets") && !source.includes('CRON_SECRET='), 'Sync secret must remain in Vault'],
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
console.log(JSON.stringify({ checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
