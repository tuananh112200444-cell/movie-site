import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const worker=fs.readFileSync('functions/[[path]].js','utf8');
const begin=worker.indexOf('function normalizeNguoncProviderDetail(');
const end=worker.indexOf('\nfunction scoreProviderDetail(',begin);
assert.ok(begin>0&&end>begin);
const context={URL,hasPlayableProviderDetail:(d,slug)=>d.movie.slug===slug&&d.episodes.some(s=>s.server_data.some(e=>e.link_embed||e.link_m3u8))};
vm.createContext(context);vm.runInContext(worker.slice(begin,end),context);
const fixture={status:'success',movie:{id:'provider-id',slug:'ga-kim-thoa',name:'Gả Kim Thoa',original_name:'Where the Mask Ends',current_episode:'Tập 4',total_episodes:33,description:'Story',casts:'A, B',director:'Yang Long',
 category:{1:{group:{name:'Định dạng'},list:[{name:'Phim bộ'}]},2:{group:{name:'Thể loại'},list:[{id:'drama',name:'Chính kịch'}]},3:{group:{name:'Quốc gia'},list:[{id:'cn',name:'Trung Quốc'}]}},
 tmdb:{id:300146,type:'tv',season:1},imdb:{id:'tt42576855'},episodes:['Vietsub #1','Thuyết minh #1'].map(server_name=>({server_name,items:Array.from({length:4},(_,i)=>({name:String(i+1),slug:`tap-${i+1}`,embed:`https://embed14.streamc.xyz/embed.php?hash=${i}`}))}))}};
const normalized=context.normalizeNguoncProviderDetail(fixture,'ga-kim-thoa');
assert.equal(normalized.movie._id,'provider-id');assert.equal(normalized.movie.origin_name,'Where the Mask Ends');
assert.equal(normalized.movie.current_episode,4);assert.equal(normalized.movie.type,'series');assert.equal(normalized.movie.status,'ongoing');
assert.equal(normalized.movie.category[0].slug,'chinh-kich');assert.equal(normalized.movie.country[0].slug,'trung-quoc');
assert.equal(normalized.movie.director[0],'Yang Long');assert.equal(normalized.movie.actor.length,2);
assert.equal(normalized.movie.tmdb_id,300146);assert.equal(normalized.episodes.length,2);
assert.equal(normalized.episodes.reduce((n,s)=>n+s.server_data.length,0),8);
assert.equal(context.normalizeNguoncProviderDetail(fixture,'another-film'),null);
assert.equal(context.normalizeNguoncProviderDetail({status:'error'},'ga-kim-thoa'),null);
// The previous response threw here in the detail classification/render path.
assert.doesNotThrow(()=>normalized.movie.category.map(c=>c.name));
assert.doesNotThrow(()=>normalized.movie.director.filter(Boolean));

const gap=fs.readFileSync('supabase/functions/sync-gap-playback-providers/index.ts','utf8');
const probe=gap.slice(gap.indexOf('async function probeMatch('),gap.indexOf('\nfunction streamKey('));
const js=ts.transpileModule(probe,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let status=403;
const ctx={URL,AbortSignal,fetch:async()=>new Response('',{status}),Response};
vm.createContext(ctx);vm.runInContext(js,ctx);
const match={provider:'nguonc',episodes:[{embed:'https://embed14.streamc.xyz/embed.php?hash=x'}]};
for(const code of [401,403]){status=code;const p=await ctx.probeMatch(match);assert.equal(p.ok,false);assert.equal(p.inconclusive,true);}
for(const code of [404,410,500,429]){status=code;assert.equal((await ctx.probeMatch(match)).inconclusive,false);}
status=403;
assert.equal((await ctx.probeMatch({...match,provider:'vsmov'})).inconclusive,false);
assert.equal((await ctx.probeMatch({...match,episodes:[{embed:'https://embed14.streamc.xyz.attacker.example/embed.php'}]})).inconclusive,false);
assert.match(gap,/if \(!probe.ok && !probe.inconclusive\)/);
assert.match(gap,/health_status: 'unchecked'/);
assert.match(gap,/state: probe.inconclusive \|\| persisted.streams > 0 \? 'pending' : 'ready'/);
console.log('NguonC integration passed: UI metadata types, both audio servers, episode counts, external IDs, mismatch rejection, narrow 403 handling and unchecked persistence.');
