import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base='https://ceoxbhsdodllziyxmbqr.supabase.co/rest/v1/';
const key=process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Juh45t-R83dfgJI0O4_PQw_iYYoU-yh';
await mkdir('public/catalog-bootstrap',{recursive:true});
async function read(path){
 const r=await fetch(base+path,{headers:{apikey:key,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw new Error('HTTP '+r.status);
 const rows=await r.json();if(!Array.isArray(rows))throw new Error('invalid catalog payload');return rows;
}
const results=await Promise.allSettled([
 (async()=>{
  const rows=await read('catalog_feed_page_cache?select=mode,page_offset,row_position,item,total_count,cached_at&order=mode,page_offset,row_position&limit=360');
  const groups=new Map();
  for(const row of rows){
   if(!['new','episode_updates'].includes(row.mode)||![0,36,72,108,144].includes(row.page_offset)||!row.item?.id||!row.item?.slug)throw new Error('invalid feed snapshot');
   const name=row.mode+'-'+row.page_offset;const group=groups.get(name)||[];group.push(row);groups.set(name,group);
  }
  if(groups.size!==10||[...groups.values()].some(g=>g.length!==36))throw new Error('incomplete feed snapshot');
  for(const [name,group]of groups)await writeFile('public/catalog-bootstrap/'+name+'.json',JSON.stringify({generated_at:group[0].cached_at,rows:group.map(r=>({item:r.item,total_count:r.total_count}))})+'\n');
  return 'feeds refreshed';
 })(),
 (async()=>{
  const rows=await read('rpc/get_top10_movies_today?p_limit=10');
  if(!rows.length||rows.length>10||rows.some(r=>!r.item?.id||!r.rank))throw new Error('invalid Top 10 snapshot');
  await writeFile('public/catalog-bootstrap/top10.json',JSON.stringify({generated_at:new Date().toISOString(),rows})+'\n');
  return 'Top 10 refreshed';
 })(),
]);
for(let i=0;i<results.length;i++){
 const result=results[i];
 if(result.status==='fulfilled')console.log('[catalog-bootstrap] '+result.value);
 else {
  // Keep the committed snapshot on a transient outage; the edge checks its age
  // and never serves a build snapshot older than 24 hours.
  const filename=i===0?'public/catalog-bootstrap/new-0.json':'public/catalog-bootstrap/top10.json';
  const prior=JSON.parse(await readFile(filename,'utf8'));
  if(!Array.isArray(prior.rows)||!prior.generated_at)throw new Error('No valid bootstrap artifact');
  console.log('[catalog-bootstrap] upstream unavailable; kept snapshot '+prior.generated_at);
 }
}

