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
expect(source.includes('async function inspectCandidates(token:string, candidates:Candidate[])'),
  'GSC URL Inspection calls must run through the bounded batch helper.');
expect(source.includes(".normalize('NFD')") && source.includes(".replace(/đ/g, 'd')"),
  'GSC query classification must normalize Vietnamese diacritics before deciding whether a query is branded.');
expect(source.includes('await Promise.all(Array.from('),
  'GSC URL Inspection batch must wait for all bounded workers before recording the run.');
expect(source.includes('if (/429|403|disabled/i.test(message)) stop = true;'),
  'GSC URL Inspection batch must stop dispatching after a quota or credential error.');
expect(!source.includes('for (const candidate of candidateRows)'),
  'GSC URL Inspection calls must not regress to a sequential loop.');

if (failures.length) {
  console.error('GSC SEO feedback regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('GSC SEO feedback regression passed.');
