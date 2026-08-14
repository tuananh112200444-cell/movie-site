import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { verifyAdminRequest } from '../_shared/admin-session.ts';
const PROPERTY_URI = 'sc-domain:khophim.org';
const SITE_URL = 'https://khophim.org';
const CANONICAL_SITEMAP = `${SITE_URL}/sitemap.xml`;
const GA_PROPERTY_ID = '541432210';
// URL Inspection is a monitoring task, not a viewer-facing dependency.  Keep
// it bounded so one slow Google response cannot leave the daily SEO run open
// indefinitely and hide current coverage data from the operations dashboard.
const INSPECTION_CONCURRENCY = 5;
const INSPECTION_TIMEOUT_MS = 12_000;
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/analytics.readonly'
].join(' ');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
function cors(origin) {
  const allowed = [
    'https://khophim.org',
    'https://www.khophim.org',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret'
  };
}
function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
function base64Url(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes)binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemBytes(pem) {
  const normalized = pem.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char)=>char.charCodeAt(0));
}
async function googleAccessToken() {
  const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') || '';
  const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
  if (!email || !privateKey) throw new Error('Google service account secrets are missing');
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT'
  }));
  const payload = base64Url(JSON.stringify({
    iss: email,
    scope: GOOGLE_SCOPES,
    aud: TOKEN_URL,
    iat: now - 30,
    exp: now + 3300
  }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(privateKey), {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256'
  }, false, [
    'sign'
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)));
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth ${response.status}: ${data.error_description || data.error || 'token unavailable'}`);
  return String(data.access_token);
}
function isoDate(daysAgo) {
  const date = new Date(Date.now() - daysAgo * 86400000);
  return date.toISOString().slice(0, 10);
}
async function searchAnalytics(token, dimension) {
  const startDate = isoDate(31);
  const endDate = isoDate(3);
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY_URI)}/searchAnalytics/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: [
        dimension
      ],
      rowLimit: 2500,
      dataState: 'final'
    }),
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Search Analytics ${response.status}: ${data.error?.message || 'request failed'}`);
  return {
    startDate,
    endDate,
    rows: Array.isArray(data.rows) ? data.rows : []
  };
}
function previousCalendarMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}
async function ga4Report(token, dimension) {
  const { startDate, endDate } = previousCalendarMonth();
  const body = {
    dateRanges: [
      {
        startDate,
        endDate
      }
    ],
    metrics: [
      {
        name: 'screenPageViews'
      },
      {
        name: 'sessions'
      },
      {
        name: 'activeUsers'
      },
      {
        name: 'engagedSessions'
      }
    ],
    limit: dimension ? 100 : 1
  };
  if (dimension) body.dimensions = [
    {
      name: dimension
    }
  ];
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`GA4 ${response.status}: ${data.error?.message || 'request failed'}`);
  return {
    startDate,
    endDate,
    dimension: dimension || 'total',
    rows: Array.isArray(data.rows) ? data.rows : []
  };
}
async function ensureCanonicalSitemap(token, forceSubmit = false) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY_URI)}/sitemaps`;
  const listResponse = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(15000)
  });
  const listData = await listResponse.json();
  if (!listResponse.ok) throw new Error(`Sitemap list ${listResponse.status}: ${listData.error?.message || 'request failed'}`);
  const sitemaps = Array.isArray(listData.sitemap) ? listData.sitemap : [];
  const present = sitemaps.some((item)=>String(item.path || '') === CANONICAL_SITEMAP);
  if (present && !forceSubmit) return {
    present: true,
    submitted: false,
    registered: sitemaps.length
  };
  const submitResponse = await fetch(`${endpoint}/${encodeURIComponent(CANONICAL_SITEMAP)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!submitResponse.ok) {
    const submitData = await submitResponse.json().catch(()=>({}));
    throw new Error(`Sitemap submit ${submitResponse.status}: ${submitData.error?.message || 'request failed'}`);
  }
  return {
    present: true,
    submitted: true,
    registered: sitemaps.length + 1
  };
}
function inspectionDiagnosis(result) {
  const verdict = String(result.verdict || 'UNKNOWN');
  const coverage = String(result.coverageState || '');
  const fetchState = String(result.pageFetchState || '');
  const robots = String(result.robotsTxtState || '');
  if (/BLOCKED|DISALLOWED/i.test(robots)) return {
    recommendation: 'robots_blocked',
    priority: 100
  };
  if (/SOFT_404|BLOCKED|NOT_FOUND|ACCESS_DENIED|SERVER_ERROR|REDIRECT_ERROR|INTERNAL_CRAWL_ERROR|INVALID_URL/i.test(fetchState)) {
    return {
      recommendation: 'fix_fetch_error',
      priority: 95
    };
  }
  if (/duplicate/i.test(coverage)) return {
    recommendation: 'review_canonical_duplicate',
    priority: 80
  };
  if (/discovered.*not indexed|phát hiện.*chưa được lập chỉ mục/i.test(coverage)) return {
    recommendation: 'strengthen_internal_links_and_content',
    priority: 75
  };
  if (/crawled.*not indexed|thu thập dữ liệu.*chưa được lập chỉ mục/i.test(coverage)) return {
    recommendation: 'improve_original_content',
    priority: 85
  };
  if (verdict === 'PASS') return {
    recommendation: 'healthy',
    priority: 0
  };
  return {
    recommendation: 'monitor_and_reinspect',
    priority: 50
  };
}
async function inspectUrl(token, candidate) {
  const inspectionUrl = `${SITE_URL}/phim/${encodeURIComponent(candidate.slug)}`;
  const response = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inspectionUrl,
      siteUrl: PROPERTY_URI,
      languageCode: 'vi-VN'
    }),
    signal: AbortSignal.timeout(INSPECTION_TIMEOUT_MS)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`URL Inspection ${response.status}: ${data.error?.message || inspectionUrl}`);
  const result = data.inspectionResult?.indexStatusResult || {};
  const diagnosis = inspectionDiagnosis(result);
  return {
    url: inspectionUrl,
    movie_id: candidate.id,
    slug: candidate.slug,
    verdict: result.verdict || null,
    coverage_state: result.coverageState || null,
    indexing_state: result.indexingState || null,
    robots_txt_state: result.robotsTxtState || null,
    page_fetch_state: result.pageFetchState || null,
    user_canonical: result.userCanonical || null,
    google_canonical: result.googleCanonical || null,
    last_crawl_time: result.lastCrawlTime || null,
    referring_urls: result.referringUrls || [],
    inspected_at: new Date().toISOString(),
    recommendation: diagnosis.recommendation,
    priority: diagnosis.priority,
    raw_result: data.inspectionResult || {}
  };
}
async function inspectCandidates(token, candidates) {
  const inspections = [];
  const inspectionErrors = [];
  let cursor = 0;
  let stop = false;
  const worker = async ()=>{
    while(!stop){
      const candidate = candidates[cursor];
      cursor += 1;
      if (!candidate) return;
      try {
        inspections.push(await inspectUrl(token, candidate));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        inspectionErrors.push(message);
        // Stop dispatching after an API quota or credential failure. Other
        // candidates must wait for the next daily run rather than multiplying
        // a known failure.
        if (/429|403|disabled/i.test(message)) stop = true;
      }
    }
  };
  await Promise.all(Array.from({
    length: Math.min(INSPECTION_CONCURRENCY, candidates.length)
  }, ()=>worker()));
  return {
    inspections,
    inspectionErrors
  };
}
function normalizedQuery(value) {
  return value.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}
