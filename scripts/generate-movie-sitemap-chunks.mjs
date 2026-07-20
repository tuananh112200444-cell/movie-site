import { mkdir, writeFile } from 'node:fs/promises';

const FUNCTION_URL = 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/sitemap-movies-xml';

const targets = [
  ['sitemap-movies-recent.xml', 'recent=1&page_size=2000&v=20260720-quality-gated-v4'],
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

function stripPlaceholderImages(xml) {
  return xml.replace(
    /\s*<image:image>\s*<image:loc>https:\/\/readdy\.ai\/api\/search-image\?query=professional%20movie%20poster[\s\S]*?<\/image:image>/gi,
    '',
  ).replace(
    /\s*<image:image>\s*<image:loc>https:\/\/khophim\.org\/images\/movie-poster-fallback\.svg<\/image:loc>\s*<\/image:image>/gi,
    '',
  );
}

async function writeFileWithRetry(path, content, attempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await writeFile(path, content, 'utf8');
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

await mkdir('public', { recursive: true });

const results = [];
for (const [fileName, query] of targets) {
  const xml = stripPlaceholderImages(await fetchSitemap(fileName, query));
  await writeFileWithRetry(`public/${fileName}`, xml);
  const count = (xml.match(/<url>/g) || []).length;
  results.push({ fileName, count });
}

console.log(`Generated ${results.length} curated movie sitemap:`);
for (const result of results) {
  console.log(`- ${result.fileName}: ${result.count} URLs`);
}
