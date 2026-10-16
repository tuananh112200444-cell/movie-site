async function safeCachePut(cache,key,response) { try { await cache.put(key,response); } catch {} }
const BASE = 'https://ceoxbhsdodllziyxmbqr.supabase.co/rest/v1/';
const PUBLIC_KEY = 'sb_publishable_Juh45t-R83dfgJI0O4_PQw_iYYoU-yh';
const PREFIX = '/api/catalog-read/';
const RPC = new Set(['rpc/get_stable_catalog_feed', 'rpc/get_top10_movies_today']);
const FILTERS = new Set(['select','is_published','superseded_by_movie_id','seo_catalog_status','episode_current','type','year','category','country','order','limit','offset','or','and','source_site','source_name','slug','id','current_episode','total_episodes','tmdb_vote_average','tmdb_vote_count','tmdb_popularity','name','origin_name','normalized_name','title_vi','title_en','title_zh','created_at','last_episode_change_at','published_at']);
const integer = (value, low, high) => /^\d+$/.test(String(value)) && Number(value) >= low && Number(value) <= high;
function error(status) {
  return new Response(JSON.stringify({ message: 'Public catalog unavailable', code: 'CATALOG_UNAVAILABLE' }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
export function catalogTarget(request) {
  const url = new URL(request.url);
  const path = url.pathname.slice(PREFIX.length);
  if (request.method !== 'GET' || !url.pathname.startsWith(PREFIX) || request.headers.has('authorization')) return null;
  if (url.search.length > 6000 || (!RPC.has(path) && path !== 'movies')) return null;
  const params = new URLSearchParams(url.search);
  const count = params.get('__count') || '';
  params.delete('__count');
  if (count && !['exact','planned','estimated'].includes(count)) return null;
  if (path === 'movies') {
    if (params.getAll('is_published').length !== 1 || !['eq.true','is.true'].includes(params.get('is_published'))) return null;
    if (!integer(params.get('limit'),1,72) || (params.has('offset') && !integer(params.get('offset'),0,7200))) return null;
    if (!/^[\w, ]+$/.test(params.get('select') || '')) return null;
    for (const key of params.keys()) if (!FILTERS.has(key)) return null;
  } else if (path === 'rpc/get_stable_catalog_feed') {
    for(const key of params.keys()) if(params.getAll(key).length>1)return null;
    for (const key of params.keys()) if (!['p_mode','p_limit','p_offset'].includes(key)) return null;
    if (!['new','episode_updates'].includes(params.get('p_mode') ?? 'new')) return null;
    if (!integer(params.get('p_limit') ?? '36',1,72) || !integer(params.get('p_offset') ?? '0',0,7200)) return null;
  } else {
    for(const key of params.keys()) if(params.getAll(key).length>1)return null;
    for (const key of params.keys()) if (key !== 'p_limit') return null;
    if (!integer(params.get('p_limit') ?? '10',1,10)) return null;
  }
  params.sort();
  const target = new URL(path, BASE);
  target.search = params.toString();
  return { path, params, count, target };
}
async function boundedJson(response) {
  if (!response.body) throw new Error('empty response');
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('catalog response too large'); }
    parts.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part,offset); offset += part.byteLength; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(value) || value.length > 72) throw new Error('invalid catalog response');
  return JSON.stringify(value);
}
function withState(response, state) {
  const headers = new Headers(response.headers);
  headers.set('X-Catalog-Cache',state);
  headers.set('Cache-Control',state === 'BOOTSTRAP' ? 'public, max-age=15' : 'public, max-age=60');
  const status=headers.get('X-Catalog-Upstream-Status')==='206' ? 206 : response.status;
  headers.delete('X-Catalog-Upstream-Status');
  if(headers.has('X-Catalog-Content-Range')){headers.set('Content-Range',headers.get('X-Catalog-Content-Range'));headers.delete('X-Catalog-Content-Range');}
  return new Response(response.body,{status,headers});
}
async function bootstrap(context, spec) {
  if (!context.env?.ASSETS) return null;
  let name;
  if (spec.path === 'rpc/get_top10_movies_today') name = 'top10';
  else if (spec.path === 'rpc/get_stable_catalog_feed'
    && Number(spec.params.get('p_limit') || 36) === 36
    && [0,36,72,108,144].includes(Number(spec.params.get('p_offset') || 0))) {
    name = (spec.params.get('p_mode') ?? 'new') + '-' + Number(spec.params.get('p_offset') || 0);
  } else return null;
  try {
    const asset = await context.env.ASSETS.fetch(new Request(new URL('/catalog-bootstrap/' + name + '.json', context.request.url)));
    if (!asset.ok) return null;
    const snapshot = JSON.parse(await boundedSnapshot(asset));
    const age = Date.now() - Date.parse(snapshot.generated_at);
    if (!Number.isFinite(age) || age < -300000 || age > 86400000 || !Array.isArray(snapshot.rows)) return null;
    const viewerDay = (time) => new Date(time + 7 * 3600000).toISOString().slice(0,10);
    if(spec.path==='rpc/get_top10_movies_today' && viewerDay(Date.parse(snapshot.generated_at))!==viewerDay(Date.now()))return null;
    const rows = spec.path === 'rpc/get_top10_movies_today' ? snapshot.rows.slice(0,Number(spec.params.get('p_limit') || 10)) : snapshot.rows;
    return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=15','X-Catalog-Cached-At':snapshot.generated_at,'X-Content-Type-Options':'nosniff'}});
  } catch { return null; }
}
async function boundedSnapshot(response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 2 * 1024 * 1024) throw new Error('snapshot too large');
  // Build artifacts are bounded to 72 rows. Bound the stream as well as its declared length.
  const reader=response.body.getReader(); const parts=[]; let size=0;
  for(;;) { const p=await reader.read(); if(p.done)break; size+=p.value.byteLength; if(size>2*1024*1024){await reader.cancel();throw new Error('snapshot too large');} parts.push(p.value); }
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.byteLength;} return new TextDecoder().decode(bytes);
}
export async function handlePublicCatalog(context) {
  const spec = catalogTarget(context.request);
  if (!spec) return error(400);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const keyUrl = new URL(context.request.url);
  keyUrl.search = spec.params.toString();
  keyUrl.searchParams.set('__count',spec.count);
  keyUrl.searchParams.set('__cache_version','1');
  keyUrl.searchParams.sort();
  const key = new Request(keyUrl,{method:'GET'});
  const staleUrl = new URL(keyUrl); staleUrl.searchParams.set('__stale','1');
  const staleKey = new Request(staleUrl,{method:'GET'});
  const cached = cache ? await cache.match(key).catch(() => null) : null;
  if (cached) return withState(cached,'HIT');
  const stale = cache ? await cache.match(staleKey).catch(() => null) : null;
  const seed = stale ? null : await bootstrap(context,spec);
  if(cache && (stale || seed)) {
    const leaseUrl=new URL(keyUrl);leaseUrl.searchParams.set('__refresh','1');
    const leaseKey=new Request(leaseUrl,{method:'GET'});
    const leased=await cache.match(leaseKey).catch(()=>null);
    if(leased)return withState(stale || seed,stale ? 'STALE' : 'BOOTSTRAP');
    await safeCachePut(cache,leaseKey,new Response('1',{headers:{'Cache-Control':'public, max-age=10'}})).catch(()=>{});
  }
  const work = (async () => {
    const headers = { Accept:'application/json', apikey:PUBLIC_KEY, Authorization:'Bearer ' + PUBLIC_KEY };
    if (spec.count) headers.Prefer = 'count=' + spec.count;
    const upstream = await fetch(spec.target,{headers,redirect:'manual',signal:AbortSignal.timeout(8000)});
    if (![200,206].includes(upstream.status)) throw new Error('catalog upstream status ' + upstream.status);
    const body = await boundedJson(upstream);
    const outHeaders = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','X-Catalog-Cached-At':new Date().toISOString(),'X-Content-Type-Options':'nosniff'});
    for (const name of ['content-range','range-unit']) if(upstream.headers.has(name))outHeaders.set(name,upstream.headers.get(name));
    const response = new Response(body,{status:upstream.status,headers:outHeaders});
    if(cache) {
      const storedHeaders=new Headers(outHeaders);storedHeaders.set('X-Catalog-Upstream-Status',String(upstream.status));
      if(storedHeaders.has('Content-Range')){storedHeaders.set('X-Catalog-Content-Range',storedHeaders.get('Content-Range'));storedHeaders.delete('Content-Range');}
      const staleHeaders=new Headers(storedHeaders);staleHeaders.set('Cache-Control','public, max-age=600');
      // Cloudflare Cache API rejects status 206. Preserve it as metadata and restore it for the browser.
      await Promise.all([safeCachePut(cache,key,new Response(body,{status:200,headers:storedHeaders})),safeCachePut(cache,staleKey,new Response(body,{status:200,headers:staleHeaders}))]).catch(() => {});
    }
    return response;
  })();
  // Preserve a cold-cache warm even if a browser abandons its own request.
  context.waitUntil(work.then(() => {}).catch(() => {}));
  if (stale) return withState(stale,'STALE');
  if(seed) {
    if(cache)await safeCachePut(cache,key,seed.clone()).catch(()=>{});
    return withState(seed,'BOOTSTRAP');
  }
  try { return withState(await work,'MISS'); } catch (failure) {
    const message=failure instanceof Error ? failure.message : 'unknown';
    console.warn(JSON.stringify({event:'public_catalog_upstream_error',message:message.slice(0,180)}));
    const response=error(503);
    response.headers.set('X-Catalog-Failure',/status (\d{3})/.exec(message)?.[1] || (message.includes('JSON') ? 'format' : 'transport'));
    return response;
  }
}
