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

const editorialArt = [
  '/mhophim-assets/hero.png',
  '/mhophim-assets/thai.png',
  '/mhophim-assets/bl.png',
  '/mhophim-assets/kdrama.png',
  '/mhophim-assets/cdrama.png',
  '/mhophim-assets/anime.png',
  '/mhophim-assets/action.png',
  '/mhophim-assets/vietnam.png',
];

function artForIndex(index) {
  return editorialArt[index % editorialArt.length];
}

function renderNav(currentPath) {
  const links = satellitePages
    .filter((page) => page.path !== '/')
    .slice(0, 10)
    .map((page) => {
      const active = page.path === currentPath ? ' class="active" aria-current="page"' : '';
      return `<a${active} href="${page.path}">${escapeHtml(page.eyebrow)}</a>`;
    })
    .join('');
  return `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="MHoPhim">
        <span class="brand-mark">M</span>
        <span>MHo<span>Phim</span></span>
      </a>
      <nav aria-label="Chuyên mục MHoPhim">
        <a${currentPath === '/' ? ' class="active" aria-current="page"' : ''} href="/">Trang chủ</a>
        ${links}
      </nav>
      <a class="watch-now" href="${KHOPHIM_URL}">Sang KhoPhim</a>
    </div>
  </header>`;
}

