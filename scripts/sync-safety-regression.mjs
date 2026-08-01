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
  const verifiedLocalizedReplacement =
    source.includes('Verified localized replacement contract')
    && source.includes("filter((episode) => !episode.raw)")
    && source.includes(".eq('audio_type', 'raw')")
    && source.includes(".in('episode_number', translatedEpisodeNumbers)");
  const unpublishMovie =
    /from\(['"]movies['"]\)[\s\S]{0,240}(?:update|upsert)\(\{[\s\S]{0,160}is_published\s*:\s*false/s.test(source);
  const automaticStreamDeactivation =
    /from\(['"]streams['"]\)[\s\S]{0,180}update\(\{\s*is_active\s*:\s*false/s.test(source);
  const destructiveDetailCacheDelete =
    /from\(['"]movie_api_cache['"]\)\s*\.delete\(\)/s.test(source);

  if (destructiveEpisodeDelete && !verifiedLocalizedReplacement) failures.push(`${file}: source sync can delete last-known-good episodes`);
  if (unpublishMovie) failures.push(`${file}: source sync can unpublish an existing movie`);
  if (automaticStreamDeactivation) failures.push(`${file}: source sync can deactivate streams from one incomplete feed response`);
  if (destructiveDetailCacheDelete) failures.push(`${file}: source sync deletes last-known-good movie detail cache`);
}

const motchill = fs.readFileSync('supabase/functions/sync-motchill-feed/index.ts', 'utf8');
const onlyflix = fs.readFileSync('supabase/functions/sync-onlyflix-feed/index.ts', 'utf8');
const ophim = fs.readFileSync('supabase/functions/sync-ophim-movies/index.ts', 'utf8');
if (!motchill.includes('Additive-only publication contract')) {
  failures.push('Motchill is missing its additive-only publication contract');
}
if (!onlyflix.includes('feed response is only positive evidence')) {
  failures.push('OnlyFlix is missing its positive-evidence-only contract');
}
if (
  !ophim.includes('Unnumbered provider rows are legitimate specials/OVAs')
  || !ophim.includes('if (ep.number > 0)')
  || !ophim.includes('episode_number: ep.number')
) {
  failures.push('OPhim sync must preserve playable special episodes without corrupting numbered episode identity');
}
if (!ophim.includes('safeProviderImage') || !ophim.includes("posterUrl = safeProviderImage(movie.poster_url) || thumbUrl")) {
  failures.push('OPhim sync must reject inline/unsafe poster payloads and fall back to the provider thumbnail');
}

console.log(JSON.stringify({
  status: failures.length ? 'failed' : 'passed',
  connectors_checked: connectorFiles.length,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
