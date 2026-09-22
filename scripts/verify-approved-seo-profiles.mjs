import { readFile } from 'node:fs/promises';

const base = new URL(process.argv[2] || 'https://khophim.org');
const preview = base.hostname.endsWith('.pages.dev');
const sitemap = await readFile('out/sitemap-seo-studio.xml','utf8');
const urls = [...sitemap.matchAll(/<loc>(https:\/\/khophim\.org\/phim\/[^<]+)<\/loc>/g)]
  .map((match) => match[1]);
const unique = [...new Set(urls)];
const issues = [];
let cursor = 0;

async function worker() {
  while (cursor < unique.length) {
    const canonical = unique[cursor++];
    const route = new URL(new URL(canonical).pathname,base);
    for (const agent of ['Googlebot/2.1','Mozilla/5.0']) {
      try {
        const response = await fetch(route,{
          redirect:'manual',
          headers:{'user-agent':agent,'accept':'text/html'},
          signal:AbortSignal.timeout(20000),
        });
        const html = await response.text();
        const robots = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)/i)?.[1] || '';
        const canonicalValue = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)/i)?.[1] || '';
        const checks = {
          http200:response.status===200,
          robotsIndex:/\bindex\b/i.test(robots) && !/noindex/i.test(robots),
          // Preview domains are intentionally noindex. Production must not be.
          headerIndex:preview || !String(response.headers.get('x-robots-tag')||'').includes('noindex'),
          canonical:canonicalValue===canonical,
          h1:/<h1\b/i.test(html),
          schema:/"@type"\s*:\s*"(?:Movie|TVSeries)"/.test(html),
          profileVersion:/data-kp-seo-profile-version=/.test(html),
        };
        if (Object.values(checks).some((value)=>!value)) {
          issues.push({route:route.toString(),agent,status:response.status,checks});
        }
      } catch (error) {
        issues.push({route:route.toString(),agent,error:error instanceof Error?error.message:String(error)});
      }
    }
  }
}

await Promise.all(Array.from({length:6},()=>worker()));
console.log(JSON.stringify({base:base.origin,previewHeaderNoindexExpected:preview,approvedUrls:unique.length,checkedDocuments:unique.length*2,issues},null,2));
if (unique.length === 0 || issues.length) process.exitCode=1;
