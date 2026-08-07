import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/sitemap-movies-xml/index.ts', 'utf8');
const failures = [];

const requireText = (text, message) => {
  if (!source.includes(text)) failures.push(message);
};

requireText('async function fetchEligibleRecentMovies', 'recent sitemap has no bounded quality-gated query');
requireText(".order('last_episode_change_at', { ascending: false, nullsFirst: false })", 'recent sitemap is not ordered by the persisted episode freshness');
requireText('fetchEligibleRecentMovies(Math.max(2000, options.outputLimit * 10))', 'recent sitemap does not keep a bounded candidate pool');

if (source.includes("options.mode === 'recent'\n          ? fetchEligibleMovies(0, 50000)")) {
  failures.push('recent sitemap still scans the entire quality catalogue');
}

console.log(JSON.stringify({
  status: failures.length ? 'failed' : 'passed',
  contracts: 4,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
