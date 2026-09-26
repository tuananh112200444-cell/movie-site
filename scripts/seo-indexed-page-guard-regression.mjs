import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('supabase/functions/_shared/seo-indexed-page-guard.ts','utf8');
const output = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText;
const guard = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const now = new Date('2026-09-26T00:00:00Z');
const common = {
  slug:'phim-kiem-thu',
  aliases:['Phim Kiểm Thử','Test Movie'],
  profileUpdatedAt:'2026-08-20T00:00:00Z',
  inspection:{
    verdict:'PASS',last_crawl_time:'2026-08-25T00:00:00Z',inspected_at:'2026-08-26T00:00:00Z',
    user_canonical:'https://khophim.org/phim/phim-kiem-thu',google_canonical:'https://khophim.org/phim/phim-kiem-thu',
  },
  queryMetrics:[{query:'xem phim kiểm thử',impressions:300,collected_at:'2026-09-24T00:00:00Z'}],
  now,
};

const healthy = guard.buildIndexedSeoDecision({...common,pageMetric:{impressions:500,clicks:25,ctr:0.05,position:4}});
assert.equal(healthy.status,'healthy');
assert.ok(healthy.protected_fields.includes('seo_title'));
assert.ok(!healthy.editable_fields.includes('seo_title'));
assert.equal(healthy.observation.age_days,32);
assert.ok(healthy.observation.decision_check_at);

const insufficient = guard.buildIndexedSeoDecision({...common,pageMetric:{impressions:20,clicks:1,ctr:0.05,position:5}});
assert.equal(insufficient.status,'insufficient_data');
assert.ok(!insufficient.editable_fields.includes('seo_title'));

const lowCtr = guard.buildIndexedSeoDecision({...common,pageMetric:{impressions:500,clicks:2,ctr:0.004,position:5}});
assert.equal(lowCtr.status,'low_ctr');
assert.ok(lowCtr.editable_fields.includes('seo_title'));
assert.ok(lowCtr.protected_fields.includes('focus_keyword'));

const lowPosition = guard.buildIndexedSeoDecision({...common,pageMetric:{impressions:500,clicks:3,ctr:0.006,position:18}});
assert.equal(lowPosition.status,'low_position');
assert.ok(lowPosition.editable_fields.includes('intro_content'));
assert.ok(!lowPosition.editable_fields.includes('seo_title'));

const wrongQuery = guard.buildIndexedSeoDecision({...common,
  pageMetric:{impressions:500,clicks:2,ctr:0.004,position:8},
  queryMetrics:[{query:'xem phim online',impressions:300,collected_at:'2026-09-24T00:00:00Z'}],
});
assert.equal(wrongQuery.status,'wrong_query');
assert.ok(wrongQuery.editable_fields.includes('seo_title'));
assert.ok(!wrongQuery.editable_fields.includes('focus_keyword'));

const awaiting = guard.buildIndexedSeoDecision({...common,
  profileUpdatedAt:'2026-09-20T00:00:00Z',
  inspection:{...common.inspection,last_crawl_time:'2026-09-10T00:00:00Z'},
  pageMetric:{impressions:500,clicks:20,ctr:0.04,position:4},
});
assert.equal(awaiting.status,'awaiting_recrawl');
assert.equal(awaiting.observation.started_at,null);

const canonical = guard.buildIndexedSeoDecision({...common,
  inspection:{...common.inspection,google_canonical:'https://khophim.org/phim/phim-khac'},
  pageMetric:{impressions:500,clicks:20,ctr:0.04,position:4},
});
assert.equal(canonical.status,'canonical_mismatch');
assert.equal(canonical.editable_fields.length,0);

const crawledNotIndexed = guard.buildIndexedSeoDecision({...common,
  inspection:{verdict:'NEUTRAL',coverage_state:'Crawled - currently not indexed',last_crawl_time:'2026-09-20T00:00:00Z'},
  pageMetric:{impressions:0,clicks:0,ctr:0,position:0},
});
assert.equal(crawledNotIndexed.status,'not_indexed');
assert.ok(crawledNotIndexed.editable_fields.includes('review_content'));

console.log('Indexed-page SEO guard regression passed: evidence locks, recrawl timing, and 7/14/28-day evaluation.');
