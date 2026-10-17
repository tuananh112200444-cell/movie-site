import fs from 'node:fs/promises';
const txt=await fs.readFile('.tmp-implicit-final-evidence.json','utf8');
const result=JSON.parse(txt.slice(txt.indexOf('{'),txt.lastIndexOf('}')+1)).rows[0].result;
const movies=[...new Map(result.review.flatMap(r=>r.movies).map(m=>[m.id,m])).values()];
const tasks=movies.flatMap(m=>['vsmov','nguonc'].map(provider=>({m,provider})));let cursor=0;
const out='.tmp-first-season-alternate-review.jsonl';await fs.writeFile(out,'');
async function worker(){while(cursor<tasks.length){let {m,provider}=tasks[cursor++];let slug=m.slug.replace(/^(?:phimapi|nguonc)-/,'');let r;
 try {const url=provider==='vsmov'?'https://vsmov.com/api/phim/':'https://phim.nguonc.com/api/film/';
 const res=await fetch(url+encodeURIComponent(slug),{signal:AbortSignal.timeout(12000)});let d=await res.json();let p=d.movie||{};
 r={id:m.id,slug:m.slug,provider,status:res.status,success:d.status===true||d.status==='success',name:p.name,origin:p.origin_name||p.original_name,year:p.year,tmdb:p.tmdb,total:p.episode_total||p.total_episodes,
 servers:(d.episodes||p.episodes||[]).map(s=>{let ep=s.server_data||s.items||[];return{name:s.server_name,count:ep.length,first:ep[0]?.name,last:ep.at(-1)?.name,boundaries:ep.filter(e=>/(?:phần|phan|season|part)[-_ ]*[2-9]/i.test(e.name+' '+e.slug)).map(e=>({name:e.name,slug:e.slug})).slice(0,8)}})};
 }catch(e){r={id:m.id,slug:m.slug,provider,error:e.message}}await fs.appendFile(out,JSON.stringify(r)+'\n');}}
await Promise.all([worker(),worker(),worker()]);console.log(JSON.stringify({checked:tasks.length,report:out}));
