import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { recoveryVerdict } from '../_shared/playback-recovery-verdict.ts';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
// One movie, one episode, at most one provider discovery per run. The SQL
// lease prevents overlap across cron, retries and manual dispatches.
Deno.serve(async req=>{
 const secret=Deno.env.get('CRON_SECRET')||'';
 if(!secret || req.headers.get('x-cron-secret')!==secret)return json({success:false,error:'Unauthorized'},401);
 if(!['GET','POST'].includes(req.method))return json({success:false,error:'Method not allowed'},405);
 const base=Deno.env.get('SUPABASE_URL')||'';
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const db=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:work,error}=await db.rpc('claim_playback_source_recovery');
 if(error)return json({success:false,error:error.message},500);
 if(!work)return json({success:true,processed:0,status:'idle_or_capacity_protect'});
 let episode=String(work.requested_episode||'');
 let outcome='retry';
 const evidence:Record<string,unknown>={contract:'sampled_playback_recovery_v1',attempt:work.attempts};
 async function invoke(name:string,params:Record<string,string>,timeout:number){
  const url=new URL(`${base}/functions/v1/${name}`);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const response=await fetch(url,{headers:{'x-cron-secret':secret,apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(timeout)});
  const body=await response.json();
  if(!response.ok || body.success===false)throw Error(`${name}: ${response.status} ${String(body.error||'failed')}`);
  if(body.status==='capacity_protect')throw Error('Recovery paused by capacity guard');
  return body;
 }
 try{
  // Keyset traversal covers different episodes on subsequent visits. Keep
  // the exact episode reported by a viewer, including provider slug padding.
  if(!episode){
   const query=()=>db.from('streams').select('episode_slug').eq('movie_id',work.movie_id)
    .in('source',['phimapi','kkphim','nguonc','vsmov','blvietsub','khophim-r2'])
    .or('stream_url.neq.,embed_url.neq.').order('episode_slug').limit(1);
   let next=await query().gt('episode_slug',work.episode_cursor||'');
   if(next.error)throw Error(next.error.message);
   if(!next.data?.length)next=await query();
   if(next.error)throw Error(next.error.message);
   episode=String(next.data?.[0]?.episode_slug||'');
  }
  const probe=()=>invoke('stream-health-check',{slug:work.slug,episode,limit:'3',concurrency:'3',queue:'recovery',recovery_sample:'1'},25000);
  const before=await probe();
  evidence.before=before;
  outcome=recoveryVerdict(before);
  // An inconclusive region result remains unverified, but discovery can still
  // find a direct alternative. Never count stored rows as successful playback.
  if(outcome!=='verified_sample'){
   const repair=await invoke('unified-provider-brain',{
    slug:work.slug,limit:'1',provider_budget:'1',force_refresh:'1',
    provider_offset:String((Number(work.attempts)-1)%3),reason:'bounded_source_recovery',
   },65000);
   evidence.discovery=repair;
   const after=await probe();
   evidence.after=after;
   const verdict=recoveryVerdict(after);
   outcome=verdict==='verified_sample'?'recovered_sample':verdict;
   if(!episode)episode=String(after.results?.find((r:Record<string,unknown>)=>r.ok===true)?.episode_slug||'');
  }
  if(outcome==='recovered_sample'){
   const {error:cacheError}=await db.from('movie_api_cache').delete().eq('slug',work.slug);
   if(cacheError)evidence.cache_error=cacheError.message;
  }
 }catch(error){evidence.error=error instanceof Error?error.message:String(error);outcome='retry';}
 const {data:completed,error:finishError}=await db.rpc('complete_playback_source_recovery',{
  p_movie_id:work.movie_id,p_token:work.token,p_outcome:outcome,p_episode:episode,p_evidence:evidence,
 });
 if(finishError || completed!==true)return json({success:false,error:finishError?.message||'Recovery lease lost'},500);
 await db.from('sync_logs').insert({function_name:'playback-source-recovery',run_at:new Date().toISOString(),
  success:outcome!=='retry',scanned:1,added:outcome==='recovered_sample'?1:0,errors:outcome==='retry'?1:0,
  metadata:{movie_id:work.movie_id,slug:work.slug,episode,outcome,contract:'sampled_playback_recovery_v1'}});
 return json({success:true,processed:1,slug:work.slug,episode,outcome});
});
