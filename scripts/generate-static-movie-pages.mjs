import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SITE_URL = 'https://khophim.org';
const DEFAULT_SUPABASE_URL = 'https://ceoxbhsdodllziyxmbqr.supabase.co';
const PAGE_LIMIT = Math.min(18_000, Math.max(1, Number(process.env.STATIC_MOVIE_PAGE_LIMIT || 18_000)));
const API_PAGE_SIZE = 500;
const SITEMAP_CHUNK_SIZE = 4_500;
const MAX_PAGES_FILE_COUNT = 20_000;
const MIN_EXPECTED_INDEXABLE_MOVIES = 100;
const UPCOMING_PAGE_LIMIT = 20;
const MIN_EXPECTED_UPCOMING_MOVIES = 5;
const BUILD_CACHE_BUSTER = Date.now().toString(36);

function profileReadyForStaticBuild(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return profile.status === 'published'
    && profile.index_mode === 'index'
    && Number(profile.validation_score || 0) >= 85;
}

async function loadDotEnv() {
  const text = await readFile('.env', 'utf8').catch(() => '');
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, max) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 3);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.65 ? cut.slice(0, space) : cut}...`;
}

function normalizeImage(value) {
  const raw = String(value || '').trim();
  if (!raw) return `${SITE_URL}/images/movie-poster-fallback.svg`;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'https://');
  return `https://img.ophim.live/uploads/movies/${raw.replace(/^\/+/, '')}`;
}

function taxonomyNames(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item === 'string' ? item : item?.name)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function taxonomyLinks(value, kind) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item === 'string' ? { name: item, slug: '' } : item)
    .filter((item) => item?.name)
    .slice(0, 5)
    .map((item) => {
      const slug = String(item.slug || '').trim();
      const href = kind === 'genre'
        ? `/the-loai/${encodeURIComponent(slug)}`
        : `/filter?country=${encodeURIComponent(slug)}`;
      return slug
        ? `<a href="${href}">${escapeHtml(item.name)}</a>`
        : `<span>${escapeHtml(item.name)}</span>`;
    })
    .join(' · ');
}

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function staticBootstrapJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function movieDetailFromStaticMovie(movie, canonicalSlug) {
  return {
    status: true,
    movie: {
      _id: String(movie._id || movie.id || ''),
      name: stripHtml(movie.name || movie.title_vi || movie.origin_name || canonicalSlug.replace(/-/g, ' ')),
      slug: canonicalSlug,
      origin_name: stripHtml(movie.origin_name || movie.title_original || movie.title_en || ''),
      content: String(movie.content || ''),
      type: String(movie.type || 'single'),
      status: String(movie.status || 'completed'),
      thumb_url: normalizeImage(movie.thumb_url || movie.poster_url),
      poster_url: normalizeImage(movie.poster_url || movie.thumb_url),
      hero_backdrop_url: String(movie.hero_backdrop_url || ''),
      hero_poster_url: String(movie.hero_poster_url || ''),
      is_copyright: Boolean(movie.is_copyright),
      sub_docquyen: Boolean(movie.sub_docquyen),
      chieurap: Boolean(movie.chieurap),
      trailer_url: String(movie.trailer_url || ''),
      time: String(movie.time || ''),
      episode_current: String(movie.episode_current || ''),
      episode_total: String(movie.episode_total || ''),
      current_episode: Number(movie.current_episode || 0) || undefined,
      total_episodes: Number(movie.total_episodes || 0) || undefined,
      schedule_type: String(movie.schedule_type || ''),
      release_time: String(movie.release_time || ''),
      release_day: Number(movie.release_day || 0) || undefined,
      schedule_timezone: String(movie.schedule_timezone || ''),
      quality: String(movie.quality || 'HD'),
      lang: String(movie.lang || ''),
      notify: String(movie.notify || ''),
      showtimes: String(movie.showtimes || ''),
      release_at: String(movie.release_at || ''),
      next_episode_at: String(movie.next_episode_at || ''),
      next_episode_name: String(movie.next_episode_name || ''),
      schedule_note: String(movie.schedule_note || ''),
      year: Number(movie.year || 0),
      view: Number(movie.view || 0),
      actor: (Array.isArray(movie.actor) ? movie.actor : []).map(stripHtml).filter(Boolean),
      director: (Array.isArray(movie.director) ? movie.director : []).map(stripHtml).filter(Boolean),
      category: Array.isArray(movie.category) ? movie.category : [],
      country: Array.isArray(movie.country) ? movie.country : [],
      title_vi: String(movie.title_vi || ''),
      title_en: String(movie.title_en || ''),
      title_zh: String(movie.title_zh || ''),
      title_original: String(movie.title_original || ''),
      normalized_name: String(movie.normalized_name || ''),
      ophim_id: String(movie.ophim_id || ''),
      source_site: String(movie.source_site || ''),
      source_name: String(movie.source_name || ''),
      modified: { time: String(movie.updated_at || movie.modified?.time || new Date().toISOString()) },
    },
    episodes: [],
  };
}

