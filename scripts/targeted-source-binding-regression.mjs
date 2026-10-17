import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const file=fs.readFileSync('supabase/functions/sync-ophim-movies/index.ts','utf8');
const part=file.slice(file.indexOf('async function upsertMovie('),file.indexOf('\nasync function upsertMovieEpisodeRowsSafely('));
const js=ts.transpileModule(part,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const target={id:'requested-movie-A',slug:'transformers-4',source_site:'nguonc',name:'Transformers 4',year:2014,is_published:true};
const sibling={...target,id:'provider-movie-B',slug:'transformers',source_site:'phimapi'};
let resolves=0,writes=[];
const ctx={
 moviePayload:()=>({slug:'transformers',year:2014}),isSafeTargetDetail:(_p,t,d)=>t.year===d.movie.year,
 findExistingMovie:async()=>{resolves++;return sibling;},
 hasUsableMovieImage:()=>true,sameMovieByStableProviderIdentity:()=>false,
 updatePayloadForExisting:(_old,p)=>p,
 protectExistingSlug:(_old,p)=>{const copy={...p};delete copy.slug;return copy;},
 removeConflictingUniqueIdentityFields:async(_db,_id,p)=>p,
 runDatabaseMutationWithRetry:async f=>f(),isDuplicateError:()=>false,dbErrorMessage:e=>e.message,
};
const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:target})})}),
 update:payload=>({eq:async(_key,id)=>{writes.push({id,payload});return {};}})})};
vm.createContext(ctx);vm.runInContext(js,ctx);
const provider={sourceSite:'phimapi',trackOphimIdentity:false};
const detail={movie:{year:2014}};
const repaired=await ctx.upsertMovie(db,provider,detail,target);
assert.equal(repaired.id,target.id);assert.equal(resolves,0);assert.equal(writes[0].id,target.id);
assert.ok(!('slug' in writes[0].payload));
await assert.rejects(()=>ctx.upsertMovie(db,provider,{movie:{year:2007}},target),/identity mismatch/);
assert.equal(writes.length,1);
const ordinary=await ctx.upsertMovie(db,provider,detail);
assert.equal(ordinary.id,sibling.id);assert.equal(resolves,1);
assert.match(file,/upsertMovie\(supabase, provider, detail, targetMovie\)/);
assert.match(file,/changedSlugs\.push\(String\(targetMovie.slug\)\)/);
console.log('Targeted source binding passed: requested movie wins over provider alias, slug preserved, wrong year rejected, normal ingest still resolves canonical identity.');
