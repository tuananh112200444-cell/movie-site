import { readFile } from 'node:fs/promises';

const source = await readFile('supabase/functions/gsc-seo-feedback/index.ts', 'utf8');
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(source.includes('const INSPECTION_CONCURRENCY = 5;'),
  'GSC URL Inspection concurrency must stay bounded at five requests.');
expect(source.includes('const INSPECTION_TIMEOUT_MS = 12_000;'),
  'GSC URL Inspection requests must have a short, explicit timeout.');
expect(source.includes("Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64')")
    && source.includes('new TextDecoder().decode'),
  'GSC must support a one-line Base64 private key so deployment tools cannot corrupt PEM newlines.');
expect(source.includes('async function inspectCandidates(token:string, candidates:Candidate[])'),
  'GSC URL Inspection calls must run through the bounded batch helper.');
expect(source.includes(".normalize('NFD')") && source.includes(".replace(/đ/g, 'd')"),
  'GSC query classification must normalize Vietnamese diacritics before deciding whether a query is branded.');
expect(source.includes("return 'competitor_navigation'") && source.includes("return 'title_or_entity'"),
  'GSC dashboard must separate competitor navigation from genuine topic or movie-title demand.');
expect(source.includes('await Promise.all(Array.from('),
  'GSC URL Inspection batch must wait for all bounded workers before recording the run.');
expect(source.includes("searchAnalytics(token,['query','page'])")
    && source.includes("operator:'contains',expression:'/phim/'")
    && source.includes("from('seo_query_page_metrics').insert(queryPageMetrics)"),
  'GSC must persist query-to-landing-page evidence for non-brand SEO decisions.');
expect(source.includes('if (/429|403|disabled/i.test(message)) stop = true;'),
  'GSC URL Inspection batch must stop dispatching after a quota or credential error.');
expect(!source.includes('for (const candidate of candidateRows)'),
  'GSC URL Inspection calls must not regress to a sequential loop.');
expect(source.includes(".gte('content_length',350)")
    && source.includes(".is('movies.superseded_by_movie_id',null)")
    && source.includes('isStrongInspectionCandidate'),
  'GSC must spend its daily inspection quota only on current high-value canonical movies.');
expect(source.includes(".in('index_tier',['ongoing','playable','upcoming'])")
    && source.includes("tier === 'upcoming'")
    && source.includes('score < 88 || contentLength < 350')
    && source.includes('hasTrustedYouTubeTrailer'),
  'GSC may inspect only the bounded high-quality trailer-backed upcoming cohort.');
expect(source.includes('inspection_slugs?:unknown')
    && source.includes('requestedInspectionRank')
    && source.includes('.slice(0,5)')
    && source.includes('if (item.requestedRank > 0) return true;')
    && source.includes('contentLength < 500 && requestedRank === 0')
    && source.includes('!isStrongInspectionCandidate(movie) && requestedRank === 0')
    && !source.includes(".not('movies.tmdb_id','is',null)"),
  'GSC must support a tightly bounded explicit reinspection request for a priority movie.');
expect(source.includes("from('seo_hot_movie_candidates').select('matched_slug,demand_score')")
    && source.includes('hotDemandBySlug')
    && source.includes('if (a.hotDemand !== b.hotDemand)'),
  'GSC must prioritize quality-approved movies with current hot-demand evidence.');

if (failures.length) {
  console.error('GSC SEO feedback regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('GSC SEO feedback regression passed.');
