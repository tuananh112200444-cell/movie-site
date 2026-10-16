import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createJiti} from 'jiti';
const {recoveryVerdict}=await createJiti(import.meta.url).import('../supabase/functions/_shared/playback-recovery-verdict.ts');
const code=ts.transpileModule(fs.readFileSync('supabase/functions/playback-source-recovery/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal((code.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
async function run(probes,discoveryError=false){
 let handler,finish,discovery=0,cleared=0;
 const work={movie_id:'a',slug:'film',token:'token',requested_episode:'tap-8',episode_cursor:'',attempts:2};
 const db={rpc:async(name,args)=>{
  if(name==='claim_playback_source_recovery')return {data:work};
  finish=args;return {data:true};
 },from:(table)=>({
  insert:async()=>({}),delete:()=>({eq:async()=>{cleared++;return {};}}),
 })};
 const context={exports:{},URL,Response,Request,AbortSignal,console,
  Deno:{env:{get:k=>({CRON_SECRET:'secret',SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'key'}[k])},serve:f=>handler=f},
  require:name=>name.includes('supabase-js')?{createClient:()=>db}:{recoveryVerdict},
  fetch:async url=>{
   if(url.pathname.endsWith('unified-provider-brain')){
    discovery++;assert.equal(url.searchParams.get('force_refresh'),'1');assert.equal(url.searchParams.get('provider_budget'),'1');
    assert.equal(url.searchParams.get('provider_offset'),'1');
    if(discoveryError)throw Error('Provider timeout');
    return Response.json({success:true,results:[{outcome:'pending'}]});
   }
   assert.equal(url.searchParams.get('episode'),'tap-8');
   return Response.json(probes.shift());
  }};
 vm.runInNewContext(code.outputText,context);
 const unauthorized=await handler(new Request('https://example.test'));
 assert.equal(unauthorized.status,401);
 const response=await handler(new Request('https://example.test',{headers:{'x-cron-secret':'secret'}}));
 assert.equal(response.status,200);
 return {finish,discovery,cleared};
}
const good={success:true,results:[{ok:true,playback_proof:'hls-segment',episode_slug:'tap-8'}]};
const bad={success:true,results:[{ok:false,status:404}]};
const region={success:true,results:[{ok:false,inconclusive:true,status:403}]};
let r=await run([good]);assert.equal(r.finish.p_outcome,'verified_sample');assert.equal(r.discovery,0);
r=await run([bad,good]);assert.equal(r.finish.p_outcome,'recovered_sample');assert.equal(r.discovery,1);assert.equal(r.cleared,1);
r=await run([region,region]);assert.equal(r.finish.p_outcome,'pending_browser');
r=await run([bad,bad]);assert.equal(r.finish.p_outcome,'no_source');
r=await run([bad],true);assert.equal(r.finish.p_outcome,'retry');assert.match(r.finish.p_evidence.error,/timeout/);
console.log('Recovery worker scenarios passed: authorization, existing media, discovery + media proof, inconclusive regions, no source, provider timeout.');
