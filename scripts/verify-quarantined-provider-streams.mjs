import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const input=JSON.parse((await fs.readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,''));
const rows=input.rows?.[0]?.rows || [];
if(rows.length>200)throw Error('Candidate batch exceeds 200');
const output=process.argv[3];await fs.mkdir(output,{recursive:true});
function trusted(url){const u=new URL(url);if(u.protocol!=='https:' || u.hostname!=='a.kvp726.com')throw Error('Unsupported candidate host');return u.href;}
async function get(url,file,range=false){
 trusted(url);
 const args=['-4','-sS','--connect-timeout','3','--max-time','6','--max-redirs','0','-e','https://khophim.org/','-D',file+'.headers','-o',file,'-w','%{http_code}'];
 if(range)args.push('-r','0-1023','--max-filesize','65536');
 else args.push('--max-filesize','1048576');
 args.push(url);
 return await new Promise(resolve=>{const p=spawn('curl.exe',args,{windowsHide:true});let out='';p.stdout.on('data',d=>out+=d);p.stderr.resume();p.on('error',()=>resolve({status:0,exit:1}));p.on('close',code=>resolve({status:Number(out.trim()),exit:code}));});
}
const firstUri=text=>text.split(/\r?\n/).map(s=>s.trim()).find(s=>s&&!s.startsWith('#'));
const grouped=new Map();for(const row of rows){trusted(row.stream_url);const list=grouped.get(row.stream_url)||[];list.push(row);grouped.set(row.stream_url,list);}
const jobs=[...grouped.entries()];const results=[];let at=0;
async function worker(){for(;;){const i=at++;if(i>=jobs.length)return;const [url,candidates]=jobs[i];const stem=path.join(output,'probe-'+i);let result={url,ids:candidates.map(r=>r.id),movieIds:candidates.map(r=>r.movie_id),verified:false};
 try{
 let p=await get(url,stem+'.master');if(p.exit||p.status!==200)throw Error('master HTTP '+p.status);
 let text=await fs.readFile(stem+'.master','utf8');if(!text.startsWith('#EXTM3U'))throw Error('invalid master');
 let mediaUrl=url;
 if(text.includes('#EXT-X-STREAM-INF')){mediaUrl=trusted(new URL(firstUri(text),url).href);p=await get(mediaUrl,stem+'.media');if(p.exit||p.status!==200)throw Error('media HTTP '+p.status);text=await fs.readFile(stem+'.media','utf8');}
 if(!text.startsWith('#EXTM3U')||!text.includes('#EXTINF:'))throw Error('invalid media playlist');
 const segmentUrl=trusted(new URL(firstUri(text),mediaUrl).href);p=await get(segmentUrl,stem+'.segment',true);
 const bytes=await fs.readFile(stem+'.segment').catch(()=>Buffer.alloc(0));
 const headers=await fs.readFile(stem+'.segment.headers','utf8').catch(()=>'');
 if(p.exit||![200,206].includes(p.status)||bytes.length<188||/content-type:\s*(text\/html|application\/json)/i.test(headers))throw Error('segment unverified HTTP '+p.status);
 result={...result,verified:true,checkedAt:new Date().toISOString(),proof:'hls-master-media-and-segment-http',segmentStatus:p.status,segmentBytes:bytes.length};
 }catch(e){result.error=e.message;}
 results.push(result);
 if(results.length%10===0||results.length===jobs.length)console.log(JSON.stringify({completed:results.length,total:jobs.length,verified:results.filter(r=>r.verified).length}));
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));
}}
await Promise.all([worker(),worker()]);
console.log(JSON.stringify({candidateRows:rows.length,uniqueUrls:jobs.length,verifiedRows:results.filter(r=>r.verified).reduce((n,r)=>n+r.ids.length,0),failedOrUnverified:results.filter(r=>!r.verified).length}));
