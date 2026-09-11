import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const compiledWorker = path.join(projectRoot, '.wrangler', 'functions-build', 'index.js');
const outputWorker = path.join(projectRoot, 'out', '_worker.js');

const workerSource = await readFile(compiledWorker, 'utf8');
if (!workerSource.includes('export {') || !workerSource.includes('as default')) {
  throw new Error('Compiled Pages Worker is missing its module default export.');
}
if (!workerSource.includes('env["ASSETS"].fetch(request)')) {
  throw new Error('Compiled Pages Worker cannot fall back to static assets.');
}

await mkdir(path.dirname(outputWorker), { recursive: true });
await copyFile(compiledWorker, outputWorker);
console.log('Installed the compiled Pages Worker at out/_worker.js.');
