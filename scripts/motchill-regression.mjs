import fs from 'node:fs';

const edge = fs.readFileSync('supabase/functions/sync-motchill-feed/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260722233000_add_motchill_release_sync.sql', 'utf8');
const external = fs.readFileSync('scripts/motchill-sync-core.mjs', 'utf8');
const failures = [];

for (const [ok, message] of [
  [edge.includes("const BASE = 'https://www.motchillkz.org'"), 'Current Motchill domain is not configured'],
  [edge.includes("parts[0] !== 'tap-phim'"), 'Current episode route is not supported'],
  [edge.includes('labelNumber !== urlNumber'), 'Episode URL/label mismatch guard is missing'],
  [edge.includes('h1Number !== item.number'), 'Episode page identity guard is missing'],
  [edge.includes('playerOptions(html)') && edge.includes('doo_player_ajax'), 'Dooplay player discovery is missing'],
  [edge.includes('extractStreamcHls') && edge.includes('data-obf=') && edge.includes('payload.sUb'), 'Fast StreamC HLS extraction is missing'],
  [edge.includes("stream_url: String(episode.link_m3u8 || '')"), 'Native HLS stream persistence is missing'],
  [edge.includes('youtube\\.com|youtu\\.be'), 'Trailer-only episode rejection is missing'],
  [edge.includes('localizedTitle(db'), 'Season localization from canonical catalogue is missing'],
  [edge.includes('const declared = 0') && edge.includes('movie.source_site === SOURCE'), 'Recommendation-card episode total contamination guard is missing'],
  [edge.includes('Motchill Vietsub #${option.nume}') && edge.includes("not('server_name', 'in', quoted)"), 'Stable server grouping and stale-label cleanup are missing'],
  [edge.includes("refresh_movie_seo_quality") && edge.includes("search_index_v4_rows"), 'SEO/search cache refresh contract is missing'],
  [migration.includes('sync-motchill-feed-every-10-minutes'), 'Motchill release cron is missing'],
  [external.includes('motchillkz.org'), 'Manual Motchill sync still points only at a retired domain'],
]) if (!ok) failures.push(message);

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checks: 14 }, null, 2));
