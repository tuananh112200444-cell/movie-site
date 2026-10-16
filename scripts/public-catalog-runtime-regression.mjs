import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, Response, convertV4MiniflareOptions } from 'miniflare';
const source=(await readFile('server/publicCatalogCache.mjs','utf8')).replaceAll('export function','function').replaceAll('export async function','async function');
let calls=0;
const mf=new Miniflare(convertV4MiniflareOptions({
 modules:true,compatibilityDate:'2026-10-08',
 script:source+'\nexport default {fetch(request,env,ctx){return handlePublicCatalog({request,env,waitUntil:ctx.waitUntil.bind(ctx)})}};',
 outboundService:async request=>{
  calls++;
  assert.equal(new URL(request.url).hostname,'ceoxbhsdodllziyxmbqr.supabase.co');
  if(new URL(request.url).pathname.endsWith('get_top10_movies_today'))return new Response(null,{status:302,headers:{Location:'https://example.com/never-follow'}});
  return new Response('[{"id":"public-movie"}]',{status:206,headers:{'Content-Type':'application/json','Content-Range':'0-0/42','Range-Unit':'items'}});
 },
}));
try{
 const url='https://khophim.org/api/catalog-read/movies?select=id&is_published=eq.true&limit=36&__count=exact';
 let r=await mf.dispatchFetch(url);assert.equal(r.status,206);assert.equal(r.headers.get('X-Catalog-Cache'),'MISS');assert.equal(r.headers.get('Content-Range'),'0-0/42');assert.equal((await r.json()).length,1);
 r=await mf.dispatchFetch(url);assert.equal(r.status,206);assert.equal(r.headers.get('X-Catalog-Cache'),'HIT');assert.equal(r.headers.get('Content-Range'),'0-0/42');assert.equal((await r.json()).length,1);assert.equal(calls,1);
 r=await mf.dispatchFetch('https://khophim.org/api/catalog-read/rpc/get_top10_movies_today?p_limit=10');assert.equal(r.status,503);assert.equal(r.headers.get('X-Catalog-Failure'),'302');assert.equal(calls,2,'must not follow a redirect with public API credentials');
 console.log('Cloudflare runtime passed: real Cache API HIT, 206 pagination restoration, manual redirect rejection.');
}finally{await mf.dispose();}
