import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const output=path.resolve(process.argv[2]||'.tmp-verified-merges');
await fs.mkdir(output,{recursive:true});
const cli='C:/Users/CPS/AppData/Local/npm-cache/_npx/0e23c24576954b26/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const progressFile=path.join(output,'progress.json');
const historyFile=path.join(output,'batches.jsonl');
const previous=JSON.parse(await fs.readFile(progressFile,'utf8').catch(()=>'{}'));
const history=(await fs.readFile(historyFile,'utf8').catch(()=>'')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const completed=history.filter(r=>r.status==='processed');
const started=Date.now();let batches=completed.length,merged=completed.reduce((n,r)=>n+Number(r.merged||0),0),
 review=completed.reduce((n,r)=>n+Number(r.review||0),0),failed=completed.reduce((n,r)=>n+Number(r.failed||0),0),paused=previous.pauses||0;
let size=3,connectionRetries=0;
async function query(sql){
 const file=path.join(output,'batch.sql');await fs.writeFile(file,sql);
 const r=await new Promise((resolve,reject)=>{
  const p=spawn(cli,['db','query','--linked','--output','json','--file',file],{windowsHide:true});let out='',err='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;p.kill();},60000);
  p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);
  p.on('close',exit=>{clearTimeout(timer);if(timedOut)reject(Error('Local administration connection deadline exceeded'));else if(exit)reject(Error(err.slice(-2000)||out.slice(-2000)));else resolve(out);});
 });return JSON.parse(r).rows?.[0]?.result;
}
while(true){
 let r;
 try{r=await query(`set lock_timeout='3s';set statement_timeout='25s';select public.run_verified_movie_merge_batch(${size}) result;`);}
 catch(e){
  await fs.appendFile(historyFile,JSON.stringify({at:new Date().toISOString(),error:e.message,size})+'\n');
  if(/password authentication|failed to connect|connection deadline|network|connection reset|temporary failure|EOF/i.test(e.message)){
   connectionRetries++;console.log(JSON.stringify({status:'connection_retry',attempt:connectionRetries,merged,review,failed}));
   if(connectionRetries>=6)throw Error('Administration connection unavailable; committed groups are preserved and the run can be resumed.');
   await new Promise(resolve=>setTimeout(resolve,5000));continue;
  }
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
 connectionRetries=0;
 batches++;merged+=r.merged;review+=r.review;failed+=r.failed;
 await fs.appendFile(historyFile,JSON.stringify({at:new Date().toISOString(),...r})+'\n');
 const done=Number(r.merged)+Number(r.review)+Number(r.failed)===0;
 const progress={status:done?'complete':'running',merged,review,failed,batches,pauses:paused,elapsed_seconds:Number(((previous.elapsed_seconds||0)+(Date.now()-started)/1000).toFixed(2)),updated_at:new Date().toISOString()};
 await fs.writeFile(progressFile,JSON.stringify(progress,null,2));
 if(batches%10===0||done)console.log(JSON.stringify(progress));
 if(done)break;
}
