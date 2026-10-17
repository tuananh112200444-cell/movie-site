import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root='C:/Users/CPS/Downloads/project-10351557/.local-playback-benchmark';
const runs=[['local-20261017-10000','ten-thousand/run/results.jsonl'],['local-20261017-20000','next-twenty-thousand/run/results.jsonl']];
const cli='C:/Users/CPS/AppData/Local/npm-cache/_npx/0e23c24576954b26/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const output=path.resolve('.tmp-local-audit-import');await fs.mkdir(output,{recursive:true});
const quote=s=>"'"+s.replaceAll("'","''")+"'";
let total=0,queued=0,batches=0;
for(const [runKey,file] of runs){
 const rows=(await fs.readFile(path.join(root,file),'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate original IDs');
 for(let i=0;i<rows.length;i+=200){
  const batch=rows.slice(i,i+200).map(r=>({movie_id:r.id,episode_slug:r.episode,verdict:r.verdict,checked_at:r.checked_at}));
  const sql=`set lock_timeout='3s';set statement_timeout='15s';select public.import_local_playback_audit(${quote(runKey)},${quote(JSON.stringify(batch))}::jsonb) result;`;
  const file=path.join(output,'batch.sql');await fs.writeFile(file,sql);
  const text=await new Promise((resolve,reject)=>{
   const p=spawn(cli,['db','query','--linked','--output','json','--file',file],{windowsHide:true});let out='',err='';
   const timer=setTimeout(()=>p.kill(),60000);
   p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);
   p.on('close',code=>{clearTimeout(timer);code?reject(Error(err.slice(-1500)||out.slice(-1500))):resolve(out);});
  });
  const result=JSON.parse(text).rows[0].result;total+=result.imported;queued+=result.queued;batches++;
  const progress={runKey,processed_in_run:Math.min(i+batch.length,rows.length),total_imported:total,queue_upserts:queued,batches,updated_at:new Date().toISOString()};
  await fs.appendFile(path.join(output,'batches.jsonl'),JSON.stringify({...progress,...result})+'\n');
  await fs.writeFile(path.join(output,'progress.json'),JSON.stringify(progress,null,2));
  if(batches%10===0)console.log(JSON.stringify(progress));
 }
}
console.log(JSON.stringify({status:'complete',total_imported:total,queue_upserts:queued,batches}));
