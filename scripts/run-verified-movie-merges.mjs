import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const output=path.resolve(process.argv[2]||'.tmp-verified-merges');
await fs.mkdir(output,{recursive:true});
const cli='C:/Users/CPS/AppData/Local/npm-cache/_npx/0e23c24576954b26/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const started=Date.now();let batches=0,merged=0,review=0,failed=0,paused=0;let size=3;
const progressFile=path.join(output,'progress.json');
const historyFile=path.join(output,'batches.jsonl');
async function query(sql){
 const file=path.join(output,'batch.sql');await fs.writeFile(file,sql);
 const r=await new Promise((resolve,reject)=>{
  const p=spawn(cli,['db','query','--linked','--output','json','--file',file],{windowsHide:true});let out='',err='';
  p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);
  p.on('close',exit=>exit?reject(Error(err.slice(-2000)||out.slice(-2000))):resolve(out));
 });return JSON.parse(r).rows?.[0]?.result;
}
while(true){
 let r;
 try{r=await query(`set lock_timeout='3s';set statement_timeout='25s';select public.run_verified_movie_merge_batch(${size}) result;`);}
 catch(e){
  await fs.appendFile(historyFile,JSON.stringify({at:new Date().toISOString(),error:e.message,size})+'\n');
  if(size>1){size=1;continue;}
  // No partial writes survive a statement cancellation. Leave the problematic
  // group for investigation rather than repeatedly forcing it through.
  const marked=await query(`set lock_timeout='3s';set statement_timeout='8s';with next_group as(select candidate_key from canonicalization_candidates where confidence_tier='A' and status='ready' order by (movie_type='single') desc,candidate_key limit 1) update canonicalization_candidates set status='failed',last_error='Bounded merge timed out or lock unavailable; manual inspection required',updated_at=now() where candidate_key in(select candidate_key from next_group) returning jsonb_build_object('candidate_key',candidate_key) result;`);
  await fs.appendFile(historyFile,JSON.stringify({at:new Date().toISOString(),deferred:marked})+'\n');failed++;continue;
 }
 if(r?.status==='capacity_protect'||r?.status==='already_running'){
  paused++;console.log(JSON.stringify({status:r.status,merged,review,failed,batches}));
  await fs.writeFile(progressFile,JSON.stringify({status:r.status,merged,review,failed,batches,elapsed_seconds:(Date.now()-started)/1000},null,2));
  await new Promise(resolve=>setTimeout(resolve,30000));continue;
 }
 if(!r||r.status!=='processed')throw Error('Unexpected merge response');
 batches++;merged+=r.merged;review+=r.review;failed+=r.failed;
 await fs.appendFile(historyFile,JSON.stringify({at:new Date().toISOString(),...r})+'\n');
 const done=Number(r.merged)+Number(r.review)+Number(r.failed)===0;
 const progress={status:done?'complete':'running',merged,review,failed,batches,pauses:paused,elapsed_seconds:Number(((Date.now()-started)/1000).toFixed(2)),updated_at:new Date().toISOString()};
 await fs.writeFile(progressFile,JSON.stringify(progress,null,2));
 if(batches%10===0||done)console.log(JSON.stringify(progress));
 if(done)break;
}
