import { serveSystemBrain } from '../_shared/system-brain-runner.ts';

serveSystemBrain('playback', new Set([
  'stream-health-check',
  'auto-repair-player-issues',
  'rpc:process_playback_learning_queue',
]));