function assetTagsFromIndex(indexHtml) {
  const tags = [];
  const patterns = [
    /<script\b[^>]*type=["']module["'][^>]*src=["'][^"']+["'][^>]*><\/script>/gi,
    /<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi,
    /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi,
    /<link\b[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon|manifest|preload)["'][^>]*>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of indexHtml.matchAll(pattern)) tags.push(match[0]);
  }
  return [...new Set(tags)].join('\n    ');
}

function movieDescription(movie) {
  const profileDescription = stripHtml(movie?.seo_profile?.meta_description || '');
  if (profileDescription) return truncate(profileDescription, 160);
  const content = stripHtml(movie.content);
  if (movie.seo_index_tier === 'upcoming') {
    return truncate([
      `Trailer và thông tin phim sắp chiếu ${movie.name}`,
      movie.origin_name && movie.origin_name !== movie.name ? `(${movie.origin_name})` : '',
      movie.year ? `dự kiến phát hành năm ${movie.year}.` : '.',
      content,
    ].filter(Boolean).join(' '), 155);
  }
  if (content.length >= 90) return truncate(content, 155);
  const parts = [
    `Xem thông tin và các tập đang có của ${movie.name}`,
    movie.origin_name && movie.origin_name !== movie.name ? `(${movie.origin_name})` : '',
    movie.year ? `phát hành năm ${movie.year}` : '',
    movie.lang ? `bản ${movie.lang}` : '',
    'trên KhoPhim.',
  ].filter(Boolean);
  return truncate(parts.join(' '), 155);
}

function renderMoviePage(movie, assetTags, options = {}) {
  const slug = String(options.canonicalSlug || movie.slug || '').trim();
  const sourceSlug = String(options.sourceSlug || movie.slug || slug).trim();
  const indexable = options.indexable !== false;
  const profile = movie.seo_profile && typeof movie.seo_profile === 'object' ? movie.seo_profile : null;
  const profileVersion = String(profile?.version || profile?.updated_at || '');
  const canonicalPath = String(profile?.canonical_path || `/phim/${slug}`);
  const canonical = `${SITE_URL}${canonicalPath === `/phim/${slug}` ? canonicalPath : `/phim/${encodeURIComponent(slug)}`}`;
  const name = stripHtml(movie.name || movie.title_vi || movie.origin_name || slug.replace(/-/g, ' '));
  const originName = stripHtml(movie.origin_name || movie.title_original || movie.title_en || '');
  const isUpcoming = movie.seo_index_tier === 'upcoming';
  // An editorial information page can be available before any verified video
  // source. Do not claim a WatchAction or link to a dead player in static HTML.
  const canAdvertiseWatch = !profile && !isUpcoming;
  const title = truncate(stripHtml(profile?.seo_title || '') || (isUpcoming
    ? `${name}${movie.year ? ` (${movie.year})` : ''} - Trailer & Thông Tin | KhoPhim`
    : `${name}${movie.year ? ` (${movie.year})` : ''} - Xem phim ${movie.lang || movie.quality || 'HD'} | KhoPhim`), 68);
  const description = movieDescription({ ...movie, name, origin_name: originName });
  const poster = normalizeImage(profile?.og_image_url || movie.poster_url || movie.thumb_url);
  const genres = taxonomyNames(movie.category);
  const countries = taxonomyNames(movie.country);
  const actors = (Array.isArray(movie.actor) ? movie.actor : []).map(stripHtml).filter(Boolean).slice(0, 12);
  const directors = (Array.isArray(movie.director) ? movie.director : []).map(stripHtml).filter(Boolean).slice(0, 6);
  const content = stripHtml(movie.content);
  const introContent = stripHtml(profile?.intro_content || '');
  const reviewContent = stripHtml(profile?.review_content || '');
  const updatedAt = String(movie.updated_at || new Date().toISOString());
  const watchUrl = `${SITE_URL}/xem-phim/${encodeURIComponent(slug)}`;
  const trailerEmbed = trailerEmbedUrl(movie.trailer_url);
  const bootstrap = {
    version: 'v1',
    canonical_slug: slug,
    source_slug: sourceSlug,
    indexable,
    generated_at: new Date().toISOString(),
    detail: movieDetailFromStaticMovie(movie, slug),
    seo_profile: profile ? {
      movie_id: String(profile.movie_id || movie.id || movie._id || ''),
      slug,
      focus_keyword: String(profile.focus_keyword || ''),
      secondary_keywords: Array.isArray(profile.secondary_keywords) ? profile.secondary_keywords : [],
      seo_title: String(profile.seo_title || title),
      meta_description: String(profile.meta_description || description),
      canonical_path: canonicalPath,
      og_image_url: String(profile.og_image_url || poster),
      index_mode: String(profile.index_mode || (indexable ? 'index' : 'noindex')),
      intro_content: introContent,
      review_content: reviewContent,
      faq: Array.isArray(profile.faq) ? profile.faq : [],
      topic_links: Array.isArray(profile.topic_links) ? profile.topic_links : [],
      validation_score: Number(profile.validation_score || 0),
      version: profile.version,
      live_audit: profile.live_audit || null,
      last_audited_at: profile.last_audited_at,
      published_at: profile.published_at,
      updated_at: profile.updated_at,
    } : null,
  };
  const robots = indexable
    ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    : 'noindex, follow';
  const movieSchema = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    '@id': `${canonical}#movie`,
    name,
    alternateName: originName || undefined,
    url: canonical,
    image: poster,
    description,
    datePublished: /^\d{4}-\d{2}-\d{2}/.test(String(movie.release_at || ''))
      ? String(movie.release_at).slice(0, 10)
      : undefined,
    genre: genres,
    countryOfOrigin: countries.map((country) => ({ '@type': 'Country', name: country })),
    actor: actors.map((actor) => ({ '@type': 'Person', name: actor })),
    director: directors.map((director) => ({ '@type': 'Person', name: director })),
    inLanguage: 'vi-VN',
    potentialAction: canAdvertiseWatch ? { '@type': 'WatchAction', target: watchUrl } : undefined,
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'KhoPhim', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name, item: canonical },
    ],
  };
  const faqItems = Array.isArray(profile?.faq) ? profile.faq.filter((item) => item?.question && item?.answer).slice(0, 12) : [];
  const faqSchema = faqItems.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: stripHtml(item.question),
      acceptedAnswer: { '@type': 'Answer', text: stripHtml(item.answer) },
    })),
  } : null;
  const genresHtml = taxonomyLinks(movie.category, 'genre');
  const countriesHtml = taxonomyLinks(movie.country, 'country');
  const facts = [
    isUpcoming && '<span>Sắp chiếu · Có trailer</span>',
    movie.year && `<span>Năm ${escapeHtml(movie.year)}</span>`,
    movie.quality && `<span>${escapeHtml(movie.quality)}</span>`,
    movie.lang && `<span>${escapeHtml(movie.lang)}</span>`,
    canAdvertiseWatch && movie.episode_current && `<span>${escapeHtml(movie.episode_current)}</span>`,
  ].filter(Boolean).join(' · ');
  const topicLinks = (Array.isArray(profile?.topic_links) ? profile.topic_links : [])
    .filter((item) => item?.url && item?.title)
    .slice(0, 12)
    .map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.anchor || item.title)}</a>${item.description ? ` — ${escapeHtml(item.description)}` : ''}</li>`)
    .join('');

  return `<!doctype html>
