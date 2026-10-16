import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { handlePublicCatalog, catalogTarget } from '../server/publicCatalogCache.mjs';
const jiti=createJiti(import.meta.url);
const { createPublicCatalogFetch }=await jiti.import('../src/lib/publicCatalogFetch.ts');
const base='https://ceoxbhsdodllziyxmbqr.supabase.co';
const key='sb_publishable_test';
const native=globalThis.fetch;
const previousWindow=globalThis.window;
const previousCaches=globalThis.caches;
let calls=[];
globalThis.window={location:{origin:'https://khophim.org',pathname:'/',hostname:'khophim.org'}};
globalThis.fetch=async(input,init)=>{const req=new Request(input,init);calls.push(req);return new Response('[]',{headers:{'Content-Type':'application/json'}});};
const client=createPublicCatalogFetch({baseUrl:base,publicKey:key});
const auth={apikey:key,Authorization:'Bearer '+key};
await client(base+'/rest/v1/movies?select=id,slug&is_published=eq.true&limit=36',{headers:auth});
assert.equal(new URL(calls.at(-1).url).pathname,'/api/catalog-read/movies');
assert.equal(calls.at(-1).headers.has('authorization'),false);
await client(base+'/rest/v1/rpc/get_stable_catalog_feed',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({p_mode:'new',p_limit:36,p_offset:0})});
assert.equal(calls.at(-1).method,'GET');
assert.equal(new URL(calls.at(-1).url).searchParams.get('p_mode'),'new');
const bypass=[
 [base+'/rest/v1/movies?select=id&is_published=eq.true&limit=36',{headers:{...auth,Authorization:'Bearer personal-user-token'}}],
 [base+'/rest/v1/movies?select=id&limit=36',{headers:auth}],
 [base+'/rest/v1/movies?select=id&is_published=eq.true&limit=1000',{headers:auth}],
 [base+'/rest/v1/user_sync_items?select=id',{headers:auth}],
 [base+'/rest/v1/movies',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:'{}'}],
 [base+'/auth/v1/token',{method:'POST',headers:auth,body:'x'}],
 [base+'/rest/v1/movies?select=id&is_published=eq.true&limit=36&unknown=eq.true',{headers:auth}],
 [base+'/rest/v1/movies?select=id&is_published=eq.true&limit=36',{headers:{...auth,'Accept-Profile':'private'}}],
];
for(const [url,init]of bypass){await client(url,init);assert.equal(calls.at(-1).url,url);}
globalThis.window.location.pathname='/admin/login';
await client(base+'/rest/v1/movies?select=id&is_published=eq.true&limit=36',{headers:auth});
assert.equal(new URL(calls.at(-1).url).origin,base);
globalThis.window=previousWindow;
const map=new Map();const waits=[];
globalThis.caches={default:{match:async req=>map.get(req.url)?.clone(),put:async(req,r)=>{map.set(req.url,r.clone());}}};
const makeContext=(path,headers={},assets)=>({request:new Request('https://khophim.org/api/catalog-read/'+path,{headers}),env:assets?{ASSETS:assets}:{},waitUntil:p=>waits.push(p)});
let upstreamCalls=0;
globalThis.fetch=async(input,init)=>{upstreamCalls++;assert.equal(new URL(input).origin,base);assert.equal(new Headers(init.headers).get('authorization').includes('personal'),false);return new Response('[{"id":"public-movie"}]',{status:206,headers:{'Content-Type':'application/json','Content-Range':'0-0/42','Range-Unit':'items'}});};
let ctx=makeContext('movies?select=id&is_published=eq.true&limit=36&__count=exact');
let response=await handlePublicCatalog(ctx);assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'0-0/42');assert.equal(response.headers.get('X-Catalog-Cache'),'MISS');await Promise.all(waits.splice(0));
response=await handlePublicCatalog(ctx);assert.equal(response.headers.get('X-Catalog-Cache'),'HIT');assert.equal(upstreamCalls,1);
ctx=makeContext('movies?select=id&is_published=eq.true&limit=36&__count=estimated');
await handlePublicCatalog(ctx);await Promise.all(waits.splice(0));assert.equal(upstreamCalls,2,'count variants must not share a cache entry');
for(const path of ['users?limit=1','movies?select=id&limit=36','movies?select=id&is_published=eq.false&limit=36','movies?select=secret:users(*)&is_published=eq.true&limit=36','rpc/admin-auth','movies?select=id&is_published=eq.true&limit=1000']) {
 assert.equal(catalogTarget(makeContext(path).request),null,path);
 assert.equal((await handlePublicCatalog(makeContext(path))).status,400);
}
assert.equal((await handlePublicCatalog(makeContext('movies?select=id&is_published=eq.true&limit=36',{Authorization:'Bearer personal-user-token'}))).status,400);
assert.equal(upstreamCalls,2,'rejected requests must never reach the upstream');
for(const k of [...map.keys()])if(!k.includes('__stale'))map.delete(k);
globalThis.fetch=async()=>{throw new Error('outage');};
response=await handlePublicCatalog(makeContext('movies?select=id&is_published=eq.true&limit=36&__count=exact'));
assert.equal(response.headers.get('X-Catalog-Cache'),'STALE');assert.equal(response.status,206);await Promise.all(waits.splice(0));
map.clear();
const assets={fetch:async()=>new Response(JSON.stringify({generated_at:new Date().toISOString(),rows:[{item:{slug:'snapshot-movie'},total_count:42}]}),{headers:{'Content-Type':'application/json'}})};
response=await handlePublicCatalog(makeContext('rpc/get_stable_catalog_feed?p_mode=new&p_limit=36&p_offset=0',{},assets));
assert.equal(response.headers.get('X-Catalog-Cache'),'BOOTSTRAP');assert.equal((await response.json())[0].item.slug,'snapshot-movie');await Promise.all(waits.splice(0));
map.clear();
const oldAssets={fetch:async()=>new Response(JSON.stringify({generated_at:'2020-01-01T00:00:00Z',rows:[]}))};
assert.equal((await handlePublicCatalog(makeContext('rpc/get_stable_catalog_feed?p_mode=new&p_limit=36&p_offset=0',{},oldAssets))).status,503);await Promise.all(waits.splice(0));
globalThis.fetch=async()=>new Response('unauthorized',{status:401});
assert.equal((await handlePublicCatalog(makeContext('movies?select=id&is_published=eq.true&limit=36'))).status,503);await Promise.all(waits.splice(0));assert.equal(map.size,0,'errors must not be cached');
globalThis.fetch=native;globalThis.window=previousWindow;globalThis.caches=previousCaches;
console.log('public catalog cache passed: identity isolation, write bypass, allowlist, count headers, hits, stale fallback, snapshot freshness, error rejection');
