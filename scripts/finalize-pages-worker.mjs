import { readFile, writeFile } from 'node:fs/promises';

const input = '.wrangler/functions-bundle/index.js';
const output = 'out/_worker.js';
const source = await readFile(input, 'utf8');

for (const marker of [
  '"/api/movie-detail"',
  '"/api/player-source-health"',
  '"/api/search"',
  'ASSETS',
  'export{',
]) {
  if (!source.includes(marker)) {
    throw new Error(`Compiled Pages worker is missing required marker: ${marker}`);
  }
}

if (source.includes('Content-Disposition: form-data')) {
  throw new Error('Compiled Pages worker is a multipart upload body, not a JavaScript module.');
}

await writeFile(output, source, 'utf8');
console.log(`Finalized ${output} (${Buffer.byteLength(source)} bytes).`);
