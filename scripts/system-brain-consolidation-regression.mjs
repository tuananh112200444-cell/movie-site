/* global console, process */
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260822070340_consolidate_system_brains.sql', 'utf8');
const runner = fs.readFileSync('supabase/functions/_shared/system-brain-runner.ts', 'utf8');
const catalog = fs.readFileSync('supabase/functions/catalog-brain/index.ts', 'utf8');
const playback = fs.readFileSync('supabase/functions/playback-brain/index.ts', 'utf8');

const checks = [
  [migration.includes('create table if not exists public.system_brain_tasks'), 'Durable brain task queue is missing'],
  [migration.includes('for update of task skip locked'), 'Task claims can block or duplicate work'],
  [migration.includes('system_brain_tasks_due_idx') && migration.includes('where enabled is true'), 'Due-task queue lacks a partial index'],
  [migration.includes('revoke all on table public.system_brain_tasks from public, anon, authenticated'), 'Brain queue is exposed publicly'],
  [migration.includes('complete_system_brain_task') && migration.includes('consecutive_failures'), 'Task completion/backoff is not durable'],
  [migration.includes("'catalog-brain-every-2-minutes'") && migration.includes("'playback-brain-every-3-minutes'"), 'Consolidated brain schedules are missing'],
  [migration.includes("'backfill-stream-playback-brain-offpeak'") && migration.includes("'catalog-backfill-priority-supervisor-every-5-minutes'"), 'Completed/stalled backfills remain scheduled'],
  [migration.includes("'sync-provider-backups-every-30-minutes'") && migration.includes("'unified-provider-brain-every-30-minutes'"), 'Overlapping repair schedulers remain active'],
  [migration.includes('drop trigger if exists enqueue_movie_refresh_after_movie_episode_change'), 'Duplicate movie_episodes row trigger remains'],
  [runner.includes("capacity?.mode === 'protect'"), 'Brains ignore runtime capacity protection'],
  [runner.includes("rpc('claim_system_brain_tasks'") && runner.includes("rpc('complete_system_brain_task'"), 'Runner bypasses the durable lease contract'],
  [catalog.includes("'sync-ophim-movies'") && catalog.includes("'sync-blvietsub-feed'") && catalog.includes("'sync-glvietsub-feed'") && catalog.includes("'sync-motchill-feed'"), 'Catalog connectors are not owned by Catalog Brain'],
  [playback.includes("'stream-health-check'") && playback.includes("'auto-repair-player-issues'"), 'Playback repair is not owned by Playback Brain'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log(`system brain consolidation regression passed (${checks.length} contracts)`);
