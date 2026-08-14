import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BASES = (Deno.env.get('KISSKH_API_BASES') ?? Deno.env.get('KISSKH_API_BASE') ?? 'https://kisskh.la,https://kisskh.ovh,https://kisskh.co,https://kisskh.ws').split(',').map((v)=>v.trim().replace(/\/+$/, '')).filter(Boolean);
const PRIMARY = BASES[0] ?? 'https://kisskh.la';
function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  };
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers(),
      'Content-Type': 'application/json'
    }
  });
}
function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/[^a-z0-9\s-]/g, ' ').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}
function norm(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'd').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().replace(/\s+/g, ' ');
}
function arr(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const r = value;
    for (const k of [
      'items',
      'data',
      'results',
      'movies'
    ])if (Array.isArray(r[k])) return r[k];
  }
  return [];
}
function year(value) {
  const m = String(value || '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : 0;
}
function schedule(label) {
  const s = String(label || '').trim();
  return /coming|unlock|ep|next|air|schedule|jun|jul|aug|sep|oct|nov|dec|jan|feb|mar|apr|may/i.test(s) ? s : '';
}
async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${new URL(url).origin}/`,
      'User-Agent': 'Mozilla/5.0 mhophim-fast-movie-sync'
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return await res.json();
}
async function fetchKiss(path) {
  const errors = [];
  for (const base of BASES){
    try {
      return await fetchJson(`${base}${path}`);
    } catch (e) {
      errors.push(`${base}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`All KissKH bases failed for ${path}: ${errors.join(' | ')}`);
}
function moviePayload(item) {
  const id = String(item.id || '').trim();
  const title = String(item.title || `KissKH ${id}`).trim();
  const slug = slugify(title || `kisskh-${id}`);
  const count = Math.max(0, Number(item.episodesCount || 0) || 0);
  const image = String(item.thumbnail || '').trim();
  const cats = [
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
    normalized_name: norm(title),
    content: '',
    type: 'phim-bo',
    status: 'ongoing',
    thumb_url: image,
    poster_url: image,
    backdrop_url: image,
    quality: 'HD',
    lang: 'Vietsub',
    time: '',
    episode_current: count > 0 ? `Tap ${count}` : 'Trailer',
    episode_total: count > 0 ? String(count) : '',
    year: year(item.releaseDate),
    actor: [],
    director: [],
    category: cats,
    country: [
      {
        id: 'khac',
        name: 'Khac',
        slug: 'khac'
      }
    ],
    trailer_url: '',
    notify: String(item.label || ''),
    showtimes: schedule(item.label),
    source_url: `${PRIMARY}/Drama/${id}`,
    source_site: 'kisskh',
    source_name: 'KissKH metadata',
    is_published: true,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: headers()
  });
  const started = Date.now();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({
    success: false,
    error: 'Missing Supabase service configuration'
  }, 500);
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pages = Math.max(1, Math.min(10, Number(url.searchParams.get('pages') ?? 1) || 1));
  const limit = Math.max(1, Math.min(20, Number(url.searchParams.get('limit') ?? 5) || 5));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  const type = encodeURIComponent(String(url.searchParams.get('type') ?? '0'));
  const sub = encodeURIComponent(String(url.searchParams.get('sub') ?? '0'));
  const country = encodeURIComponent(String(url.searchParams.get('country') ?? url.searchParams.get('c') ?? '0'));
  const status = encodeURIComponent(String(url.searchParams.get('status') ?? '0'));
  const order = encodeURIComponent(String(url.searchParams.get('order') ?? '2'));
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
  let scanned = 0, added = 0, updated = 0, errors = 0;
  const details = [];
  try {
    const items = [];
    for(let p = page; p < page + pages; p++){
      const data = await fetchKiss(`/api/DramaList/List?page=${p}&type=${type}&sub=${sub}&country=${country}&status=${status}&order=${order}`);
      const rows = arr(data).slice(offset, offset + limit);
      items.push(...rows);
      await new Promise((r)=>setTimeout(r, 100));
    }
    scanned = items.length;
    for (const item of items){
      try {
        const payload = moviePayload(item);
        const { data, error } = await supabase.from('movies').upsert(payload, {
          onConflict: 'slug'
        }).select('id,slug').single();
        if (error) throw error;
        if (data?.id) {
          const sourceId = String(item.id || '');
          const source = {
            movie_id: data.id,
            source_site: 'kisskh',
            source_name: 'KissKH metadata',
            source_slug: data.slug,
            source_movie_id: sourceId,
            source_url: `${PRIMARY}/Drama/${sourceId}`,
            priority: 50,
            is_active: true,
            status: 'metadata-fast-movie',
            updated_at: new Date().toISOString()
          };
          const { data: found } = await supabase.from('movie_sources').select('id').eq('source_site', 'kisskh').eq('source_movie_id', sourceId).limit(1).maybeSingle();
          if (found?.id) await supabase.from('movie_sources').update(source).eq('id', found.id);
          else await supabase.from('movie_sources').insert(source);
        }
        updated++;
      } catch (e) {
        errors++;
        details.push(`[${item.title || item.id}] ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await supabase.from('home_page_cache').delete().neq('id', '__never__');
    return json({
      success: errors === 0,
      scanned,
      added,
      updated,
      errors,
      details,
      page,
      pages,
      limit,
      offset,
      elapsed_ms: Date.now() - started
    });
  } catch (e) {
    return json({
      success: false,
      scanned,
      added,
      updated,
      errors: errors + 1,
      details: [
        e instanceof Error ? e.message : String(e),
        ...details
      ],
      elapsed_ms: Date.now() - started
    }, 500);
  }
});
