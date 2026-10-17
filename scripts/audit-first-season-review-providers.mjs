import fs from 'node:fs/promises';
const text=await fs.readFile('.tmp-implicit-final-evidence.json','utf8');
const result=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1)).rows[0].result;
const movies=[...new Map((result.review||[]).flatMap(r=>r.movies).map(m=>[m.id,m])).values()];
const out='.tmp-first-season-provider-review.jsonl';
let cursor=0;
async function worker(){while(cursor<movies.length){const m=movies[cursor++];const slug=m.slug.replace(/^(?:phimapi|nguonc)-/,'');let evidence;
 try{const r=await fetch('https://phimapi.com/phim/'+encodeURIComponent(slug),{signal:AbortSignal.timeout(12000)});const d=await r.json();const p=d.movie||{};
 evidence={id:m.id,slug:m.slug,status:r.status,success:d.status===true,name:p.name,origin:p.origin_name,year:p.year,tmdb:p.tmdb,total:p.episode_total,
  servers:(d.episodes||[]).map(s=>({name:s.server_name,count:s.server_data?.length,first:s.server_data?.[0]?.name,last:s.server_data?.at(-1)?.name,
   boundaries:s.server_data?.filter(e=>/(?:phần|phan|season|part)\s*[2-9]/i.test(e.name+' '+e.slug)).map(e=>({name:e.name,slug:e.slug})).slice(0,8)}))};
 }catch(e){evidence={id:m.id,slug:m.slug,error:e.message};}
 await fs.appendFile(out,JSON.stringify(evidence)+'\n');
}}
await fs.writeFile(out,'');await Promise.all([worker(),worker(),worker()]);
console.log(JSON.stringify({checked:movies.length,report:out}));
