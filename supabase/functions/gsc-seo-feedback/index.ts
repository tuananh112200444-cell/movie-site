import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { verifyAdminRequest } from '../_shared/admin-session.ts';

const PROPERTY_URI = 'sc-domain:khophim.org';
const SITE_URL = 'https://khophim.org';
const SEARCH_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function cors(origin: string | null): Record<string, string> {
  const allowed = ['https://khophim.org','https://www.khophim.org','http://localhost:4173','http://127.0.0.1:4173','http://localhost:5173','http://127.0.0.1:5173'];
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
  };
}

function json(body: unknown, status: number, headers: Record<string,string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } });
}

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function pemBytes(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function googleAccessToken(): Promise<string> {
  const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') || '';
  const privateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';
  if (!email || !privateKey) throw new Error('Google service account secrets are missing');
  const now = Math.floor(Date.now()/1000);
  const header = base64Url(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const payload = base64Url(JSON.stringify({ iss:email, scope:SEARCH_SCOPE, aud:TOKEN_URL, iat:now-30, exp:now+3300 }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(privateKey), { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)));
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal:AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth ${response.status}: ${data.error_description || data.error || 'token unavailable'}`);
  return String(data.access_token);
}

function isoDate(daysAgo: number): string {
  const date = new Date(Date.now()-daysAgo*86400000);
  return date.toISOString().slice(0,10);
}

async function searchAnalytics(token: string, dimension: 'page'|'query') {
  const startDate = isoDate(31);
  const endDate = isoDate(3);
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY_URI)}/searchAnalytics/query`, {
    method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({ startDate, endDate, dimensions:[dimension], rowLimit:2500, dataState:'final' }),
    signal:AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Search Analytics ${response.status}: ${data.error?.message || 'request failed'}`);
  return { startDate, endDate, rows:Array.isArray(data.rows) ? data.rows : [] };
}

type Candidate = { id:string; slug:string };

function inspectionDiagnosis(result: Record<string,unknown>): { recommendation:string; priority:number } {
  const verdict = String(result.verdict || 'UNKNOWN');
  const coverage = String(result.coverageState || '');
  const fetchState = String(result.pageFetchState || '');
  const robots = String(result.robotsTxtState || '');
  if (robots && robots !== 'ALLOWED') return { recommendation:'robots_blocked', priority:100 };
  if (fetchState && fetchState !== 'SUCCESSFUL') return { recommendation:'fix_fetch_error', priority:95 };
  if (/duplicate/i.test(coverage)) return { recommendation:'review_canonical_duplicate', priority:80 };
  if (/discovered.*not indexed/i.test(coverage)) return { recommendation:'strengthen_internal_links_and_content', priority:75 };
  if (/crawled.*not indexed/i.test(coverage)) return { recommendation:'improve_original_content', priority:85 };
  if (verdict === 'PASS') return { recommendation:'healthy', priority:0 };
  return { recommendation:'monitor_and_reinspect', priority:50 };
}

async function inspectUrl(token:string, candidate:Candidate) {
  const inspectionUrl = `${SITE_URL}/phim/${encodeURIComponent(candidate.slug)}`;
  const response = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({ inspectionUrl, siteUrl:PROPERTY_URI, languageCode:'vi-VN' }),
    signal:AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`URL Inspection ${response.status}: ${data.error?.message || inspectionUrl}`);
  const result = data.inspectionResult?.indexStatusResult || {};
  const diagnosis = inspectionDiagnosis(result);
  return {
    url:inspectionUrl, movie_id:candidate.id, slug:candidate.slug,
    verdict:result.verdict || null, coverage_state:result.coverageState || null,
    indexing_state:result.indexingState || null, robots_txt_state:result.robotsTxtState || null,
    page_fetch_state:result.pageFetchState || null, user_canonical:result.userCanonical || null,
    google_canonical:result.googleCanonical || null, last_crawl_time:result.lastCrawlTime || null,
    referring_urls:result.referringUrls || [], inspected_at:new Date().toISOString(),
    recommendation:diagnosis.recommendation, priority:diagnosis.priority, raw_result:data.inspectionResult || {},
  };
}

async function dashboard(supabase: ReturnType<typeof createClient>) {
  const [{data:run},{data:inspections},{data:pages},{data:queries}] = await Promise.all([
    supabase.from('seo_gsc_runs').select('*').order('started_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('seo_url_inspections').select('url,slug,verdict,coverage_state,indexing_state,page_fetch_state,last_crawl_time,inspected_at,recommendation,priority').order('priority',{ascending:false}).order('inspected_at',{ascending:false}).limit(50),
    supabase.from('seo_search_metrics').select('dimension_value,clicks,impressions,ctr,position,collected_at').eq('dimension_type','page').order('impressions',{ascending:false}).limit(25),
    supabase.from('seo_search_metrics').select('dimension_value,clicks,impressions,ctr,position,collected_at').eq('dimension_type','query').order('impressions',{ascending:false}).limit(25),
  ]);
  return { latest_run:run || null, inspections:inspections || [], top_pages:pages || [], top_queries:queries || [] };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
  const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', {auth:{persistSession:false}});
  if (req.method==='GET') {
    if (!await verifyAdminRequest(req)) return json({error:'Unauthorized'},401,headers);
    return json({ok:true,...await dashboard(supabase)},200,headers);
  }
  if (req.method!=='POST') return json({error:'Method not allowed'},405,headers);
  if (!Deno.env.get('CRON_SECRET') || req.headers.get('x-cron-secret')!==Deno.env.get('CRON_SECRET')) return json({error:'Unauthorized cron'},401,headers);

  const startedAt = new Date().toISOString();
  const {data:run,error:runError} = await supabase.from('seo_gsc_runs').insert({started_at:startedAt,property_uri:PROPERTY_URI}).select('id').single();
  if (runError || !run) return json({error:runError?.message || 'run insert failed'},500,headers);
  try {
    const input = await req.json().catch(()=>({})) as {inspection_limit?:number};
    const inspectionLimit = Math.max(1,Math.min(Number(input.inspection_limit || 25),50));
    const token = await googleAccessToken();
    const [pageResult,queryResult] = await Promise.allSettled([
      searchAnalytics(token,'page'),
      searchAnalytics(token,'query'),
    ]);
    const analyticsErrors = [
      ...(pageResult.status === 'rejected' ? [`page: ${pageResult.reason instanceof Error ? pageResult.reason.message : String(pageResult.reason)}`] : []),
      ...(queryResult.status === 'rejected' ? [`query: ${queryResult.reason instanceof Error ? queryResult.reason.message : String(queryResult.reason)}`] : []),
    ];
    const fallbackRange = {startDate:isoDate(31),endDate:isoDate(3),rows:[] as Record<string,unknown>[]};
    const pageData = pageResult.status === 'fulfilled' ? pageResult.value : fallbackRange;
    const queryData = queryResult.status === 'fulfilled' ? queryResult.value : fallbackRange;
    const metrics = [
      ...pageData.rows.map((row:Record<string,unknown>)=>({run_id:run.id,dimension_type:'page',dimension_value:String((row.keys as string[])?.[0] || ''),date_start:pageData.startDate,date_end:pageData.endDate,clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)})),
      ...queryData.rows.map((row:Record<string,unknown>)=>({run_id:run.id,dimension_type:'query',dimension_value:String((row.keys as string[])?.[0] || ''),date_start:queryData.startDate,date_end:queryData.endDate,clicks:Number(row.clicks||0),impressions:Number(row.impressions||0),ctr:Number(row.ctr||0),position:Number(row.position||0)})),
    ].filter(row=>row.dimension_value);
    if (metrics.length) {
      const {error} = await supabase.from('seo_search_metrics').insert(metrics);
      if (error) throw error;
    }
    const staleBefore = Date.now()-72*3600000;
    const [{data:eligible,error:candidateError},{data:known,error:knownError}] = await Promise.all([
      supabase.from('movie_seo_quality_status').select('movie_id,slug,movie_updated_at,index_tier,quality_score,freshness_score,last_episode_change_at').eq('eligible_for_index',true).order('quality_score',{ascending:false}).order('movie_updated_at',{ascending:false}).limit(1500),
      supabase.from('seo_url_inspections').select('url,inspected_at').order('inspected_at',{ascending:true}).limit(5000),
    ]);
    if (candidateError) throw candidateError;
    if (knownError) throw knownError;
    const inspectedAt = new Map((known || []).map(item=>[String(item.url),Date.parse(String(item.inspected_at || '')) || 0]));
    const candidateRows = (eligible || [])
      .map(item=>({
        id:String(item.movie_id),
        slug:String(item.slug),
        tier:String(item.index_tier || ''),
        score:Number(item.quality_score || 0),
        freshness:Number(item.freshness_score || 0),
        episodeChangedAt:Date.parse(String(item.last_episode_change_at || '')) || 0,
        updatedAt:Date.parse(String(item.movie_updated_at || '')) || 0,
      }))
      .filter(item=>{
        const lastInspection = inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(item.slug)}`) || 0;
        if (lastInspection < staleBefore) return true;
        return item.tier === 'ongoing' && item.episodeChangedAt > lastInspection;
      })
      .sort((a,b)=>{
        const lastA = inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(a.slug)}`) || 0;
        const lastB = inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(b.slug)}`) || 0;
        const ongoingChangeA = Number(a.tier === 'ongoing' && a.episodeChangedAt > lastA);
        const ongoingChangeB = Number(b.tier === 'ongoing' && b.episodeChangedAt > lastB);
        if (ongoingChangeA !== ongoingChangeB) return ongoingChangeB - ongoingChangeA;
        const tierWeight = (item:typeof a) => item.tier === 'ongoing' ? 3 : item.tier === 'upcoming' ? 2 : 1;
        const tierDiff = tierWeight(b) - tierWeight(a);
        if (tierDiff !== 0) return tierDiff;
        const inspectedDiff = (inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(a.slug)}`) || 0)
          - (inspectedAt.get(`${SITE_URL}/phim/${encodeURIComponent(b.slug)}`) || 0);
        if (inspectedDiff !== 0) return inspectedDiff;
        return b.freshness - a.freshness || b.score - a.score || b.updatedAt - a.updatedAt;
      })
      .slice(0,inspectionLimit);
    const inspections=[];
    const inspectionErrors:string[]=[];
    for (const candidate of candidateRows) {
      try { inspections.push(await inspectUrl(token,candidate)); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        inspectionErrors.push(message);
        if (/429|403|disabled/i.test(message)) break;
      }
    }
    if (inspections.length) {
      const {error} = await supabase.from('seo_url_inspections').upsert(inspections,{onConflict:'url'});
      if (error) throw error;
    }
    const indexed = inspections.filter(item=>item.verdict==='PASS').length;
    const success = analyticsErrors.length < 2 || inspections.length > 0;
    const operationalErrors = [...analyticsErrors, ...inspectionErrors].slice(0,10);
    await supabase.from('seo_gsc_runs').update({
      finished_at:new Date().toISOString(),
      success,
      pages_collected:pageData.rows.length,
      queries_collected:queryData.rows.length,
      urls_inspected:inspections.length,
      indexed_urls:indexed,
      error_message:success ? null : operationalErrors.join(' | '),
      metadata:{
        analytics_errors:analyticsErrors.slice(0,4),
        inspection_errors:inspectionErrors.slice(0,10),
        date_start:pageData.startDate,
        date_end:pageData.endDate,
      },
    }).eq('id',run.id);
    return json({
      ok:success,
      run_id:run.id,
      pages:pageData.rows.length,
      queries:queryData.rows.length,
      inspected:inspections.length,
      indexed,
      analytics_errors:analyticsErrors.slice(0,4),
      inspection_errors:inspectionErrors.slice(0,10),
    },success ? 200 : 502,headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from('seo_gsc_runs').update({finished_at:new Date().toISOString(),success:false,error_message:message}).eq('id',run.id);
    return json({ok:false,error:message,run_id:run.id},502,headers);
  }
});
