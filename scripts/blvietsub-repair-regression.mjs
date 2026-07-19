import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/sync-blvietsub-feed/index.ts', 'utf8');
const checks = [
  ['completed 1/1 is eligible for recheck', /current <= 1 && total <= 1[\s\S]{0,40}return true/],
  ['legacy 1/1 receives starvation-proof priority', /legacySingleEpisode[\s\S]{0,200}score \+= 9000/],
  ['repair updates numeric total and display total together', /update\.episode_total = `\$\{mergedTotal\} Tập`[\s\S]{0,160}update\.total_episodes = mergedTotal/],
  ['WordPress root movie URLs are supported', /parts\[0\]\?\.toLowerCase\(\) === 'phim' \? parts\[1\] : parts\.length === 1 \? parts\[0\]/],
  ['original title is recovered from WordPress metadata', /originName: getWordPressOriginName\(title, content\)/],
  ['repair batches use bounded concurrency', /rows\.slice\(index, index \+ 4\)\.map/],
  ['repair queue retains movie and source URL', /\.slice\(0, cappedLimit\);[\s\S]{0,500}\{ movie, sourceUrl \}/],
  ['one-video sources cannot pollute healthy series', /dbBeforeEpisode >= 4 && sourceMaxEpisode <= 1[\s\S]{0,700}backward_guarded: true/],
  ['guarded titles rotate behind the repair queue', /Mark the check as completed[\s\S]{0,220}last_synced_at/],
  ['source-specific duplicates still compete with global canonical movies', /findBestMovieForEntry[\s\S]{0,420}selectPreferredMovie\(\[localMatch, globalMatch\]/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
console.log(JSON.stringify({ checks: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
