import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KISSKH_BASES = (Deno.env.get('KISSKH_API_BASES') ?? Deno.env.get('KISSKH_API_BASE') ?? 'https://kisskh.la,https://kisskh.ovh,https://kisskh.co,https://kisskh.ws').split(',').map((value)=>value.trim().replace(/\/+$/, '')).filter(Boolean);
const PRIMARY_KISSKH_BASE = KISSKH_BASES[0] ?? 'https://kisskh.la';
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  };
}
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json'
    }
  });
}
function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/[^a-z0-9\s-]/g, ' ').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}
function normalizeTitle(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().replace(/\s+/g, ' ');
}
function getArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value;
    for (const key of [
      'items',
      'data',
      'results',
      'movies'
    ]){
      if (Array.isArray(record[key])) return record[key];
    }
  }
  return [];
}
function yearFromDate(value) {
  const match = String(value || '').match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}
function episodeLabel(count) {
  if (count <= 0) return 'Trailer';
  return `Tap ${count}`;
}
function scheduleFromLabel(label) {
  const text = String(label || '').trim();
  return /coming|unlock|ep|next|air|schedule|jun|jul|aug|sep|oct|nov|dec|jan|feb|mar|apr|may/i.test(text) ? text : '';
}
async function fetchJson(url, timeoutMs = 12000) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${new URL(url).origin}/`,
      'User-Agent': 'Mozilla/5.0 mhophim-fast-sync'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return await res.json();
}
async function fetchKissKh(path) {
  const errors = [];
  for (const base of KISSKH_BASES){
    try {
      return await fetchJson(`${base}${path}`);
    } catch (err) {
      errors.push(`${base}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All KissKH bases failed for ${path}: ${errors.join(' | ')}`);
}
function buildMoviePayload(item) {
  const id = String(item.id || '').trim();
  const title = String(item.title || `KissKH ${id}`).trim();
  const slug = slugify(title || `kisskh-${id}`);
  const episodesCount = Math.max(0, Number(item.episodesCount || 0) || 0);
  const image = String(item.thumbnail || '').trim();
  const country = String(item.country || '').trim() || 'Khac';
  const category = [
    'Phim bo',
    'BL / GL',
    'Dam my'
  ].map((name)=>({
      id: slugify(name),
      name,
      slug: slugify(name)
    }));
  return {
    slug,
    name: title,
    origin_name: title,
    title_en: title,
    title_original: title,
    normalized_name: normalizeTitle(title),
    content: '',
    type: String(item.type || '').toLowerCase().includes('movie') ? 'phim-le' : 'phim-bo',
    status: 'ongoing',
    thumb_url: image,
    poster_url: image,
    backdrop_url: image,
    quality: 'HD',
    lang: 'Vietsub',
    time: '',
    episode_current: episodeLabel(episodesCount),
    episode_total: episodesCount > 0 ? String(episodesCount) : '',
    year: yearFromDate(String(item.releaseDate || '')),
    actor: [],
    director: [],
    category,
    country: [
      {
        id: slugify(country),
        name: country,
        slug: slugify(country)
      }
    ],
    trailer_url: '',
    notify: String(item.label || ''),
    showtimes: scheduleFromLabel(item.label),
    source_url: `${PRIMARY_KISSKH_BASE}/Drama/${id}`,
    source_site: 'kisskh',
    source_name: 'KissKH metadata',
    is_published: true,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
async function findExistingMovie(supabase, sourceId, slug) {
  if (sourceId) {
    const { data: mapped } = await supabase.from('movie_sources').select('movie_id').eq('source_site', 'kisskh').eq('source_movie_id', sourceId).eq('is_active', true).limit(1).maybeSingle();
    if (mapped?.movie_id) {
      const { data } = await supabase.from('movies').select('id,slug').eq('id', mapped.movie_id).maybeSingle();
      if (data) return data;
    }
  }
  const { data } = await supabase.from('movies').select('id,slug').eq('slug', slug).maybeSingle();
  return data;
}
async function upsertMovie(supabase, item) {
  const sourceId = String(item.id || '').trim();
  const payload = buildMoviePayload(item);
  const existing = await findExistingMovie(supabase, sourceId, String(payload.slug));
  if (existing?.id) {
    const { data, error } = await supabase.from('movies').update({
      notify: payload.notify,
      showtimes: payload.showtimes,
      episode_current: payload.episode_current,
      episode_total: payload.episode_total,
      thumb_url: payload.thumb_url,
      poster_url: payload.poster_url,
      backdrop_url: payload.backdrop_url,
      source_site: 'kisskh',
      source_name: 'KissKH metadata',
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', existing.id).select('id,slug').single();
    if (error) throw new Error(`movies update ${payload.slug}: ${error.message}`);
    await upsertMovieSource(supabase, String(data.id), String(data.slug), sourceId);
    return {
      movieId: String(data.id),
      slug: String(data.slug),
      created: false,
      updated: true
    };
  }
  const { data, error } = await supabase.from('movies').insert(payload).select('id,slug').single();
  if (error) throw new Error(`movies insert ${payload.slug}: ${error.message}`);
  await upsertMovieSource(supabase, String(data.id), String(data.slug), sourceId);
  return {
    movieId: String(data.id),
    slug: String(data.slug),
    created: true,
    updated: false
  };
}
async function upsertMovieSource(supabase, movieId, slug, sourceId) {
  if (!sourceId) return;
  const payload = {
    movie_id: movieId,
    source_site: 'kisskh',
    source_name: 'KissKH metadata',
    source_slug: slug,
    source_movie_id: sourceId,
    source_url: `${PRIMARY_KISSKH_BASE}/Drama/${sourceId}`,
    priority: 50,
    is_active: true,
    status: 'metadata-fast-backfill',
    updated_at: new Date().toISOString()
  };
  const { data: existing } = await supabase.from('movie_sources').select('id').eq('source_site', 'kisskh').eq('source_movie_id', sourceId).limit(1).maybeSingle();
  if (existing?.id) await supabase.from('movie_sources').update(payload).eq('id', existing.id);
  else await supabase.from('movie_sources').insert(payload);
}
async function upsertSyntheticEpisodes(supabase, movieId, count) {
  let upserted = 0;
  for(let episodeNumber = 1; episodeNumber <= count; episodeNumber++){
    const { data: existing } = await supabase.from('movie_episodes').select('id').eq('movie_id', movieId).eq('source', 'kisskh').eq('episode_number', episodeNumber).limit(1).maybeSingle();
    const payload = {
      movie_id: movieId,
      episode_number: episodeNumber,
      episode_name: `Tap ${episodeNumber}`,
      slug: `tap-${episodeNumber}`,
      server_name: 'KissKH Schedule',
      link_m3u8: '',
      link_embed: '',
      subtitle_url: '',
      thumbnail_url: '',
      duration: '',
      source: 'kisskh',
      is_backup: false,
      updated_at: new Date().toISOString()
    };
    if (existing?.id) {
      await supabase.from('movie_episodes').update({
        episode_name: payload.episode_name,
        slug: payload.slug,
        server_name: payload.server_name,
        updated_at: payload.updated_at
      }).eq('id', existing.id);
    } else {
      await supabase.from('movie_episodes').insert(payload);
    }
    upserted++;
  }
  return upserted;
}
async function logSync(supabase, payload) {
  await supabase.from('sync_logs').insert({
    function_name: 'kisskh-fast-library-sync',
    run_at: new Date().toISOString(),
    scanned: payload.scanned ?? 0,
    added: payload.added ?? 0,
    updated: payload.updated ?? 0,
    skipped: payload.skipped ?? 0,
    errors: payload.errors ?? 0,
    details: payload.details ?? [],
    elapsed_ms: payload.elapsed_ms ?? 0,
    success: payload.success ?? false
  }).catch(()=>undefined);
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders()
  });
  const start = Date.now();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({
    success: false,
    error: 'Missing Supabase service configuration'
  }, 500);
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pages = Math.max(1, Math.min(20, Number(url.searchParams.get('pages') ?? 1) || 1));
  const type = String(url.searchParams.get('type') ?? '0');
  const sub = String(url.searchParams.get('sub') ?? '0');
  const country = String(url.searchParams.get('country') ?? url.searchParams.get('c') ?? '0');
  const status = String(url.searchParams.get('status') ?? '0');
  const order = String(url.searchParams.get('order') ?? '2');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
  let scanned = 0;
  let added = 0;
  let updated = 0;
  let episodes = 0;
  let skipped = 0;
  const details = [];
  try {
    const list = [];
    const seen = new Set();
    for(let currentPage = page; currentPage < page + pages; currentPage++){
      const path = `/api/DramaList/List?page=${currentPage}&type=${encodeURIComponent(type)}&sub=${encodeURIComponent(sub)}&country=${encodeURIComponent(country)}&status=${encodeURIComponent(status)}&order=${encodeURIComponent(order)}`;
      const pageItems = getArray(await fetchKissKh(path));
      if (pageItems.length === 0) break;
      for (const item of pageItems){
        const key = String(item.id || item.title || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        list.push(item);
      }
      await new Promise((resolve)=>setTimeout(resolve, 120));
    }
    scanned = list.length;
    for (const item of list){
      try {
        if (!item.id && !item.title) {
          skipped++;
          continue;
        }
        const result = await upsertMovie(supabase, item);
        if (result.created) added++;
        if (result.updated) updated++;
        episodes += await upsertSyntheticEpisodes(supabase, result.movieId, Math.max(0, Number(item.episodesCount || 0) || 0));
      } catch (err) {
        details.push(`[${item.title || item.id}] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await supabase.from('home_page_cache').delete().neq('id', '__never__');
    const payload = {
      success: details.length === 0,
      scanned,
      added,
      updated,
      episodes_upserted: episodes,
      skipped,
      errors: details.length,
      details,
      page,
      pages,
      elapsed_ms: Date.now() - start
    };
    await logSync(supabase, payload);
    return jsonResponse(payload);
  } catch (err) {
    const payload = {
      success: false,
      scanned,
      added,
      updated,
      skipped,
      errors: details.length + 1,
      details: [
        err instanceof Error ? err.message : String(err),
        ...details
      ],
      elapsed_ms: Date.now() - start
    };
    await logSync(supabase, payload);
    return jsonResponse(payload, 500);
  }
});
