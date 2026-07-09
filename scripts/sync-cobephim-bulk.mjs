#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeSupabaseClient, runCobephimSync } from './cobephim-sync-core.mjs';

function getArg(name, fallback = '') {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function readState(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(path, state) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

const dryRun = process.argv.includes('--dry-run');
const reset = process.argv.includes('--reset');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const statePath = resolve(getArg('state', '.cobephim-sync-state.json'));
const startPage = Math.max(1, Number(getArg('start-page', '1')) || 1);
const startOffset = Math.max(0, Number(getArg('start-offset', '0')) || 0);
const endPage = Math.max(startPage, Number(getArg('end-page', '3089')) || 3089);
const batchSize = Math.max(1, Math.min(Number(getArg('batch-size', '10')) || 10, 50));
const maxBatches = Math.max(1, Number(getArg('max-batches', '5')) || 5);
const maxMs = Math.max(30_000, Number(getArg('max-ms', '240000')) || 240_000);

const previous = reset ? null : readState(statePath);
let page = Math.max(startPage, Number(previous?.next_page || startPage) || startPage);
let offset = Math.max(0, Number(previous?.next_offset ?? startOffset) || 0);
const supabase = dryRun ? null : makeSupabaseClient({ supabaseUrl, serviceRoleKey });

const started = Date.now();
const totals = {
  success: true,
  dry_run: dryRun,
  batches: 0,
  scanned: 0,
  parsed: 0,
  matched: 0,
  created: 0,
  episodes_inserted: 0,
  episodes_updated: 0,
  streams_inserted: 0,
  streams_updated: 0,
  skipped_unplayable: 0,
  errors: [],
  changed_slugs: [],
};

while (page <= endPage && totals.batches < maxBatches && Date.now() - started < maxMs) {
  const result = await runCobephimSync({
    supabase,
    sitemapPage: page,
    limit: batchSize,
    offset,
    dryRun,
  });

  totals.batches += 1;
  totals.scanned += result.scanned || 0;
  totals.parsed += result.parsed || 0;
  totals.matched += result.matched || 0;
  totals.created += result.created || 0;
  totals.episodes_inserted += result.episodes_inserted || 0;
  totals.episodes_updated += result.episodes_updated || 0;
  totals.streams_inserted += result.streams_inserted || 0;
  totals.streams_updated += result.streams_updated || 0;
  totals.skipped_unplayable += result.skipped_unplayable?.length || 0;
  totals.errors.push(...(result.errors || []));
  totals.changed_slugs.push(...(result.changed_slugs || []));

  const totalUrls = Number(result.total_urls || 0) || 0;
  offset += batchSize;
  if (!totalUrls || offset >= totalUrls) {
    page += 1;
    offset = 0;
  }

  writeState(statePath, {
    next_page: page,
    next_offset: offset,
    end_page: endPage,
    batch_size: batchSize,
    dry_run: dryRun,
    updated_at: new Date().toISOString(),
  });
}

totals.success = totals.errors.length === 0;
totals.next_page = page;
totals.next_offset = offset;
totals.elapsed_ms = Date.now() - started;
totals.changed_slugs = [...new Set(totals.changed_slugs)].slice(0, 100);

console.log(JSON.stringify(totals, null, 2));
process.exitCode = totals.success ? 0 : 1;
