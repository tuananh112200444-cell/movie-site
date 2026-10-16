import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const file=process.argv[2]||'supabase/functions/stream-health-check/index.ts';
const source=fs.readFileSync(file,'utf8').replace('async function probe(url:', 'export async function probe(url:');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
async function probe(segment,status=206,type='video/mp2t'){
 const context={exports:{},URL,Response,AbortController,TextDecoder,setTimeout,clearTimeout,
  require:name=>name.includes('http/server')?{serve:()=>{}}:name.includes('supabase-js')?{}:{isInconclusiveKkphimProbe:()=>false},
  fetch:async url=>url.endsWith('index.m3u8')?new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nmedia.m3u8'):
   url.endsWith('media.m3u8')?new Response('#EXTM3U\n#EXTINF:2,\nsegment.ts'):
   new Response(segment,{status,headers:{'Content-Type':type}}),
 };
 vm.runInNewContext(compiled.outputText,context);
 return context.exports.probe('https://example.test/index.m3u8');
}
assert.equal((await probe(new Uint8Array(188).fill(71))).playbackProof,'hls-segment');
assert.equal((await probe('')).ok,false);
assert.equal((await probe('{"error":"expired"}'.padEnd(256))).ok,false);
assert.equal((await probe('<html>Access denied</html>'.padEnd(256))).ok,false);
assert.equal((await probe(new Uint8Array(188),404)).ok,false);
assert.equal((await probe(new Uint8Array(188),200,'application/json')).ok,false);
console.log('Media proof passed: real segment bytes, empty body, disguised JSON/HTML, 404, JSON content type.');
