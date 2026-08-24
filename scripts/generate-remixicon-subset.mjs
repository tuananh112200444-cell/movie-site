import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve('src/styles/remixicon-local.css');
const outputPath = path.resolve('src/styles/remixicon-used.css');
const roots = [path.resolve('src'), path.resolve('index.html')];

function sourceFiles(entry) {
  const stat = fs.statSync(entry);
  if (stat.isFile()) return [entry];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap((item) => {
    const fullPath = path.join(entry, item.name);
    if (item.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:ts|tsx|js|jsx|html)$/.test(item.name) ? [fullPath] : [];
  });
}

const used = new Set();
for (const file of roots.flatMap(sourceFiles)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bri-[a-z0-9-]+\b/g)) used.add(match[0]);
}

const fullCss = fs.readFileSync(sourcePath, 'utf8');
const firstIconAt = fullCss.search(/\.ri-[a-z0-9-]+:before\s*\{/);
if (firstIconAt < 0) throw new Error('Remix Icon source has no icon rules');

const base = fullCss.slice(0, firstIconAt).trimEnd();
const rules = [];
for (const match of fullCss.matchAll(/\.([a-z0-9-]+):before\s*\{[^}]+\}/g)) {
  if (used.has(match[1])) rules.push(match[0]);
}

const output = `${base}\n\n/* Generated from ${used.size} icons referenced by the application. */\n${rules.join('\n')}\n`;
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`remixicon subset generated: ${rules.length} rules, ${Buffer.byteLength(output)} bytes`);
