import { mkdir, writeFile } from 'node:fs/promises';

const FUNCTION_URL = 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sitemap-movies-xml';

const targets = [
  ['sitemap-movies-recent.xml', 'recent=1&page_size=2000'],
  ['sitemap-movies-upcoming.xml', 'upcoming=1&page_size=5000'],
  ...Array.from({ length: 8 }, (_, index) => [
    `sitemap-movies-${index + 1}.xml`,
    `page=${index + 1}&page_size=5000`,
  ]),
];

async function fetchSitemap(fileName, query) {
  const url = `${FUNCTION_URL}?${query}`;
  const response = await fetch(url, {
    headers: { accept: 'application/xml,text/xml,*/*' },
    signal: AbortSignal.timeout(45_000),
  });
  const xml = await response.text();
  if (!response.ok) {
    throw new Error(`${fileName} returned ${response.status}`);
  }
  if (!xml.includes('<urlset') || !xml.includes('https://khophim.org/phim/')) {
    throw new Error(`${fileName} did not return a valid movie URL sitemap`);
  }
  return xml;
}

await mkdir('public', { recursive: true });

const results = [];
for (const [fileName, query] of targets) {
  const xml = await fetchSitemap(fileName, query);
  await writeFile(`public/${fileName}`, xml, 'utf8');
  const count = (xml.match(/<url>/g) || []).length;
  results.push({ fileName, count });
}

console.log(`Generated ${results.length} movie sitemap chunks:`);
for (const result of results) {
  console.log(`- ${result.fileName}: ${result.count} URLs`);
}