<html lang="vi" class="notranslate" translate="no">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,viewport-fit=cover">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${robots}">
    <meta name="googlebot" content="${robots}">
    <meta name="kp-static-movie" content="${escapeHtml(slug)}">
    <meta name="kp-static-movie-source" content="${escapeHtml(sourceSlug)}">
    <meta name="kp-static-movie-indexable" content="${indexable ? 'true' : 'false'}">
    <link rel="canonical" href="${canonical}">
    <link rel="preload" as="image" href="${escapeHtml(poster)}" fetchpriority="high">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="video.movie">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${escapeHtml(poster)}">
    <meta property="og:site_name" content="KhoPhim">
    <meta property="og:locale" content="vi_VN">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(poster)}">
    <meta name="last-modified" content="${escapeHtml(updatedAt.slice(0, 10))}">
    <meta name="theme-color" content="#080a10">
    <script type="application/ld+json">${jsonLd([movieSchema, breadcrumbSchema, ...(faqSchema ? [faqSchema] : [])])}</script>
    <script id="kp-static-movie-data" type="application/json">${staticBootstrapJson(bootstrap)}</script>
    ${assetTags}
    <style>html,body{margin:0;background:#080a10;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}#root{min-height:100vh}.kp-static-movie{max-width:980px;margin:auto;padding:36px 20px}.kp-static-movie img{width:180px;max-width:38vw;border-radius:12px;float:left;margin:0 24px 18px 0}.kp-static-movie h1{font-size:30px;line-height:1.2}.kp-static-movie p{color:#c7cbd4;line-height:1.75}.kp-static-movie a{color:#f87171}.kp-static-movie iframe{display:block;width:100%;max-width:720px;height:auto;aspect-ratio:16/9;border:0;border-radius:12px}.kp-static-facts{color:#f0b45c}.kp-static-clear{clear:both}</style>
  </head>
  <body class="notranslate" translate="no">
    <div id="root" class="notranslate" translate="no">
      <main class="kp-static-movie" data-kp-static-movie="${escapeHtml(slug)}" data-kp-static-indexable="${indexable ? 'true' : 'false'}" data-kp-upcoming="${isUpcoming ? 'true' : 'false'}">
        ${profile ? `<span data-kp-seo-profile-version="${escapeHtml(profileVersion || 'published')}" hidden></span>` : ''}
        <img src="${escapeHtml(poster)}" alt="Poster phim ${escapeHtml(name)}" width="360" height="540">
        <h1>${escapeHtml(name)}</h1>
        ${originName ? `<p>${escapeHtml(originName)}</p>` : ''}
        <p class="kp-static-facts">${facts}</p>
        ${content ? `<p>${escapeHtml(content)}</p>` : `<p>${escapeHtml(description)}</p>`}
        ${introContent && introContent !== content ? `<section aria-labelledby="movie-intro-heading"><h2 id="movie-intro-heading">Giới thiệu ${escapeHtml(name)}</h2><p>${escapeHtml(introContent)}</p></section>` : ''}
        ${genresHtml ? `<p>Thể loại: ${genresHtml}</p>` : ''}
        ${countriesHtml ? `<p>Quốc gia: ${countriesHtml}</p>` : ''}
        ${directors.length ? `<p>Đạo diễn: ${escapeHtml(directors.join(', '))}</p>` : ''}
        ${actors.length ? `<p>Diễn viên: ${escapeHtml(actors.join(', '))}</p>` : ''}
        ${isUpcoming && trailerEmbed ? `<section aria-labelledby="movie-trailer-heading"><h2 id="movie-trailer-heading">Trailer ${escapeHtml(name)}</h2><iframe src="${escapeHtml(trailerEmbed)}" title="Trailer ${escapeHtml(name)}" loading="lazy" width="720" height="405" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><p>Nguồn phát đầy đủ chưa có. KhoPhim sẽ cập nhật ngay trên URL này khi phim chính thức phát hành.</p></section>` : ''}
        ${profile && trailerEmbed ? `<section aria-labelledby="movie-trailer-heading"><h2 id="movie-trailer-heading">Trailer ${escapeHtml(name)}</h2><iframe src="${escapeHtml(trailerEmbed)}" title="Trailer ${escapeHtml(name)}" loading="lazy" width="720" height="405" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></section>` : ''}
        ${topicLinks ? `<nav aria-label="Bài viết liên quan"><h2>Khám phá thêm về ${escapeHtml(name)}</h2><ul>${topicLinks}</ul></nav>` : ''}
        ${reviewContent ? `<section aria-labelledby="movie-review-heading"><h2 id="movie-review-heading">Đánh giá ${escapeHtml(name)}</h2><p>${escapeHtml(reviewContent)}</p></section>` : ''}
        ${faqItems.length ? `<section><h2>Câu hỏi thường gặp về ${escapeHtml(name)}</h2>${faqItems.map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`).join('')}</section>` : ''}
        <p>${profile
          ? `Trang thông tin phim ${escapeHtml(name)} đã có trên KhoPhim.`
          : isUpcoming
          ? `<a href="${escapeHtml(movie.trailer_url)}" rel="noopener noreferrer">Xem trailer ${escapeHtml(name)}</a>`
          : `<a href="/xem-phim/${encodeURIComponent(slug)}">Xem ${escapeHtml(name)}</a>`}</p>
        <div class="kp-static-clear"></div>
      </main>
    </div>
  </body>
</html>`;
}

function trailerEmbedUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.replace(/^\/+/, '').split('/')[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else id = url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/)?.[1] || '';
    }
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : '';
  } catch {
    return '';
  }
}

async function fetchCatalog({ cohort = 'playable', pageLimit = PAGE_LIMIT, fallbackFile = 'scripts/static-seo-catalog-fallback.sql' } = {}) {
  const dotEnv = await loadDotEnv();
  const supabaseUrl = String(process.env.VITE_PUBLIC_SUPABASE_URL || dotEnv.VITE_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const publishableKey = String(process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || dotEnv.VITE_PUBLIC_SUPABASE_ANON_KEY || '');
  if (!publishableKey) throw new Error('Missing VITE_PUBLIC_SUPABASE_ANON_KEY for static SEO generation.');
  const items = [];
  const seen = new Set();
  const seenContent = new Set();
  const requestPageSize = Math.min(API_PAGE_SIZE, pageLimit);
  let expectedProfileCount = null;

  let edgeUnavailable = false;
  for (let offset = 0; items.length < pageLimit; offset += requestPageSize) {
    const url = new URL(`${supabaseUrl}/functions/v1/static-seo-catalog`);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(requestPageSize));
    if (cohort !== 'playable') url.searchParams.set('cohort', cohort);
    // A release must see movies that have just passed the SEO quality gate;
    // do not reuse the edge's stale catalogue snapshot from an earlier build.
    url.searchParams.set('build', BUILD_CACHE_BUSTER);
    let response;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      response = await fetch(url, {
        headers: { Accept: 'application/json', apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (response?.ok) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
    if (!response?.ok) {
      edgeUnavailable = true;
      break;
    }
    const payload = await response.json();
    if (payload.cohort !== cohort) {
      edgeUnavailable = true;
      break;
    }
    const rows = Array.isArray(payload.items) ? payload.items : [];
    if (cohort === 'profiles' && Number.isInteger(payload.total_profiles)) {
      expectedProfileCount = payload.total_profiles;
    }
    for (const movie of rows) {
      const slug = String(movie?.slug || '').trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || seen.has(slug)) continue;
      const contentFingerprint = stripHtml(movie?.seo_profile?.intro_content || movie?.content || '')
        .toLocaleLowerCase('vi-VN');
      if (!contentFingerprint || (cohort !== 'profiles' && seenContent.has(contentFingerprint))) continue;
      seen.add(slug);
      seenContent.add(contentFingerprint);
      items.push(movie);
      if (items.length >= pageLimit) break;
    }
    console.log(`[static-seo] fetched ${items.length}/${pageLimit} ${cohort} movies`);
    if (payload.has_more === false) break;
  }
  if (!edgeUnavailable) {
    if (cohort === 'profiles' && expectedProfileCount !== null && items.length !== expectedProfileCount) {
      throw new Error(`Approved SEO profile mismatch: source ${expectedProfileCount}, static catalogue ${items.length}.`);
    }
    return items;
  }

  console.warn('[static-seo] Edge catalogue unavailable; reading the linked database without changing it.');
  try {
    const cliArgs = [
      'supabase', 'db', 'query', '--linked', '--output', 'json',
      '--file', fallbackFile,
    ];
    const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npx.cmd', ...cliArgs] : cliArgs;
    const output = execFileSync(executable, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Supabase CLI returned no JSON result.');
    const payload = JSON.parse(output.slice(start, end + 1));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const fallbackProfileCount = cohort === 'profiles'
      ? Number(rows[0]?.seo_profile_total ?? rows.length)
      : null;
    const deduplicated = [];
    const fallbackSeen = new Set();
    const fallbackSeenContent = new Set();
    for (const movie of rows) {
      const slug = String(movie?.slug || '').trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || fallbackSeen.has(slug)) continue;
      const contentFingerprint = stripHtml(movie?.seo_profile?.intro_content || movie?.content || '')
        .toLocaleLowerCase('vi-VN');
      if (!contentFingerprint || (cohort !== 'profiles' && fallbackSeenContent.has(contentFingerprint))) continue;
      fallbackSeen.add(slug);
      fallbackSeenContent.add(contentFingerprint);
      deduplicated.push(movie);
      if (deduplicated.length >= pageLimit) break;
    }
    console.log(`[static-seo] linked database returned ${deduplicated.length} ${cohort} movies`);
    if (cohort === 'profiles' && deduplicated.length !== fallbackProfileCount) {
      throw new Error(`Approved SEO profile mismatch: linked database ${fallbackProfileCount}, static catalogue ${deduplicated.length}.`);
    }
    return deduplicated;
  } catch (error) {
    throw new Error(`static-seo-catalog and linked database fallback both failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeInBatches(tasks, size = 64) {
  for (let index = 0; index < tasks.length; index += size) {
    await Promise.all(tasks.slice(index, index + size).map((task) => task()));
  }
}

function sitemapXml(movies) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${movies.map((movie) => {
    const slug = encodeURIComponent(movie.slug);
    const image = normalizeImage(movie.poster_url || movie.thumb_url);
    const lastmod = String(movie.updated_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    return `  <url><loc>${SITE_URL}/phim/${slug}</loc><lastmod>${escapeXml(lastmod)}</lastmod><image:image><image:loc>${escapeXml(image)}</image:loc><image:title>${escapeXml(movie.name)}</image:title></image:image></url>`;
  }).join('\n')}
</urlset>`;
}

async function countFiles(directory) {
  let count = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) count += await countFiles(path.join(directory, entry.name));
    else count += 1;
  }
  return count;
}

const indexHtml = await readFile('out/index.html', 'utf8');
const assetTags = assetTagsFromIndex(indexHtml);
if (!/type=["']module["']/.test(assetTags) || !/rel=["']stylesheet["']/.test(assetTags)) {
  throw new Error('Built index is missing entry script or stylesheet tags.');
}

const catalogueMovies = await fetchCatalog();
const profileMovies = await fetchCatalog({
  cohort: 'profiles',
  pageLimit: Math.min(PAGE_LIMIT, 8_000),
  fallbackFile: 'scripts/static-seo-profile-catalog-fallback.sql',
});
for (const movie of profileMovies) {
  const profile = movie?.seo_profile;
  if (!profileReadyForStaticBuild(profile)) {
    throw new Error(`Approved SEO profile is incomplete in the static catalogue: ${String(movie?.slug || '(missing slug)')}.`);
  }
  const canonicalSlug = String(movie?.slug || '');
  if (String(profile?.canonical_path || '') !== `/phim/${canonicalSlug}`) {
    throw new Error(`Approved SEO profile has a mismatched canonical: ${canonicalSlug}.`);
  }
  if (!stripHtml(movie?.content || '') || !String(profile?.og_image_url || movie?.poster_url || movie?.thumb_url || '').trim()) {
    throw new Error(`Approved SEO profile lacks indexable content or image: ${canonicalSlug}.`);
  }
}
const movies = Array.from(new Map(
  [...catalogueMovies, ...profileMovies].map((movie) => [String(movie.slug || ''), movie]),
).values()).filter((movie) => movie?.slug);
const rawUpcomingMovies = await fetchCatalog({
  cohort: 'upcoming',
  pageLimit: UPCOMING_PAGE_LIMIT,
  fallbackFile: 'scripts/static-upcoming-seo-catalog-fallback.sql',
});
if (movies.length < Math.min(MIN_EXPECTED_INDEXABLE_MOVIES, PAGE_LIMIT)) {
  throw new Error(`Only ${movies.length} eligible movies returned; refusing an incomplete static SEO release.`);
}
if (rawUpcomingMovies.length < MIN_EXPECTED_UPCOMING_MOVIES) {
  throw new Error(`Only ${rawUpcomingMovies.length} upcoming trailer movies returned; refusing to publish a weak upcoming cohort.`);
}

const aliases = JSON.parse(await readFile('src/data/movieCanonicalAliases.json', 'utf8'));
const canonicalSlugFor = (slug) => String(aliases[String(slug || '').trim()] || slug || '').trim();
const sourceSlugByCanonical = new Map(
  Object.entries(aliases).map(([sourceSlug, canonicalSlug]) => [String(canonicalSlug), String(sourceSlug)]),
);
const regularCanonicalSlugs = new Set(movies.map((movie) => canonicalSlugFor(movie.slug)).filter(Boolean));
const upcomingMovies = rawUpcomingMovies.filter((movie) => !regularCanonicalSlugs.has(canonicalSlugFor(movie.slug)));
if (upcomingMovies.length < MIN_EXPECTED_UPCOMING_MOVIES) {
  throw new Error(`Only ${upcomingMovies.length} distinct upcoming trailer movies remain after canonical deduplication.`);
}
const indexableMovies = [...movies, ...upcomingMovies];
const indexableByCanonical = new Map();
for (const movie of indexableMovies) {
  const canonicalSlug = canonicalSlugFor(movie.slug);
  if (canonicalSlug) indexableByCanonical.set(canonicalSlug, movie);
}

const hotPayload = JSON.parse(await readFile('public/api/kkphim-cinema-hot', 'utf8').catch(() => '{"items":[]}'));
const hotMovies = Array.isArray(hotPayload.items) ? hotPayload.items : [];
const homePayload = JSON.parse(await readFile('public/home-fallback.json', 'utf8').catch(() => '{"sections":{}}'));
const homeMovies = Object.values(homePayload.sections && typeof homePayload.sections === 'object' ? homePayload.sections : {})
  .flatMap((items) => Array.isArray(items) ? items : []);
const previewMovies = [];
for (const movie of [...hotMovies, ...homeMovies]) {
  const sourceSlug = String(movie?.slug || '').trim();
  const canonicalSlug = canonicalSlugFor(sourceSlug);
  if (!canonicalSlug || indexableByCanonical.has(canonicalSlug)) continue;
  indexableByCanonical.set(canonicalSlug, movie);
  previewMovies.push({ movie, canonicalSlug, sourceSlug });
}

const pageDefinitions = [
  ...indexableMovies.map((movie) => {
    const canonicalSlug = canonicalSlugFor(movie.slug);
    return {
      movie,
      canonicalSlug,
      sourceSlug: sourceSlugByCanonical.get(canonicalSlug) || String(movie.slug || canonicalSlug),
      indexable: true,
    };
  }),
  ...previewMovies.map((entry) => ({ ...entry, indexable: false })),
];

await mkdir(path.join('out', 'phim'), { recursive: true });
await mkdir(path.join('out', 'movie-data'), { recursive: true });
await writeInBatches(pageDefinitions.map(({ movie, canonicalSlug, sourceSlug, indexable }) => async () => {
  // Cloudflare Pages serves /phim/slug cleanly from /phim/slug.html. Using
  // /phim/slug/index.html forces a trailing-slash redirect that conflicts with
  // the canonical and with every existing internal movie link.
  await Promise.all([
    writeFile(
      path.join('out', 'phim', `${canonicalSlug}.html`),
      renderMoviePage(movie, assetTags, { canonicalSlug, sourceSlug, indexable }),
      'utf8',
    ),
    writeFile(
      path.join('out', 'movie-data', `${canonicalSlug}.json`),
      JSON.stringify({
        version: 'v1',
        canonical_slug: canonicalSlug,
        source_slug: sourceSlug,
        indexable,
        generated_at: new Date().toISOString(),
        detail: movieDetailFromStaticMovie(movie, canonicalSlug),
      }),
      'utf8',
    ),
  ]);
}));

const sitemapFiles = [];
const publicChunkFiles = [];
for (let index = 0; index < movies.length; index += SITEMAP_CHUNK_SIZE) {
  const chunkNumber = Math.floor(index / SITEMAP_CHUNK_SIZE) + 1;
  const fileName = `sitemap-movies-static-${chunkNumber}.xml`;
  const publicFileName = `sitemap-movies-${chunkNumber}.xml`;
  const chunkXml = sitemapXml(movies.slice(index, index + SITEMAP_CHUNK_SIZE));
  await Promise.all([
    writeFile(path.join('out', fileName), chunkXml, 'utf8'),
    // Keep a deployable static alias. The Pages Worker normally serves this
    // route dynamically, but the sitemap must remain valid if edge routing is
    // temporarily unavailable during a deployment transition.
    writeFile(path.join('out', publicFileName), chunkXml, 'utf8'),
  ]);
  sitemapFiles.push(fileName);
  publicChunkFiles.push(publicFileName);
}

const upcomingSitemapFile = 'sitemap-movies-upcoming.xml';
await writeFile(path.join('out', upcomingSitemapFile), sitemapXml(upcomingMovies), 'utf8');

const seoStudioMovies = Array.from(new Map(
  [...movies, ...upcomingMovies]
    .filter((movie) => movie?.seo_profile?.index_mode === 'index'
      && Number(movie?.seo_profile?.validation_score || 0) >= 85
      && profileReadyForStaticBuild(movie?.seo_profile))
    .map((movie) => [String(movie.slug || ''), movie]),
).values()).filter((movie) => movie.slug);
const expectedProfileSlugs = new Set(profileMovies.map((movie) => canonicalSlugFor(movie.slug)));
const sitemapProfileSlugs = new Set(seoStudioMovies.map((movie) => canonicalSlugFor(movie.slug)));
const missingSeoProfiles = [...expectedProfileSlugs].filter((slug) => !sitemapProfileSlugs.has(slug));
if (missingSeoProfiles.length || sitemapProfileSlugs.size !== expectedProfileSlugs.size) {
  throw new Error(`Approved SEO profile parity failed: ${missingSeoProfiles.join(', ') || 'unexpected extra sitemap URLs'}.`);
}
await writeFile(path.join('out', 'sitemap-seo-studio.xml'), sitemapXml(seoStudioMovies), 'utf8');

const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE_URL}/sitemap-movies-recent.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/${upcomingSitemapFile}</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-seo-studio.xml</loc></sitemap>
${publicChunkFiles.map((file) => `  <sitemap><loc>${SITE_URL}/${file}</loc></sitemap>`).join('\n')}
</sitemapindex>`;
await writeFile('out/sitemap-movies.xml', sitemapIndex, 'utf8');

const archiveSitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicChunkFiles.map((file) => `  <sitemap><loc>${SITE_URL}/${file}</loc></sitemap>`).join('\n')}
</sitemapindex>`;
await writeFile('out/sitemap-movies-archive.xml', archiveSitemapIndex, 'utf8');

const rootSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE_URL}/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-seo-landing.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-movies-recent.xml</loc></sitemap>
  <sitemap><loc>${SITE_URL}/${upcomingSitemapFile}</loc></sitemap>
  <sitemap><loc>${SITE_URL}/sitemap-seo-studio.xml</loc></sitemap>
${publicChunkFiles.map((file) => `  <sitemap><loc>${SITE_URL}/${file}</loc></sitemap>`).join('\n')}
</sitemapindex>`;
await writeFile('out/sitemap.xml', rootSitemap, 'utf8');
await writeFile('out/static-movie-pages.json', JSON.stringify({
  generated_at: new Date().toISOString(),
  count: indexableMovies.length,
  playable_count: movies.length,
  upcoming_count: upcomingMovies.length,
  preview_count: previewMovies.length,
  bootstrap_count: pageDefinitions.length,
  limit: PAGE_LIMIT,
  sitemap_files: [...sitemapFiles, upcomingSitemapFile, 'sitemap-seo-studio.xml'],
  seo_studio_count: seoStudioMovies.length,
  first_slug: indexableMovies[0]?.slug,
  last_slug: indexableMovies.at(-1)?.slug,
}, null, 2), 'utf8');

const fileCount = await countFiles('out');
if (fileCount > MAX_PAGES_FILE_COUNT) {
  throw new Error(`Cloudflare Pages file limit exceeded: ${fileCount}/${MAX_PAGES_FILE_COUNT}`);
}
console.log(`[static-seo] generated ${movies.length} playable and ${upcomingMovies.length} upcoming indexable pages, ${previewMovies.length} noindex previews and ${pageDefinitions.length} static bootstraps in ${sitemapFiles.length + 1} sitemaps; deployment files ${fileCount}/${MAX_PAGES_FILE_COUNT}`);
