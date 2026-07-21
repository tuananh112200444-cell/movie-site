import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/sync-glvietsub-feed/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260721195500_add_glvietsub_sync.sql', 'utf8');
const healthMigration = fs.readFileSync('supabase/migrations/20260721210000_harden_operations_health_and_cron.sql', 'utf8');
const movieApi = fs.readFileSync('src/services/movieApi.ts', 'utf8');
const detailProxy = fs.readFileSync('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const detailPage = fs.readFileSync('src/pages/movie-detail/page.tsx', 'utf8');
const player = fs.readFileSync('src/pages/movie-detail/components/MovieDetailPlayerSection.tsx', 'utf8');
const queerHome = fs.readFileSync('src/pages/home/components/QueerUniverseHome.tsx', 'utf8');
const queerHero = fs.readFileSync('src/pages/home/components/QueerUniverseHero.tsx', 'utf8');
const checks = [
  [source.includes("const SOURCE = 'glvietsub'"), 'GLVietsub source identity is missing'],
  [source.includes("action: 'doo_player_ajax'"), 'Dooplay player resolver is missing'],
  [source.includes('consecutiveFailures >= 3'), 'GLVietsub circuit breaker is missing'],
  [source.includes('const urlChanged') && source.includes("!['health_status', 'failure_count', 'last_error'].includes(key)"), 'Unchanged GLVietsub URLs must preserve accumulated stream health'],
  [source.includes('mapWithConcurrency') && source.includes('links.slice(0, 80), 3'), 'GLVietsub episode parsing must use bounded concurrency'],
  [source.includes('findCanonicalMovieByIdentity') && source.includes('normalizedNames'), 'GL/BL canonical matching must use the shared identity policy'],
  [source.includes('.slice(0, 2)'), 'Each episode must expose at most two sources'],
  [source.includes("episode.raw ? 'raw' : 'vietsub'"), 'RAW/Vietsub episodes must remain distinguishable'],
  [source.includes('no-video') && source.includes('directRawEmbed'), 'Direct RAW iframe fallback is missing'],
  [source.includes('safe.length ? safe'), 'Safer embed providers must be preferred'],
  [source.includes("'glvietsub-feed-backfill'"), 'Archive backfill cursor is missing'],
  [source.includes('discoverDetailUrls(latestHtml, 1)'), 'Every run must still inspect the newest source title'],
  [source.includes("is_published: Number(entry.currentEpisode || 0) > 0"), 'Unplayable discoveries must not be published'],
  [migration.includes('sync-glvietsub-feed-every-15-minutes'), '15-minute sync cron is missing'],
  [migration.includes("where name = 'CRON_SECRET'"), 'Cron secret must come from Vault'],
  [movieApi.includes('source_site.ilike.%glvietsub%'), 'Queer catalogue does not include GLVietsub'],
  [detailProxy.includes("String(ep.audio_type || '').toLowerCase() === 'raw'"), 'RAW must not inflate the translated current-episode number'],
  [detailPage.includes('translated.length > 0 ? translated : playable'), 'Default watch route must prefer translated episodes'],
  [detailPage.includes("String(ep.audio_type || '').toLowerCase() === 'raw'"), 'Detail hero must not label a RAW release as Vietsub'],
  [movieApi.includes('RAW is a useful early-access choice'), 'Automatic source selection must not silently choose RAW'],
  [player.includes("'RAW · Chưa phụ đề'") && player.includes('isRawEpisode(item.ep)'), 'Player RAW labels are missing'],
  [movieApi.includes("'glvietsub', 'gl vietsub'") && movieApi.includes('getQueerSourceFitScore'), 'BL/GL source-role deduplication is missing'],
  [movieApi.includes("haystack.includes('glvietsub')"), 'GLVietsub details must participate in queer source merging'],
  [queerHome.includes('priority={false}') && !queerHome.includes('priority={index < 6}'), 'Queer grids must not compete with the hero using high-priority images'],
  [queerHero.includes('heroRequestWidth') && queerHero.includes('fetchPriority="low"'), 'Responsive queer hero image policy is missing'],
  [healthMigration.includes("auto-repair-player-issues-every-30-minutes") && healthMigration.includes("cron.unschedule('sync-blvietsub-smart-repair-every-30-minutes')"), 'Redundant/stuck repair cron cleanup is missing'],
  [healthMigration.includes("event_type in ('stall_fatal'") && healthMigration.includes("http_code in (404,410)"), 'Operations health must exclude recovery events and probe-only 403 responses'],
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
console.log(JSON.stringify({ checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
