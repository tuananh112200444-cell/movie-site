import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createJiti} from 'jiti';
const helpers=await createJiti(import.meta.url).import('../supabase/functions/_shared/playback-recovery-verdict.ts');
const code=ts.transpileModule(fs.readFileSync('supabase/functions/auto-repair-player-issues/index.ts','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal((code.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
async function run(health){
 let handler,logged;
 const events=Array.from({length:3},()=>({movie_slug:'film',movie_title:'Film',episode_slug:'tap-8',event_type:'hls_fatal',source_host:'cdn.example',created_at:new Date().toISOString()}));
 const db={from:table=>{
  const data=table==='player_error_events'?events:table==='movies'?[{id:'movie',slug:'film',source_site:'nguonc'}]:[];
  const chain=new Proxy({}, {get:(_obj,key)=>{
   if(key==='then')return resolve=>resolve({data,error:null});
   if(key==='insert')return async payload=>{if(table==='sync_logs')logged=payload;return {error:null};};
   if(key==='upsert')return async()=>({error:null});
   return ()=>chain;
  }});return chain;
 }};
 const ctx={exports:{},URL,Response,Request,AbortController,AbortSignal,setTimeout,clearTimeout,console,
  Deno:{env:{get:k=>({CRON_SECRET:'test-secret',SUPABASE_URL:'https://backend.example',SUPABASE_SERVICE_ROLE_KEY:'test-key'}[k])}},
  require:name=>name.includes('http/server')?{serve:f=>handler=f}:name.includes('supabase-js')?{createClient:()=>db}:helpers,
  fetch:async raw=>{
   const url=new URL(raw);
   if(url.pathname.endsWith('/unified-provider-brain')){
    assert.equal(url.searchParams.get('force_refresh'),'1');assert.equal(url.searchParams.get('provider_budget'),'1');
    return Response.json({success:true,results:[{outcome:'pending'}]});
   }
   assert.equal(url.searchParams.get('episode'),'tap-8');
   assert.equal(url.searchParams.get('recovery_sample'),'1');assert.equal(url.searchParams.get('limit'),'3');
   return Response.json(health);
  }};
 vm.runInNewContext(code.outputText,ctx);
 const response=await handler(new Request('https://backend.example',{headers:{'x-cron-secret':'test-secret'}}));
 const body=await response.json();return {body,logged};
}
let result=await run({success:true,checked:1,ok:0,failed:1,results:[{episode_slug:'tap-8',ok:false,status:404}]});
assert.equal(result.body.repaired,0);assert.equal(result.body.pending,1);assert.equal(result.logged.added,0);
result=await run({success:true,checked:1,ok:0,inconclusive:1,results:[{episode_slug:'tap-8',ok:false,inconclusive:true}]});
assert.equal(result.body.repaired,0);assert.equal(result.body.pending,1);
result=await run({success:true,ok:1,results:[{episode_slug:'tap-1',ok:true,playback_proof:'hls-segment'}]});
assert.equal(result.body.repaired,0);assert.equal(result.body.pending,1);
result=await run({success:true,ok:1,results:[{episode_slug:'tap-08',ok:true,playback_proof:'hls-segment'}]});
assert.equal(result.body.repaired,1);assert.equal(result.body.pending,0);assert.equal(result.logged.added,1);
console.log('Telemetry repair proof passed: HTTP 200 failures, region blocks and another episode cannot count as repaired; actual requested-episode media proof can.');
