import fs from 'node:fs';

const connectorFiles = [
  'supabase/functions/sync-glvietsub-feed/index.ts',
  'supabase/functions/sync-onlyflix-feed/index.ts',
  'supabase/functions/sync-motchill-feed/index.ts',
  'supabase/functions/sync-ophim-movies/index.ts',
];

const failures = [];

for (const file of connectorFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const destructiveEpisodeDelete =
    /from\(['"]movie_episodes['"]\)\s*\.delete\(\)/s.test(source)
    || /from\(['"]episodes['"]\)\s*\.delete\(\)/s.test(source);
  const unpublishMovie =
    /from\(['"]movies['"]\)[\s\S]{0,240}(?:update|upsert)\(\{[\s\S]{0,160}is_published\s*:\s*false/s.test(source);
  const automaticStreamDeactivation =
    /from\(['"]streams['"]\)[\s\S]{0,180}update\(\{\s*is_active\s*:\s*false/s.test(source);
  const destructiveDetailCacheDelete =
    /from\(['"]movie_api_cache['"]\)\s*\.delete\(\)/s.test(source);

  if (destructiveEpisodeDelete) failures.push(`${file}: source sync can delete last-known-good episodes`);
  if (unpublishMovie) failures.push(`${file}: source sync can unpublish an existing movie`);
  if (automaticStreamDeactivation) failures.push(`${file}: source sync can deactivate streams from one incomplete feed response`);
  if (destructiveDetailCacheDelete) failures.push(`${file}: source sync deletes last-known-good movie detail cache`);
}

const motchill = fs.readFileSync('supabase/functions/sync-motchill-feed/index.ts', 'utf8');
const onlyflix = fs.readFileSync('supabase/functions/sync-onlyflix-feed/index.ts', 'utf8');
if (!motchill.includes('Additive-only publication contract')) {
  failures.push('Motchill is missing its additive-only publication contract');
}
if (!onlyflix.includes('feed response is only positive evidence')) {
  failures.push('OnlyFlix is missing its positive-evidence-only contract');
}

console.log(JSON.stringify({
  status: failures.length ? 'failed' : 'passed',
  connectors_checked: connectorFiles.length,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
