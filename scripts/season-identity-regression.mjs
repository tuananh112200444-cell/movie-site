import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {seasonIdentity, implicitFirstSeasonIdentity, movieIdentityBoundaryCompatible as compatible} from '../supabase/functions/_shared/season-identity.ts';
const movie = (name,season,extra={})=>({name,type:'series',year:2018,tmdb_id:83070,season_number:season,...extra});
assert.equal(compatible(movie('Same',1),movie('Same',2)),false,'same TMDB/year cannot override season');
assert.equal(compatible(movie('Same',null),movie('Same',1)),false,'unknown is not season one');
assert.equal(compatible(movie('Cùng tên',1),movie('Cùng tên',1,{type:'single'})),false);
assert.equal(compatible(movie('Cùng tên',1),movie('Cùng tên',1,{tmdb_id:999})),false);
for(const label of ['Phần 2','Season 02','Mùa 2','Part 2','S02','foo-phan-2']) assert.equal(seasonIdentity({name:label}).season,2,label);
assert.equal(seasonIdentity(movie('Phần 2',1)).scope,'conflict');
const aggregate={name:'Gạo Nếp Gạo Tẻ',type:'series',year:2018,episodes:[{server_data:[{name:'1-Phần 1'},{name:'110-Phần 2'}]}]};
assert.equal(seasonIdentity(aggregate).scope,'aggregate');
assert.equal(compatible(aggregate,movie('Gạo Nếp Gạo Tẻ (Phần 1)',1,{tmdb_id:null})),false);
assert.equal(compatible(movie('Phần 1',1),movie('Season 1',1)),true);
const implicit={name:'Một Câu Chuyện',origin_name:'One Long Story',year:2026,type:'series'};
const explicit={...implicit,name:'Một Câu Chuyện (Phần 1)',origin_name:'One Long Story (Season 1)',season_number:1};
assert.equal(compatible(implicit,explicit),true,'bilingual year proof bridges implicit season one');
assert.equal(compatible({...implicit,year:2025},explicit),false);
assert.equal(compatible({...implicit,origin_name:'Unrelated original title'},explicit),false);
assert.equal(compatible({...implicit,season_scope:'aggregate'},explicit),false);
const source=fs.readFileSync('supabase/functions/sync-ophim-movies/index.ts','utf8');
const slice=source.slice(source.indexOf('function isSafeTargetDetail('),source.indexOf('\nasync function fetchDetailForTarget('));
const ctx={movieIdentityBoundaryCompatible:compatible,implicitFirstSeasonIdentity,normalizedMovieType:x=>x,slugify:x=>String(x||'').toLowerCase().replace(/\W+/g,'-')};vm.createContext(ctx);vm.runInContext(ts.transpileModule(slice,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
assert.equal(ctx.isSafeTargetDetail({sourceSite:'phimapi'},movie('Same',1),{movie:movie('Same',2),episodes:[]}),false);
assert.equal(ctx.isSafeTargetDetail({sourceSite:'phimapi'},movie('Same',1),{movie:movie('Same',1),episodes:[]}),true);
assert.equal(ctx.isSafeTargetDetail({sourceSite:'nguonc'},{...aggregate,season_scope:'aggregate'},{movie:aggregate,episodes:aggregate.episodes}),true);
const gateway=fs.readFileSync('functions/[[path]].js','utf8');
const local=gateway.slice(gateway.indexOf('function normalizeCanonicalTitle('),gateway.indexOf('\nasync function fetchLocalPlayableAlternative('));
vm.runInContext(local,ctx);
assert.equal(ctx.safeLocalAlternativeIdentity(movie('Same',1),movie('Same',2)),false);
assert.equal(ctx.safeLocalAlternativeIdentity(movie('Same',1),movie('Same',1)),true);
console.log('Season boundaries passed: explicit/unknown/aggregate, conflicting ids/types, same-year same-TMDB seasons, target import and edge local fallback.');
const {onRequest}=await import('../functions/[[path]].js');
for (const [from,to] of [
 ['/phim/gao-nep-gao-te','/phim/gao-nep-gao-te-phan-1'],
 ['/xem-phim/gao-nep-gao-te/tap-109','/xem-phim/gao-nep-gao-te-phan-1/tap-109'],
 ['/xem-phim/gao-nep-gao-te/tap-110-phan-2','/xem-phim/gao-nep-gao-te-phan-2/tap-01'],
 ['/xem-phim/gao-nep-gao-te/tap-159','/xem-phim/gao-nep-gao-te-phan-2/tap-50'],
]) {
 const response=await onRequest({request:new Request('https://khophim.org'+from),env:{},waitUntil(){}});
 assert.equal(new URL(response.headers.get('location')).pathname,to);
}
console.log('Reviewed collection routes preserve season boundaries and cumulative episode numbering.');
const seasonRows=[movie('Fixture',1,{id:'season-one',slug:'fixture-1'}),movie('Fixture',2,{id:'season-two',slug:'fixture-2'})];
function query(rows){const q={select(){return q},eq(){return q},neq(){return q},is(){return q},limit(){return Promise.resolve({data:rows})}};return q;}
const admin=fs.readFileSync('supabase/functions/admin-movie-upsert/index.ts','utf8');
const adminSlice=admin.slice(admin.indexOf('async function findExistingMovie(\n'),admin.indexOf('\nfunction mergeMovieData('));
const adminContext={movieIdentityBoundaryCompatible:compatible,MOVIE_MATCH_SELECT:'id'};vm.createContext(adminContext);vm.runInContext(ts.transpileModule(adminSlice,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,adminContext);
const found=await adminContext.findExistingMovie({from:()=>query(seasonRows)},movie('Fixture',2));
assert.equal(found.id,'season-two','admin must choose same season among same-TMDB owners');
const catalog=fs.readFileSync('supabase/functions/sync-tmdb-catalog/index.ts','utf8');
const start=catalog.indexOf('async function upsertCatalogMovie(');const end=catalog.indexOf('\nserve(',start);
const catalogSlice=catalog.slice(start,catalog.indexOf('\nasync function ',start+1)>0?catalog.indexOf('\nasync function ',start+1):end);
let written;
const catalogContext={movieIdentityBoundaryCompatible:compatible,findFirstSeasonAlias:async()=>null,titleKeysFromMovie:()=>new Set(),Date};vm.createContext(catalogContext);vm.runInContext(ts.transpileModule(catalogSlice,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,catalogContext);
const catalogDb={from:()=>({...query(seasonRows),update:()=>({eq:async(_key,id)=>{written=id;return {}}})})};
await catalogContext.upsertCatalogMovie(catalogDb,movie('Fixture',2,{tmdb_media_type:'tv'}));
assert.equal(written,'season-two','TMDB catalog updater must not overwrite another season');
console.log('Admin and TMDB catalog writers select the matching season from a shared external ID.');
