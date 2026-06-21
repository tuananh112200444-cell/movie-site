#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SOURCE_SITE = 'blvietsub';

function loadEnv() {
  try {
    const env = readFileSync('.env', 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  } catch {
    // Environment variables may already be provided by the shell.
  }
}

function arg(name, fallback = '') {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;|&apos;/g, "'");
}

function attr(tag = '', name = '') {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(tag.match(new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '').trim();
}

function isBlvietsubWatchUrl(url = '') {
  const raw = String(url || '').replace(/&amp;/g, '&').trim();
  try {
    const parsed = new URL(raw);
    return /(^|\.)blvietsub\.com$/i.test(parsed.hostname) && /\/+xem-phim\//i.test(parsed.pathname);
  } catch {
    return /blvietsub\.com\/+xem-phim\//i.test(raw);
  }
}

function pickPlayable(html = '', episodeNumber = 0) {
  const tags = [...html.matchAll(/<[^>]+class=["'][^"']*\bstreaming-server\b[^"']*["'][^>]*>/gi)]
    .map((match) => match[0]);
  const tag = tags.find((candidate) => Number(attr(candidate, 'data-id').match(/\d+/)?.[0] || 0) === episodeNumber) || tags[0] || '';
  const link = attr(tag, 'data-link');
  if (!link || isBlvietsubWatchUrl(link)) return null;
  try {
    new URL(link);
  } catch {
    return null;
  }
  const type = attr(tag, 'data-type').toLowerCase();
  const isHls = type === 'm3u8' || /\.m3u8(?:[?#].*)?$/i.test(link);
  return {
    link_embed: isHls ? '' : link,
    link_m3u8: isHls ? link : '',
  };
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit);
    results.push(...await Promise.all(batch.map(mapper)));
  }
  return results;
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL/VITE_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY');
}

const batchSize = Math.max(1, Math.min(Number(arg('batch-size', '250')) || 250, 500));
const maxBatches = Math.max(1, Number(arg('max-batches', '20')) || 20);
const concurrency = Math.max(1, Math.min(Number(arg('concurrency', '8')) || 8, 12));
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

let totalScanned = 0;
let totalRepaired = 0;
let totalUnresolved = 0;
const unresolvedSamples = [];

for (let batchNumber = 1; batchNumber <= maxBatches; batchNumber += 1) {
  const { data: rows, error } = await supabase
    .from('movie_episodes')
    .select('id, episode_number, link_embed')
    .eq('source', SOURCE_SITE)
    .ilike('link_embed', '%blvietsub.com%xem-phim%')
    .order('id', { ascending: true })
    .limit(batchSize);
  if (error) throw new Error(`select bad embeds: ${error.message}`);
  if (!rows?.length) break;

  totalScanned += rows.length;
  let batchRepaired = 0;
  let batchUnresolved = 0;

  await mapLimit(rows, concurrency, async (row) => {
    const id = Number(row.id || 0);
    const episodeNumber = Number(row.episode_number || 0);
    const watchUrl = String(row.link_embed || '').replace(/&amp;/g, '&').trim();
    if (!id || !episodeNumber || !watchUrl) {
      batchUnresolved += 1;
      return;
    }
    try {
      const response = await fetch(watchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 KhoPhim-Repair/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
          'Referer': 'https://blvietsub.com/',
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) {
        batchUnresolved += 1;
        unresolvedSamples.push({ id, status: response.status });
        return;
      }
      const playable = pickPlayable(await response.text(), episodeNumber);
      if (!playable) {
        batchUnresolved += 1;
        unresolvedSamples.push({ id, reason: 'no playable data-link' });
        return;
      }
      const { error: updateError } = await supabase
        .from('movie_episodes')
        .update(playable)
        .eq('id', id);
      if (updateError) {
        batchUnresolved += 1;
        unresolvedSamples.push({ id, reason: updateError.message });
        return;
      }
      batchRepaired += 1;
    } catch (error) {
      batchUnresolved += 1;
      unresolvedSamples.push({ id, reason: error instanceof Error ? error.message : String(error) });
    }
  });

  totalRepaired += batchRepaired;
  totalUnresolved += batchUnresolved;

  const { count, error: countError } = await supabase
    .from('movie_episodes')
    .select('id', { count: 'exact', head: true })
    .eq('source', SOURCE_SITE)
    .ilike('link_embed', '%blvietsub.com%xem-phim%');
  if (countError) throw new Error(`count bad embeds: ${countError.message}`);

  console.log(JSON.stringify({
    batch: batchNumber,
    scanned: rows.length,
    repaired: batchRepaired,
    unresolved: batchUnresolved,
    remaining: count || 0,
  }));

  if (!count) break;
}

console.log(JSON.stringify({
  done: true,
  total_scanned: totalScanned,
  total_repaired: totalRepaired,
  total_unresolved: totalUnresolved,
  unresolved_sample: unresolvedSamples.slice(0, 20),
}, null, 2));
