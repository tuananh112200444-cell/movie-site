import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { KHOPHIM_URL, MHOPHIM_URL, satellitePages } from './mhophim-satellite-data.mjs';

const OUT_DIR = resolve('public/mhophim');
const today = new Date().toISOString().slice(0, 10);

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageOutputPath(path) {
  if (path === '/') return resolve(OUT_DIR, 'index.html');
  return resolve(OUT_DIR, path.replace(/^\/+/, ''), 'index.html');
}

function renderNav(currentPath) {
  const links = satellitePages
    .filter((page) => page.path !== '/')
    .map((page) => {
      const active = page.path === currentPath ? ' aria-current="page"' : '';
      return `<a${active} href="${page.path}">${escapeHtml(page.eyebrow)}</a>`;
    })
    .join('');
  return `<nav aria-label="Chuyên mục MHoPhim"><a href="/">MHoPhim</a>${links}<a href="${KHOPHIM_URL}">Xem phim</a></nav>`;
}

function renderPage(page) {
  const canonical = `${MHOPHIM_URL}${page.path === '/' ? '/' : page.path}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: page.title,
    description: page.description,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${MHOPHIM_URL}/#website`,
      name: 'MHoPhim',
      url: MHOPHIM_URL,
    },
      about: ['tin phim', 'review phim', 'lịch chiếu phim', 'gợi ý phim hay'],
    dateModified: today,
  };

  const sections = page.sections
    .map((section) => `
      <section class="content-block">
        <h2>${escapeHtml(section.heading)}</h2>
        <p>${escapeHtml(section.body)}</p>
      </section>`)
    .join('');

  const relatedLinks = satellitePages
    .filter((item) => item.path !== page.path)
    .slice(0, 5)
    .map((item) => `<li><a href="${item.path}">${escapeHtml(item.heading)}</a></li>`)
    .join('');

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MHoPhim">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:url" content="${canonical}">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07080d;
      --panel: #11151f;
      --panel-strong: #171d2a;
      --text: #f7f7fb;
      --muted: #a8afbd;
      --line: rgba(255,255,255,.12);
      --accent: #ff3d46;
      --gold: #f5c15c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background:
        radial-gradient(circle at 12% 0%, rgba(255,61,70,.18), transparent 28rem),
        linear-gradient(180deg, #10131c 0%, var(--bg) 26rem);
      color: var(--text);
      line-height: 1.65;
    }
    a { color: inherit; text-decoration: none; }
    nav {
      position: sticky;
      top: 0;
      z-index: 3;
      display: flex;
      gap: .55rem;
      overflow-x: auto;
      padding: .8rem max(1rem, calc((100vw - 1120px) / 2));
      background: rgba(7,8,13,.84);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(14px);
    }
    nav a {
      flex: 0 0 auto;
      padding: .55rem .8rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      font-size: .92rem;
      font-weight: 700;
    }
    nav a[aria-current="page"], nav a:hover {
      color: #fff;
      border-color: rgba(255,61,70,.55);
      background: rgba(255,61,70,.16);
    }
    main {
      width: min(1120px, calc(100vw - 2rem));
      margin: 0 auto;
      padding: 3rem 0 4rem;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
      gap: 1.4rem;
      align-items: stretch;
    }
    .hero-copy, .side-card, .content-block, .related {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(23,29,42,.9), rgba(13,16,24,.9));
      border-radius: 18px;
      box-shadow: 0 18px 50px rgba(0,0,0,.24);
    }
    .hero-copy { padding: clamp(1.4rem, 3vw, 2.4rem); }
    .eyebrow {
      margin: 0 0 .75rem;
      color: var(--gold);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-size: .78rem;
    }
    h1 {
      margin: 0;
      max-width: 820px;
      font-size: clamp(2.2rem, 5vw, 4.4rem);
      line-height: 1.05;
      letter-spacing: 0;
    }
    .intro {
      margin: 1rem 0 0;
      max-width: 760px;
      color: var(--muted);
      font-size: clamp(1rem, 1.4vw, 1.18rem);
    }
    .cta {
      display: inline-flex;
      margin-top: 1.4rem;
      padding: .82rem 1rem;
      border-radius: 999px;
      background: var(--accent);
      color: white;
      font-weight: 900;
    }
    .side-card {
      padding: 1.2rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 280px;
    }
    .side-card strong { font-size: 1.15rem; }
    .side-card p { color: var(--muted); margin: .6rem 0 0; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .content-block { padding: 1.2rem; }
    h2 { margin: 0 0 .5rem; font-size: 1.25rem; }
    p { margin: 0; }
    .related {
      margin-top: 1rem;
      padding: 1.2rem;
    }
    .related ul {
      margin: .8rem 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .6rem;
    }
    .related a {
      display: block;
      padding: .75rem;
      border: 1px solid var(--line);
      border-radius: 12px;
      color: var(--muted);
    }
    footer {
      border-top: 1px solid var(--line);
      color: var(--muted);
      padding: 1.2rem max(1rem, calc((100vw - 1120px) / 2));
      background: #080910;
    }
    @media (max-width: 760px) {
      main { width: min(100% - 1rem, 1120px); padding-top: 1rem; }
      .hero, .grid, .related ul { grid-template-columns: 1fr; }
      .hero-copy, .side-card, .content-block, .related { border-radius: 14px; }
      nav { padding-inline: .5rem; }
      h1 { font-size: 2.2rem; }
    }
  </style>
</head>
<body>
  ${renderNav(page.path)}
  <main>
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="intro">${escapeHtml(page.intro)}</p>
        <a class="cta" href="${page.cta.href}">${escapeHtml(page.cta.label)}</a>
      </div>
      <aside class="side-card">
        <div>
      <strong>SEO sạch cho domain phụ</strong>
      <p>MHoPhim có nội dung riêng và liên kết về KhoPhim, không tạo bản sao trang xem phim.</p>
        </div>
        <p>Domain chinh: <a href="${KHOPHIM_URL}">khophim.org</a></p>
      </aside>
    </section>
    <div class="grid">${sections}</div>
    <section class="related">
    <h2>Đọc tiếp trên MHoPhim</h2>
      <ul>${relatedLinks}</ul>
    </section>
  </main>
  <footer>
    MHoPhim là domain vệ tinh nội dung của KhoPhim. Trang xem phim chính thức nằm tại <a href="${KHOPHIM_URL}">khophim.org</a>.
  </footer>
</body>
</html>
`;
}

function renderSitemap() {
  const urls = satellitePages
    .map((page) => `  <url>
    <loc>${MHOPHIM_URL}${page.path === '/' ? '/' : page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function renderRobots() {
  return `User-agent: *
Allow: /
Disallow: /phim/
Disallow: /search
Disallow: /api/

Sitemap: ${MHOPHIM_URL}/sitemap.xml
`;
}

function renderNotFound() {
  const page = {
    path: '/404',
    title: 'Không tìm thấy trang - MHoPhim',
    description: 'Trang MHoPhim này không tồn tại.',
    heading: 'Không tìm thấy trang',
    eyebrow: '404',
    intro: 'Nội dung này không tồn tại trên MHoPhim. Hãy quay lại trang chủ hoặc mở KhoPhim để tìm phim.',
    sections: [
      { heading: 'Gợi ý', body: 'Nếu bạn đang tìm phim để xem, hãy tìm trực tiếp trên khophim.org.' },
    ],
    cta: { label: 'Về trang chủ MHoPhim', href: '/' },
  };
  return renderPage(page);
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

for (const page of satellitePages) {
  const outPath = pageOutputPath(page.path);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, renderPage(page), 'utf8');
}

await writeFile(resolve(OUT_DIR, 'sitemap.xml'), renderSitemap(), 'utf8');
await writeFile(resolve(OUT_DIR, 'robots.txt'), renderRobots(), 'utf8');
await writeFile(resolve(OUT_DIR, '404.html'), renderNotFound(), 'utf8');

console.log(`Generated ${satellitePages.length} MHoPhim satellite pages.`);