function renderPage(page) {
  const canonical = `${MHOPHIM_URL}${page.path === '/' ? '/' : page.path}`;
  const pagePosition = satellitePages.findIndex((item) => item.path === page.path);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${MHOPHIM_URL}/#website`,
      name: 'MHoPhim',
      alternateName: ['MHo Phim', 'mhophim.com'],
      url: MHOPHIM_URL,
      inLanguage: 'vi-VN',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${MHOPHIM_URL}/huong-dan/tim-phim?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${MHOPHIM_URL}/#organization`,
      name: 'MHoPhim',
      url: MHOPHIM_URL,
      logo: `${MHOPHIM_URL}/mhophim-assets/hero.png`,
      sameAs: [KHOPHIM_URL],
    },
    {
      '@context': 'https://schema.org',
      '@type': page.path === '/' ? 'CollectionPage' : 'Article',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: page.title,
      headline: page.heading,
      description: page.description,
      inLanguage: 'vi-VN',
      isPartOf: {
        '@id': `${MHOPHIM_URL}/#website`,
      },
      about: ['tin phim', 'review phim', 'lịch chiếu phim', 'gợi ý phim hay'],
      dateModified: today,
      mainEntityOfPage: canonical,
      publisher: {
        '@id': `${MHOPHIM_URL}/#organization`,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'MHoPhim', item: `${MHOPHIM_URL}/` },
        ...(page.path === '/' ? [] : [{ '@type': 'ListItem', position: 2, name: page.heading, item: canonical }]),
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': `${canonical}#related`,
      name: `Gợi ý liên quan - ${page.heading}`,
      itemListElement: satellitePages
        .filter((item) => item.path !== page.path)
        .slice(0, 8)
        .map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.heading,
          url: `${MHOPHIM_URL}${item.path === '/' ? '/' : item.path}`,
        })),
    },
    ...(pagePosition >= 0 ? [{
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      '@id': `${canonical}#domain-role`,
      name: 'Vai trò SEO của MHoPhim',
      description: 'MHoPhim là lớp nội dung editorial, review, lịch chiếu và gợi ý phim. Trang xem phim chính thức nằm trên khophim.org để tránh trùng lặp SEO.',
      isPartOf: { '@id': `${MHOPHIM_URL}/#website` },
      mentions: { '@type': 'WebSite', name: 'KhoPhim', url: KHOPHIM_URL },
    }] : []),
  ];

  const sections = page.sections
    .map((section) => `
      <section class="content-block">
        <h2>${escapeHtml(section.heading)}</h2>
        <p>${escapeHtml(section.body)}</p>
      </section>`)
    .join('');

  const relatedLinks = satellitePages
    .filter((item) => item.path !== page.path)
    .slice(0, 12)
    .map((item, index) => `<article class="poster-card">
      <a href="${item.path}" aria-label="${escapeHtml(item.heading)}">
        <div class="poster-media">
          <img src="${artForIndex(index + 1)}" alt="${escapeHtml(item.heading)}" loading="lazy">
          <span>${escapeHtml(item.eyebrow)}</span>
        </div>
        <h3>${escapeHtml(item.heading)}</h3>
        <p>${escapeHtml(item.description)}</p>
      </a>
    </article>`)
    .join('');

  const trendCards = satellitePages
    .filter((item) => item.path !== '/')
    .slice(0, 8)
    .map((item, index) => `<li>
      <a href="${item.path}">
        <strong>${String(index + 1).padStart(2, '0')}</strong>
        <span>${escapeHtml(item.heading)}</span>
      </a>
    </li>`)
    .join('');

  const sectionCards = page.sections
    .map((section, index) => `
      <section class="article-card">
        <span class="article-icon">${index + 1}</span>
        <h2>${escapeHtml(section.heading)}</h2>
        <p>${escapeHtml(section.body)}</p>
      </section>`)
    .join('');

  const heroImage = page.path === '/' ? editorialArt[0] : artForIndex(satellitePages.findIndex((item) => item.path === page.path) + 1);
  const heroImageUrl = heroImage.startsWith('http') ? heroImage : `${MHOPHIM_URL}${heroImage}`;

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="language" content="vi">
  <meta name="content-language" content="vi-VN">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="vi" href="${canonical}">
  <link rel="alternate" hreflang="vi-VN" href="${canonical}">
  <link rel="alternate" hreflang="x-default" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MHoPhim">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${heroImageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(page.title)}">
  <meta name="twitter:description" content="${escapeHtml(page.description)}">
  <meta name="twitter:image" content="${heroImageUrl}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    :root { color-scheme: dark; --bg:#07080d; --panel:#11151f; --panel2:#151923; --text:#f7f7fb; --muted:#a8afbd; --line:rgba(255,255,255,.09); --accent:#ef233c; --accent2:#b91c1c; --gold:#f5c15c; }
    * { box-sizing: border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; font-family:Inter,Arial,Helvetica,sans-serif; background:radial-gradient(circle at 18% -4%, rgba(239,35,60,.22), transparent 28rem), radial-gradient(circle at 82% 8%, rgba(245,193,92,.08), transparent 24rem), linear-gradient(180deg,#10131d 0%,#090a10 34rem,var(--bg) 100%); color:var(--text); line-height:1.6; }
    a { color:inherit; text-decoration:none; }
    .site-header { position:sticky; top:0; z-index:20; border-bottom:1px solid var(--line); background:rgba(7,8,13,.94); box-shadow:0 8px 32px rgba(0,0,0,.52); backdrop-filter:blur(18px); }
    .header-inner { width:min(1280px,calc(100vw - 2rem)); margin:0 auto; min-height:74px; display:flex; align-items:center; gap:1rem; }
    .brand { display:flex; align-items:center; gap:.7rem; flex:0 0 auto; font-size:1.4rem; font-weight:950; letter-spacing:-.02em; }
    .brand span span { color:#ef4444; }
    .brand-mark { display:grid; place-items:center; width:42px; height:42px; border-radius:14px; background:linear-gradient(135deg,#ef4444,#991b1b); color:#fff; box-shadow:0 18px 38px rgba(239,68,68,.22); }
    nav { display:flex; align-items:center; gap:.25rem; overflow-x:auto; scrollbar-width:none; padding:.45rem; border:1px solid rgba(255,255,255,.07); border-radius:18px; background:rgba(0,0,0,.24); }
    nav::-webkit-scrollbar { display:none; }
    nav a { flex:0 0 auto; padding:.62rem .78rem; border-radius:13px; color:rgba(255,255,255,.72); font-size:.9rem; font-weight:800; }
    nav a.active, nav a:hover { color:#fff; background:rgba(239,35,60,.18); }
    .watch-now { margin-left:auto; flex:0 0 auto; padding:.85rem 1.15rem; border-radius:16px; background:linear-gradient(135deg,#ef233c,#b91c1c); color:#fff; font-weight:950; box-shadow:0 14px 30px rgba(239,35,60,.22); text-transform:uppercase; letter-spacing:.02em; }
    main { width:min(1280px, calc(100vw - 2rem)); margin:0 auto; padding:1.35rem 0 4rem; }
    .hero { position:relative; display:grid; grid-template-columns:minmax(0,1.08fr) minmax(300px,.56fr); gap:1rem; min-height:clamp(440px,52vw,640px); overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:24px; background:#0a0c14; box-shadow:0 26px 80px rgba(0,0,0,.45); }
    .hero-bg { position:absolute; inset:0; }
    .hero-bg img { width:100%; height:100%; object-fit:cover; opacity:.42; filter:saturate(1.08) contrast(1.05); }
    .hero-bg::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,rgba(7,8,13,.98) 0%,rgba(7,8,13,.82) 39%,rgba(7,8,13,.36) 76%,rgba(7,8,13,.9) 100%), linear-gradient(180deg,rgba(7,8,13,.04),#07080d 100%); }
    .hero-copy { position:relative; z-index:1; align-self:end; padding:clamp(1.25rem,4vw,3.4rem); }
    .kicker-row { display:flex; flex-wrap:wrap; gap:.55rem; margin-bottom:1rem; }
    .eyebrow, .badge { display:inline-flex; align-items:center; gap:.35rem; width:max-content; border:1px solid rgba(255,255,255,.12); border-radius:999px; background:rgba(0,0,0,.42); padding:.42rem .66rem; color:#fecaca; font-weight:900; text-transform:uppercase; letter-spacing:.06em; font-size:.72rem; }
    .badge { color:#f5c15c; }
    h1 { margin:0; max-width:820px; font-size:clamp(2.45rem,6.2vw,5.8rem); line-height:.98; letter-spacing:-.035em; text-shadow:0 14px 48px rgba(0,0,0,.62); }
    .intro { margin:1rem 0 0; max-width:780px; color:rgba(255,255,255,.78); font-size:clamp(1rem,1.35vw,1.2rem); }
    .hero-actions { display:flex; flex-wrap:wrap; gap:.8rem; margin-top:1.55rem; }
    .cta, .ghost-cta { display:inline-flex; align-items:center; justify-content:center; min-height:46px; padding:.82rem 1.08rem; border-radius:14px; font-weight:950; }
    .cta { background:linear-gradient(135deg,#ef233c,#b91c1c); color:white; box-shadow:0 16px 32px rgba(239,35,60,.26); }
    .ghost-cta { border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); color:#fff; }
    .mega-transfer { position:relative; z-index:2; margin-top:1.15rem; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:1rem; align-items:center; overflow:hidden; border:1px solid rgba(239,68,68,.32); border-radius:24px; background:radial-gradient(circle at 16% 0%,rgba(239,68,68,.36),transparent 38%),linear-gradient(135deg,rgba(127,29,29,.52),rgba(12,14,22,.98)); padding:clamp(1rem,2.4vw,1.55rem); box-shadow:0 24px 80px -46px rgba(239,68,68,.9), inset 0 1px 0 rgba(255,255,255,.08); }
    .mega-transfer h2 { margin:0; font-size:clamp(1.55rem,3.1vw,3rem); line-height:1.04; letter-spacing:-.025em; }
    .mega-transfer p { margin:.45rem 0 0; color:rgba(255,255,255,.74); font-weight:700; }
    .mega-transfer .mega-link { display:inline-flex; align-items:center; justify-content:center; min-height:58px; padding:1rem 1.25rem; border-radius:18px; background:#fff; color:#991b1b; font-weight:1000; text-transform:uppercase; box-shadow:0 18px 42px rgba(0,0,0,.35); white-space:nowrap; }
    .hero-side { position:relative; z-index:1; display:flex; flex-direction:column; justify-content:flex-end; padding:1rem; }
    .feature-panel { border:1px solid rgba(255,255,255,.1); border-radius:22px; background:linear-gradient(180deg,rgba(20,23,32,.9),rgba(10,12,20,.96)); padding:1rem; box-shadow:0 22px 60px rgba(0,0,0,.32); }
    .feature-panel img { width:100%; aspect-ratio:16/10; object-fit:cover; border-radius:16px; background:#151824; }
    .feature-panel strong { display:block; margin:.9rem 0 .4rem; font-size:1.12rem; }
    .feature-panel p { color:var(--muted); }
    .strip { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.75rem; margin:1rem 0; }
    .stat { border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,.035); padding:1rem; }
    .stat strong { display:block; color:#fff; font-size:1.35rem; }
    .stat span { color:var(--muted); font-size:.88rem; }
    .section-head { display:flex; align-items:end; justify-content:space-between; gap:1rem; margin:2rem 0 .9rem; }
    .section-head h2 { margin:0; font-size:clamp(1.45rem,2.6vw,2.2rem); letter-spacing:-.02em; }
    .section-head p { color:var(--muted); max-width:600px; }
    .poster-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:.85rem; }
    .poster-card a { display:block; height:100%; }
    .poster-card { border-radius:18px; padding:.35rem; background:transparent; transition:transform .2s ease, background .2s ease; }
    .poster-card:hover { transform:translateY(-4px); background:rgba(255,255,255,.045); }
    .poster-media { position:relative; overflow:hidden; aspect-ratio:2/3; border-radius:15px; background:#151824; border:1px solid rgba(255,255,255,.07); box-shadow:0 18px 44px -28px rgba(0,0,0,.95); }
    .poster-media img { width:100%; height:100%; object-fit:cover; transition:transform .35s ease; }
    .poster-card:hover img { transform:scale(1.05); }
    .poster-media::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.08) 0%,rgba(0,0,0,0) 42%,rgba(0,0,0,.86) 100%); }
    .poster-media span { position:absolute; left:.55rem; bottom:.55rem; z-index:1; max-width:calc(100% - 1.1rem); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-radius:8px; background:rgba(0,0,0,.62); padding:.24rem .45rem; color:#fff; font-size:.68rem; font-weight:900; }
    .poster-card h3 { margin:.6rem .25rem .22rem; font-size:.95rem; line-height:1.28; }
    .poster-card p { margin:0 .25rem; color:rgba(255,255,255,.56); font-size:.82rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .content-layout { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:1rem; margin-top:1.2rem; align-items:start; }
    .article-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
    .article-card, .trend-box, .seo-box { border:1px solid var(--line); background:linear-gradient(180deg,rgba(20,23,32,.88),rgba(11,13,20,.94)); border-radius:20px; padding:1.1rem; box-shadow:inset 0 1px 0 rgba(255,255,255,.04); }
    .article-icon { display:grid; place-items:center; width:38px; height:38px; border-radius:12px; background:linear-gradient(135deg,rgba(239,35,60,.28),rgba(185,28,28,.14)); color:#fecaca; font-weight:950; margin-bottom:.75rem; }
    h2 { margin:0 0 .5rem; font-size:1.18rem; }
    p { margin:0; }
    .article-card p, .seo-box p { color:var(--muted); }
    .trend-box h2, .seo-box h2 { margin-bottom:.8rem; }
    .trend-box ol { margin:0; padding:0; list-style:none; display:grid; gap:.55rem; }
    .trend-box a { display:grid; grid-template-columns:48px minmax(0,1fr); gap:.65rem; align-items:center; border-radius:13px; padding:.58rem; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.045); }
    .trend-box strong { color:#ef4444; font-size:1.15rem; font-weight:950; }
    .trend-box span { color:rgba(255,255,255,.82); font-weight:800; font-size:.9rem; line-height:1.3; }
    .seo-box { margin-top:1rem; }
    .seo-tags { display:flex; flex-wrap:wrap; gap:.45rem; margin-top:.9rem; }
    .seo-tags span { border:1px solid rgba(255,255,255,.08); border-radius:999px; background:rgba(255,255,255,.04); padding:.36rem .58rem; color:rgba(255,255,255,.72); font-size:.78rem; font-weight:800; }
    .final-cta { margin-top:1.2rem; overflow:hidden; border:1px solid rgba(239,68,68,.2); border-radius:22px; background:radial-gradient(circle at 14% 0%,rgba(239,68,68,.22),transparent 35%),linear-gradient(135deg,rgba(127,29,29,.3),rgba(12,14,22,.96)); padding:1.35rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    .final-cta h2 { font-size:1.45rem; }
    .final-cta p { color:var(--muted); max-width:720px; }
    footer { border-top:1px solid var(--line); color:var(--muted); padding:1.4rem max(1rem, calc((100vw - 1280px) / 2)); background:#08090e; }
    @media (max-width:1050px) { .header-inner { min-height:66px; } nav { order:3; width:100%; } .header-inner { flex-wrap:wrap; padding:.75rem 0; } .watch-now { margin-left:auto; } .hero, .content-layout { grid-template-columns:1fr; } .hero-side { padding-top:0; } .poster-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } .strip { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:760px) { main { width:min(100% - 1rem,1280px); padding-top:.6rem; } .hero { min-height:auto; border-radius:18px; } .hero-copy { padding:1.25rem; } .feature-panel { display:none; } h1 { font-size:2.35rem; } .poster-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:.65rem; } .article-grid, .strip { grid-template-columns:1fr; } .mega-transfer, .final-cta { align-items:flex-start; grid-template-columns:1fr; flex-direction:column; } .mega-transfer .mega-link { width:100%; white-space:normal; text-align:center; } .brand { font-size:1.15rem; } .brand-mark { width:36px; height:36px; } .watch-now { padding:.7rem .82rem; } }
  </style>
</head>
<body>
  ${renderNav(page.path)}
  <main>
    <section class="hero">
      <div class="hero-bg"><img src="${heroImage}" alt="${escapeHtml(page.heading)}"></div>
      <div class="hero-copy">
        <div class="kicker-row">
          <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
          <span class="badge">Tạp chí phim riêng</span>
        </div>
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="intro">${escapeHtml(page.intro)}</p>
        <div class="hero-actions">
          <a class="cta" href="${page.cta.href}">${escapeHtml(page.cta.label)}</a>
          <a class="ghost-cta" href="#goi-y">Đọc gợi ý phim</a>
        </div>
      </div>
      <aside class="hero-side">
        <div class="feature-panel">
          <img src="${artForIndex(2)}" alt="MHoPhim review phim">
          <strong>Nội dung riêng cho MHoPhim</strong>
          <p>Tin phim, top phim, review và lịch cập nhật. Trang xem phim/player vẫn tập trung trên KhoPhim.</p>
        </div>
      </aside>
    </section>

    <section class="mega-transfer" aria-label="Chuyển sang KhoPhim">
      <div>
        <h2>Sang KhoPhim để xem phim ngay</h2>
        <p>MHoPhim giúp bạn chọn phim nhanh hơn. Khi muốn xem tập phim, hãy mở KhoPhim để vào đúng trang xem phim chính thức.</p>
      </div>
      <a class="mega-link" href="${page.cta.href}">Mở KhoPhim</a>
    </section>

    <section class="strip" aria-label="Vai trò SEO của MHoPhim">
      <div class="stat"><strong>Editorial</strong><span>Tin phim và gợi ý riêng</span></div>
      <div class="stat"><strong>Canonical</strong><span>Tự trỏ về mhophim.com</span></div>
      <div class="stat"><strong>No copy</strong><span>Không lặp trang xem phim</span></div>
      <div class="stat"><strong>Traffic</strong><span>Dẫn người xem về KhoPhim</span></div>
    </section>

    <section id="goi-y" class="related">
      <div class="section-head">
        <h2>Gợi ý nổi bật trên MHoPhim</h2>
        <p>Các cụm nội dung này được viết như tạp chí phim, khác vai trò với trang xem phim trên khophim.org.</p>
      </div>
      <div class="poster-grid">${relatedLinks}</div>
    </section>

    <div class="content-layout">
      <div>
        <div class="section-head">
          <h2>Nội dung của trang này</h2>
          <p>Bài viết giúp người xem chọn phim, hiểu lịch cập nhật và tìm đúng danh mục.</p>
        </div>
        <div class="article-grid">${sectionCards}</div>
      </div>
      <aside>
        <section class="trend-box">
          <h2>Đang được tìm</h2>
          <ol>${trendCards}</ol>
        </section>
        <section class="seo-box">
          <h2>Vì sao khác KhoPhim?</h2>
          <p>MHoPhim không tạo player, không tạo bản sao trang phim và không dùng sitemap phim của KhoPhim. Đây là lớp nội dung review, lịch chiếu và hướng dẫn tìm phim.</p>
          <div class="seo-tags"><span>review phim</span><span>lịch chiếu</span><span>top phim</span><span>gợi ý xem</span></div>
        </section>
      </aside>
    </div>

    <section class="final-cta">
      <div>
        <h2>Muốn xem phim ngay?</h2>
        <p>Đọc gợi ý trên MHoPhim, sau đó mở KhoPhim để xem phim, tập mới và player ổn định trên domain chính.</p>
      </div>
      <a class="cta" href="${KHOPHIM_URL}">Mở KhoPhim</a>
    </section>
  </main>
  <footer>
    MHoPhim là trang tin phim và gợi ý xem phim. Trang xem phim chính thức nằm tại <a href="${KHOPHIM_URL}">khophim.org</a>.
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
Disallow: /xem-phim/
Disallow: /search
Disallow: /filter
Disallow: /api/

Sitemap: ${MHOPHIM_URL}/sitemap.xml
`;
}

function renderNotFound() {
  return renderPage({
    path: '/404',
    title: 'Khong tim thay trang - MHoPhim',
    description: 'Trang MHoPhim nay khong ton tai.',
    heading: 'Khong tim thay trang',
    eyebrow: '404',
    intro: 'Noi dung nay khong ton tai tren MHoPhim. Hay quay lai trang chu hoac mo KhoPhim de tim phim.',
    sections: [{ heading: 'Goi y', body: 'Neu ban dang tim phim de xem, hay tim truc tiep tren khophim.org.' }],
    cta: { label: 'Ve trang chu MHoPhim', href: '/' },
  });
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
