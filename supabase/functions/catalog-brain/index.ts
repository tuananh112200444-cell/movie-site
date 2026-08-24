import { serveSystemBrain } from '../_shared/system-brain-runner.ts';

serveSystemBrain('catalog', new Set([
  'sync-ophim-movies',
  'sync-blvietsub-feed',
  'sync-glvietsub-feed',
  'sync-motchill-feed',
  'sync-onlyflix-feed',
  'sync-cobephim-feed',
  'unified-provider-brain',
  'enrich-tmdb-metadata',
  'rpc:dispatch_glvietsub_raw_upgrades',
  'rpc:reconcile_hidden_usable_movies',
]));
