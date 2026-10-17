import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {seasonIdentity} from '../supabase/functions/_shared/season-identity.ts';
const source=fs.readFileSync('functions/[[path]].js','utf8');
const ctx={seasonIdentity,normalizeSearchFallbackText:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),isOphimCatalogSource:()=>false};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function providerNeutralTitle('),source.indexOf('\nasync function fetchSearchFallbackItems(')),ctx);
ctx.rankSearchFallbackRows=rows=>rows;
const base={name:'Dâu Tây Ngọt Ngào',origin_name:'Merry Berry Love',slug:'dau-tay-ngot-ngao',year:2026};
const first={...base,id:'4099b0cb-91c5-4ed4-a0d6-930423767f80',name:'Dâu Tây Ngọt Ngào (Phần 1)',origin_name:'Merry Berry Love (Season 1)',slug:'dau-tay-ngot-ngao-phan-1',type:'series'};
assert.equal(ctx.implicitFirstSeasonSearchPair(base,first),true);
for(const extra of [{year:2025},{type:'single'},{tmdb_id:22},{origin_name:'A different show'},{season_scope:'aggregate'}]) {
 const left={...base,tmdb_id:11,...extra};assert.equal(ctx.implicitFirstSeasonSearchPair(left,first.tmdb_id?first:{...first,tmdb_id:11}),false,JSON.stringify(extra));
}
for(const n of [2,3]) assert.equal(ctx.implicitFirstSeasonSearchPair(base,{...first,name:`Dâu Tây Ngọt Ngào (Phần ${n})`,origin_name:`Merry Berry Love (Season ${n})`}),false);
for(const rows of [[base,first],[first,base]]) {
 const result=ctx.mergeProviderNeutralSearchRows([],rows,'dâu tây ngọt ngào',16);assert.equal(result.length,1);assert.equal(result[0].slug,first.slug);
}
assert.equal(ctx.mergeProviderNeutralSearchRows([first],[base,{...first,name:'Dâu Tây Ngọt Ngào (Phần 2)',origin_name:'Merry Berry Love (Season 2)',slug:'second'}],'dâu tây',16).length,2);
console.log('First-season search: one stored canonical result, source-order independent; remakes, conflicting IDs/titles, aggregates and seasons 2/3 preserved.');
const {onRequest}=await import('../functions/[[path]].js');
const originalFetch=globalThis.fetch;
try {
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url.includes('/rest/v1/rpc/')) return Response.json({message:'fixture unavailable'},{status:503});
  if(url.includes('phimapi.com/')) return Response.json({items:[base]});
  if(url.includes('vsmov.com/')||url.includes('phim.nguonc.com/')) return Response.json({items:[]});
  throw Error('Unexpected request '+url);
 };
 const response=await onRequest({request:new Request('https://khophim.org/api/search?q='+encodeURIComponent(base.name)),env:{ASSETS:{fetch:async req=>Response.json(new URL(req.url).pathname==='/search-fallback/d.json'?{items:[first]}:{sections:{}})}},waitUntil(){}});
 const result=await response.json();assert.equal(response.status,200);assert.equal(result.items.length,1);assert.equal(result.items[0].slug,first.slug);
 console.log('Actual /api/search outage fallback returns one playable canonical route for the reported title.');
} finally {globalThis.fetch=originalFetch;}