function queryClass(value) {
  const query = normalizedQuery(value);
  if (/kho[ ._-]*phim|khophim|khopim|khphim|khohim|khophom|khophum/.test(query)) return 'khophim_brand';
  if (/mho[ ._-]*phim|mhophim|mhop|mhphim|hophim/.test(query)) return 'legacy_brand';
  if (/xem phim|phim online|phim vietsub|phim mới|phim moi|phim bộ|phim bo|phim lẻ|phim le|phim chiếu rạp|phim chieu rap|anime|hoạt hình|hoat hinh/.test(query)) return 'generic_movie';
  return 'other';
}
async function dashboard(supabase) {
  const { data: run } = await supabase.from('seo_gsc_runs').select('*').order('started_at', {
    ascending: false
  }).limit(1).maybeSingle();
  const runId = run?.id;
  const [{ data: inspections }, { data: pages }, { data: queries }] = await Promise.all([
    supabase.from('seo_url_inspections').select('url,slug,verdict,coverage_state,indexing_state,page_fetch_state,last_crawl_time,inspected_at,recommendation,priority').order('priority', {
      ascending: false
    }).order('inspected_at', {
      ascending: false
    }).limit(50),
    supabase.from('seo_search_metrics').select('dimension_value,clicks,impressions,ctr,position,collected_at').eq('run_id', runId).eq('dimension_type', 'page').order('impressions', {
      ascending: false
    }).limit(25),
    supabase.from('seo_search_metrics').select('dimension_value,clicks,impressions,ctr,position,collected_at').eq('run_id', runId).eq('dimension_type', 'query').order('impressions', {
      ascending: false
    }).limit(2500)
  ]);
  const queryVisibility = {};
  for (const item of queries || []){
    const category = queryClass(String(item.dimension_value || ''));
    const summary = queryVisibility[category] || {
      queries: 0,
      clicks: 0,
      impressions: 0
    };
    summary.queries += 1;
    summary.clicks += Number(item.clicks || 0);
    summary.impressions += Number(item.impressions || 0);
    queryVisibility[category] = summary;
  }
  return {
    latest_run: run || null,
    inspections: inspections || [],
    top_pages: pages || [],
    top_queries: (queries || []).slice(0, 25),
    query_visibility: queryVisibility
  };
}
Deno.serve(async (req)=>{
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers
  });
  const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', {
    auth: {
      persistSession: false
    }
  });
  if (req.method === 'GET') {
    if (!await verifyAdminRequest(req)) return json({
      error: 'Unauthorized'
    }, 401, headers);
    return json({
      ok: true,
      ...await dashboard(supabase)
    }, 200, headers);
  }
  if (req.method !== 'POST') return json({
    error: 'Method not allowed'
  }, 405, headers);
  if (!Deno.env.get('CRON_SECRET') || req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({
    error: 'Unauthorized cron'
  }, 401, headers);
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase.from('seo_gsc_runs').insert({
    started_at: startedAt,
    property_uri: PROPERTY_URI
  }).select('id').single();
  if (runError || !run) return json({
    error: runError?.message || 'run insert failed'
  }, 500, headers);
  try {
    const input = await req.json().catch(()=>({}));
    const inspectionLimit = Math.max(1, Math.min(Number(input.inspection_limit || 25), 50));
    const token = await googleAccessToken();
    const [pageResult, queryResult, sitemapResult, gaTotalResult, gaCountryResult, gaDeviceResult] = await Promise.allSettled([
      searchAnalytics(token, 'page'),
      searchAnalytics(token, 'query'),
      ensureCanonicalSitemap(token, input.resubmit_sitemap === true),
      ga4Report(token),
      ga4Report(token, 'country'),
      ga4Report(token, 'deviceCategory')
    ]);
    const analyticsErrors = [
      ...pageResult.status === 'rejected' ? [
        `page: ${pageResult.reason instanceof Error ? pageResult.reason.message : String(pageResult.reason)}`
      ] : [],
      ...queryResult.status === 'rejected' ? [
        `query: ${queryResult.reason instanceof Error ? queryResult.reason.message : String(queryResult.reason)}`
      ] : []
    ];
    const sitemapError = sitemapResult.status === 'rejected' ? sitemapResult.reason instanceof Error ? sitemapResult.reason.message : String(sitemapResult.reason) : '';
    const sitemapStatus = sitemapResult.status === 'fulfilled' ? sitemapResult.value : null;
    const ga4Error = [
      gaTotalResult,
      gaCountryResult,
      gaDeviceResult
    ].filter((result)=>result.status === 'rejected').map((result)=>result.reason instanceof Error ? result.reason.message : String(result.reason)).join(' | ');
    const ga4 = gaTotalResult.status === 'fulfilled' ? {
      total: gaTotalResult.value,
      countries: gaCountryResult.status === 'fulfilled' ? gaCountryResult.value : null,
      devices: gaDeviceResult.status === 'fulfilled' ? gaDeviceResult.value : null
    } : null;
    const fallbackRange = {
      startDate: isoDate(31),
      endDate: isoDate(3),
      rows: []
    };
    const pageData = pageResult.status === 'fulfilled' ? pageResult.value : fallbackRange;
    const queryData = queryResult.status === 'fulfilled' ? queryResult.value : fallbackRange;
    const metrics = [
      ...pageData.rows.map((row)=>({
          run_id: run.id,
          dimension_type: 'page',
          dimension_value: String(row.keys?.[0] || ''),
          date_start: pageData.startDate,
          date_end: pageData.endDate,
          clicks: Number(row.clicks || 0),
          impressions: Number(row.impressions || 0),
          ctr: Number(row.ctr || 0),
          position: Number(row.position || 0)
        })),
      ...queryData.rows.map((row)=>({
          run_id: run.id,
          dimension_type: 'query',
          dimension_value: String(row.keys?.[0] || ''),
          date_start: queryData.startDate,
          date_end: queryData.endDate,
          clicks: Number(row.clicks || 0),
          impressions: Number(row.impressions || 0),
          ctr: Number(row.ctr || 0),
          position: Number(row.position || 0)
        }))
    ].filter((row)=>row.dimension_value);
    if (metrics.length) {
      const { error } = await supabase.from('seo_search_metrics').insert(metrics);
      if (error) throw error;
    }
    const staleBefore = Date.now() - 72 * 3600000;
    const [{ data: eligible, error: candidateError }, { data: known, error: knownError }] = await Promise.all([
      supabase.from('movie_seo_quality_status').select('movie_id,slug,movie_updated_at,index_tier,quality_score,freshness_score,last_episode_change_at').eq('eligible_for_index', true).in('index_tier', [
        'ongoing',
        'upcoming',
        'playable'
      ]).order('quality_score', {
        ascending: false
      }).order('movie_updated_at', {
        ascending: false
      }).limit(1500),
      supabase.from('seo_url_inspections').select('url,inspected_at').order('inspected_at', {
        ascending: true
      }).limit(5000)
    ]);
    if (candidateError) throw candidateError;
    if (knownError) throw knownError;
    const inspectedAt = new Map((known || []).map((item)=>[
        String(item.url),
        Date.parse(String(item.inspected_at || '')) || 0
      ]));
    const candidateRows = (eligible || []).map((item)=>({
        id: String(item.movie_id),
        slug: String(item.slug),
        tier: String(item.index_tier || ''),
        score: Number(item.quality_score || 0),
        freshness: Number(item.freshness_score || 0),
        episodeChangedAt: Date.parse(String(item.last_episode_change_at || '')) || 0,
        updatedAt: Date.parse(String(item.movie_updated_at || '')) || 0
      })).filter((item)=>{
      const lastInspection = inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(item.slug)}`) || 0;
      if (lastInspection < staleBefore) return true;
      return item.tier === 'ongoing' && item.episodeChangedAt > lastInspection;
    }).sort((a, b)=>{
      const lastA = inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(a.slug)}`) || 0;
      const lastB = inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(b.slug)}`) || 0;
      const ongoingChangeA = Number(a.tier === 'ongoing' && a.episodeChangedAt > lastA);
      const ongoingChangeB = Number(b.tier === 'ongoing' && b.episodeChangedAt > lastB);
      if (ongoingChangeA !== ongoingChangeB) return ongoingChangeB - ongoingChangeA;
      const tierWeight = (item)=>item.tier === 'ongoing' ? 3 : item.tier === 'upcoming' ? 2 : 1;
      const tierDiff = tierWeight(b) - tierWeight(a);
      if (tierDiff !== 0) return tierDiff;
      const inspectedDiff = (inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(a.slug)}`) || 0) - (inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(b.slug)}`) || 0);
      if (inspectedDiff !== 0) return inspectedDiff;
      return b.freshness - a.freshness || b.score - a.score || b.updatedAt - a.updatedAt;
    }).slice(0, inspectionLimit);
    const { inspections, inspectionErrors } = await inspectCandidates(token, candidateRows);
    if (inspections.length) {
      const { error } = await supabase.from('seo_url_inspections').upsert(inspections, {
        onConflict: 'url'
      });
      if (error) throw error;
    }
    const indexed = inspections.filter((item)=>item.verdict === 'PASS').length;
    const success = (analyticsErrors.length < 2 || inspections.length > 0) && !sitemapError;
    const operationalErrors = [
      ...analyticsErrors,
      ...sitemapError ? [
        `sitemap: ${sitemapError}`
      ] : [],
      ...inspectionErrors
    ].slice(0, 10);
    await supabase.from('seo_gsc_runs').update({
      finished_at: new Date().toISOString(),
      success,
      pages_collected: pageData.rows.length,
      queries_collected: queryData.rows.length,
      urls_inspected: inspections.length,
      indexed_urls: indexed,
      error_message: success ? null : operationalErrors.join(' | '),
      metadata: {
        analytics_errors: analyticsErrors.slice(0, 4),
        sitemap: sitemapStatus,
        sitemap_error: sitemapError || null,
        ga4,
        ga4_error: ga4Error || null,
        inspection_errors: inspectionErrors.slice(0, 10),
        date_start: pageData.startDate,
        date_end: pageData.endDate
      }
    }).eq('id', run.id);
    return json({
      ok: success,
      run_id: run.id,
      pages: pageData.rows.length,
      queries: queryData.rows.length,
      inspected: inspections.length,
      indexed,
      sitemap: sitemapStatus,
      sitemap_error: sitemapError || null,
      ga4,
      ga4_error: ga4Error || null,
      analytics_errors: analyticsErrors.slice(0, 4),
      inspection_errors: inspectionErrors.slice(0, 10)
    }, success ? 200 : 502, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from('seo_gsc_runs').update({
      finished_at: new Date().toISOString(),
      success: false,
      error_message: message
    }).eq('id', run.id);
    return json({
      ok: false,
      error: message,
      run_id: run.id
    }, 502, headers);
  }
});
