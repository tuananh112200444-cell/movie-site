import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260807123000_prioritize_fresh_movie_refreshes.sql', 'utf8');
const integrityCloseout = fs.readFileSync('supabase/migrations/20260810132000_close_publication_playback_and_security_gaps.sql', 'utf8');
const failures = [];

const requireText = (text, message) => {
  if (!migration.includes(text)) failures.push(message);
};

requireText("(q.requested_at >= now() - interval '6 hours') desc", 'fresh queue work is not prioritized');
requireText('create or replace function public.process_movie_refresh_backlog', 'historical backlog has no isolated processor');
requireText("and q.requested_at < now() - interval '6 hours'", 'backlog worker can consume fresh viewer-facing work');
requireText("least(coalesce(p_limit, 25), 25)", 'backlog batch is not capped at the safe limit');
requireText("'2-59/5 17-22 * * *'", 'off-peak schedule does not match the Vietnam low-traffic window');
requireText("$cmd$select public.process_movie_refresh_backlog(25);$cmd$", 'off-peak cron does not run the bounded backlog processor');

if (
  !integrityCloseout.includes('with oldest_due as materialized')
  || !integrityCloseout.includes("q.requested_at < now() - interval '6 hours'")
  || !integrityCloseout.includes('limit safe_limit')
) {
  failures.push('viewer-safe refresh queue does not reserve bounded capacity for the oldest due item');
}

console.log(JSON.stringify({
  status: failures.length ? 'failed' : 'passed',
  contracts: 7,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
