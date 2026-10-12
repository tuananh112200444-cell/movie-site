import fs from 'node:fs';

const files = [
  'index.html',
  'functions/[[path]].js',
  'src/components/feature/Navbar.tsx',
  'src/components/feature/Footer.tsx',
  'src/pages/about/page.tsx',
  'src/pages/policy/page.tsx',
  'public/press/index.html',
  'vite.config.ts',
];
const personalMarkers = [
  'khophim',
  'khophim-support',
  '[redacted]',
  '[redacted]',
  '[local]',
  '[local]',
];
const failures = files.flatMap((file) => {
  const content = fs.readFileSync(file, 'utf8');
  return personalMarkers.filter((marker) => content.includes(marker)).map((marker) => `${file} contains private author marker: ${marker}`);
});

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join('\n'));
  process.exit(1);
}

console.log('author privacy regression passed');
