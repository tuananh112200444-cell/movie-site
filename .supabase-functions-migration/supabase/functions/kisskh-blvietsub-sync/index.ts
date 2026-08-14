import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const KISSKH_BASES = (Deno.env.get('KISSKH_API_BASES') ?? Deno.env.get('KISSKH_API_BASE') ?? 'https://kisskh.la,https://kisskh.ovh,https://kisskh.co,https://kisskh.ws').split(',').map((value)=>value.trim().replace(/\/+$/, '')).filter(Boolean);
const PRIMARY_KISSKH_BASE = KISSKH_BASES[0] ?? 'https://kisskh.la';
const BLVIETSUB_BASE = (Deno.env.get('BLVIETSUB_API_BASE') ?? '').replace(/\/+$/, '');
const BLVIETSUB_SEARCH_PATH = Deno.env.get('BLVIETSUB_SEARCH_PATH') ?? '/api/search?q={query}';
const BLVIETSUB_DETAIL_PATH = Deno.env.get('BLVIETSUB_DETAIL_PATH') ?? '/api/movie/{id}';
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
function yearFromDate(value) {
  const match = String(value || '').match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}
function typeFromKissKh(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('movie')) return 'phim-le';
  return 'phim-bo';
}
function statusFromKissKh(status, episodesCount = 0) {
  const text = String(status || '').toLowerCase();
  if (text.includes('complete') || text.includes('end')) return 'completed';
  if (text.includes('upcoming') || text.includes('coming') || episodesCount === 0) return 'ongoing';
  return 'ongoing';
}
function episodeLabel(count, status) {
  if (count <= 0) return status === 'completed' ? 'Full' : 'Trailer';
  return `Tap ${count}`;
}
function parseKissKhDate(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '0') return '';
  if (/^\d{13}$/.test(raw)) {
    const date = new Date(Number(raw));
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }
  if (/^\d{10}$/.test(raw)) {
    const date = new Date(Number(raw) * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?$/);
  if (compact) {
    const [, y, m, d, hh = '00', mm = '00', ss = '00'] = compact;
    const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`);
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}
function getKissKhSchedule(detail) {
  const nextDate = parseKissKhDate(detail.nextEpDateID);
  if (nextDate) return nextDate;
  const label = String(detail.label || '').trim();
  if (label && /coming|unlock|ep|next|air|schedule/i.test(label)) return label;
  return parseKissKhDate(detail.releaseDate);
}
function categoryFromKissKh(detail) {
  const base = [
    'Phim bo',
    'BL / GL',
    'Dam my'
  ];
  if (String(detail.country || '').toLowerCase().includes('thailand')) base.push('Phim Thai');
  return Array.from(new Set(base)).map((name)=>({
      id: slugify(name),
      name,
      slug: slugify(name)
    }));
}
function countryFromKissKh(country) {
  const name = String(country || '').trim() || 'Khac';
  return [
    {
      id: slugify(name),
      name,
      slug: slugify(name)
    }
  ];
}
function bestImage(detail) {
  return String(detail.thumbnail || '').trim();
}
async function fetchJson(url, timeoutMs = 12000) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: `${new URL(url).origin}/`,
      'User-Agent': 'Mozilla/5.0 mhophim-sync'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return await res.json();
}
async function fetchKissKhList(params) {
  const path = getKissKhListPath(params);
  const payload = await fetchKissKhJson(path);
  return getArray(payload).slice(0, params.limit);
}
function normalizeKissKhMode(value) {
  const mode = value.trim().toLowerCase().replace(/_/g, '-');
  if (mode === 'search') return 'search';
  if (mode === 'show') return 'show';
  if (mode === 'upcoming') return 'upcoming';
  if (mode === 'most-search' || mode === 'mostsearch') return 'most-search';
  if (mode === 'top-rating' || mode === 'toprating') return 'top-rating';
  if (mode === 'most-view' || mode === 'mostview') return 'most-view';
  if (mode === 'library' || mode === 'list' || mode === 'explore') return 'library';
  return 'last-update';
}
function getKissKhListPath(params) {
  const mode = normalizeKissKhMode(params.mode);
  const q = params.query.trim();
  if (q || mode === 'search') return `/api/DramaList/Search?q=${encodeURIComponent(q)}&type=0`;
  if (mode === 'library') {
    const page = Math.max(1, Number(params.page || 1) || 1);
    const type = encodeURIComponent(params.type || '0');
    const sub = encodeURIComponent(params.sub || '0');
    const country = encodeURIComponent(params.country || '0');
    const status = encodeURIComponent(params.status || '0');
    const order = encodeURIComponent(params.order || '2');
    return `/api/DramaList/List?page=${page}&type=${type}&sub=${sub}&country=${country}&status=${status}&order=${order}`;
  }
  if (mode === 'show') return '/api/DramaList/Show';
  if (mode === 'upcoming') return '/api/DramaList/Upcoming?ispc=true';
  if (mode === 'most-search') return '/api/DramaList/MostSearch?ispc=true';
  if (mode === 'top-rating') return '/api/DramaList/TopRating?ispc=true';
  if (mode === 'most-view') return `/api/DramaList/MostView?ispc=true&c=${encodeURIComponent(params.country || '1')}`;
  return '/api/DramaList/LastUpdate?ispc=true';
}
async function fetchKissKhDetail(id) {
  return await fetchKissKhJson(`/api/DramaList/Drama/${encodeURIComponent(String(id))}?isq=false`);
}
async function fetchKissKhJson(path) {
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
function buildMoviePayload(detail) {
  const title = String(detail.title || '').trim();
  const slug = slugify(title || `kisskh-${detail.id}`);
  const episodesCount = Number(detail.episodesCount || detail.episodes?.length || 0);
  const status = statusFromKissKh(detail.status, episodesCount);
  const releaseYear = yearFromDate(detail.releaseDate);
  const image = bestImage(detail);
  const label = String(detail.label || '').trim();
  const showtimes = getKissKhSchedule(detail);
  return {
    slug,
    name: title,
    origin_name: title,
    title_en: title,
    title_original: title,
    normalized_name: normalizeTitle(title),
    content: String(detail.description || '').trim(),
    type: typeFromKissKh(detail.type),
    status,
    thumb_url: image,
    poster_url: image,
    backdrop_url: image,
    quality: 'HD',
    lang: 'Vietsub',
    time: '',
    episode_current: episodeLabel(episodesCount, status),
    episode_total: episodesCount > 0 ? String(episodesCount) : '',
    year: releaseYear,
    actor: [],
    director: [],
    category: categoryFromKissKh(detail),
    country: countryFromKissKh(detail.country),
    trailer_url: String(detail.trailer || ''),
    notify: label,
    showtimes,
    source_url: `${PRIMARY_KISSKH_BASE}/Drama/${detail.id}`,
    source_site: 'kisskh',
    source_name: 'KissKH metadata',
    is_published: true,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
function buildClientMovie(detail) {
  const payload = buildMoviePayload(detail);
  return {
    _id: String(detail.id || payload.slug || ''),
    slug: payload.slug,
    name: payload.name,
    origin_name: payload.origin_name,
    title_en: payload.title_en,
    title_original: payload.title_original,
    content: payload.content,
    type: payload.type,
    status: payload.status,
    thumb_url: payload.thumb_url,
    poster_url: payload.poster_url,
    quality: payload.quality,
    lang: payload.lang,
    time: payload.time,
    episode_current: payload.episode_current,
    episode_total: payload.episode_total,
    year: payload.year,
    category: payload.category,
    country: payload.country,
    trailer_url: payload.trailer_url,
    notify: payload.notify,
    showtimes: payload.showtimes,
    source_url: payload.source_url,
    source_site: 'kisskh',
    source_name: 'KissKH metadata',
    modified: {
      time: payload.updated_at
    },
    episodes: detail.episodes ?? [],
    kisskh_id: detail.id
  };
}
async function fetchKissKhClientMovies(params) {
  const list = await fetchKissKhList(params);
  const movies = [];
  for (const item of list){
    if (!item.id) continue;
    try {
      const detail = params.includeDetails ? await fetchKissKhDetail(item.id) : {
        ...item,
        episodesCount: item.episodesCount ?? 0
      };
      movies.push(buildClientMovie(detail));
      await new Promise((resolve)=>setTimeout(resolve, 120));
    } catch  {
      movies.push(buildClientMovie({
        ...item,
        episodesCount: item.episodesCount ?? 0
      }));
    }
  }
  return movies;
}
async function findExistingMovie(supabase, detail, payload) {
  const sourceId = String(detail.id || '').trim();
  if (sourceId) {
    const { data: mapped } = await supabase.from('movie_sources').select('movie_id').eq('source_site', 'kisskh').eq('source_movie_id', sourceId).eq('is_active', true).limit(1).maybeSingle();
    if (mapped?.movie_id) {
      const { data } = await supabase.from('movies').select('*').eq('id', mapped.movie_id).maybeSingle();
      if (data) return data;
    }
  }
  const slug = String(payload.slug || '');
  if (slug) {
    const { data } = await supabase.from('movies').select('*').eq('slug', slug).maybeSingle();
    if (data) return data;
  }
  const year = Number(payload.year || 0);
  const normalized = String(payload.normalized_name || '');
  if (normalized.length >= 3) {
    let query = supabase.from('movies').select('*').or(`normalized_name.eq.${normalized},name.ilike.%${String(payload.name || '').replace(/[%,]/g, ' ')}%,origin_name.ilike.%${String(payload.name || '').replace(/[%,]/g, ' ')}%`).limit(20);
    if (year > 0) query = query.eq('year', year);
    const { data } = await query;
    const match = (data ?? []).find((movie)=>{
      const movieYear = Number(movie.year || 0);
      if (year > 0 && movieYear > 0 && movieYear !== year) return false;
      return normalizeTitle(movie.name).includes(normalized) || normalized.includes(normalizeTitle(movie.name));
    });
    if (match) return match;
  }
  return null;
}
function mergeMetadata(existing, incoming) {
  const update = {
    last_synced_at: new Date().toISOString()
  };
  const fillOnly = [
    'origin_name',
    'title_en',
    'title_original',
    'content',
    'type',
    'thumb_url',
    'poster_url',
    'backdrop_url',
    'quality',
    'lang',
    'time',
    'year',
    'category',
    'country',
    'trailer_url'
  ];
  for (const key of fillOnly){
    const current = existing[key];
    const incomingValue = incoming[key];
    const currentEmpty = current === null || current === undefined || String(current).trim() === '' || String(current) === '[]';
    if (currentEmpty && incomingValue !== undefined && String(incomingValue).trim() !== '') update[key] = incomingValue;
  }
  for (const key of [
    'notify',
    'showtimes',
    'episode_current',
    'episode_total',
    'status'
  ]){
    if (incoming[key] !== undefined && String(incoming[key]).trim() !== '') update[key] = incoming[key];
  }
  update.updated_at = new Date().toISOString();
  return update;
}
async function upsertMovie(supabase, detail) {
  const payload = buildMoviePayload(detail);
  const existing = await findExistingMovie(supabase, detail, payload);
  if (existing?.id) {
    const update = mergeMetadata(existing, payload);
    const { data, error } = await supabase.from('movies').update(update).eq('id', existing.id).select('id,slug').single();
    if (error) throw new Error(`movies update ${payload.slug}: ${error.message}`);
    await upsertMovieSource(supabase, String(data.id), String(data.slug), detail);
    return {
      movieId: String(data.id),
      slug: String(data.slug),
      created: false,
      updated: true
    };
  }
  const { data, error } = await supabase.from('movies').insert(payload).select('id,slug').single();
  if (error) throw new Error(`movies insert ${payload.slug}: ${error.message}`);
  await upsertMovieSource(supabase, String(data.id), String(data.slug), detail);
  return {
    movieId: String(data.id),
    slug: String(data.slug),
    created: true,
    updated: false
  };
}
async function upsertMovieSource(supabase, movieId, slug, detail) {
  const sourceMovieId = String(detail.id || '');
  if (!sourceMovieId) return;
  const { data: existing } = await supabase.from('movie_sources').select('id').eq('movie_id', movieId).eq('source_site', 'kisskh').eq('source_movie_id', sourceMovieId).limit(1).maybeSingle();
  const payload = {
    movie_id: movieId,
    source_site: 'kisskh',
    source_name: 'KissKH metadata',
    source_slug: slug,
    source_movie_id: sourceMovieId,
    source_url: `${PRIMARY_KISSKH_BASE}/Drama/${sourceMovieId}`,
    priority: 50,
    is_active: true,
    status: 'metadata-with-episodes',
    updated_at: new Date().toISOString()
  };
  if (existing?.id) await supabase.from('movie_sources').update(payload).eq('id', existing.id);
  else await supabase.from('movie_sources').insert(payload);
}
function getArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value;
    for (const key of [
      'items',
      'data',
      'results',
      'movies',
      'episodes'
    ]){
      if (Array.isArray(record[key])) return record[key];
    }
  }
  return [];
}
function episodeNumberFrom(value, fallback = 0) {
  const record = value && typeof value === 'object' ? value : {};
  const raw = record.episode_number ?? record.number ?? record.episode ?? record.ep ?? record.name ?? record.title ?? fallback;
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) return Math.floor(num);
  const match = String(raw || '').match(/(\d+)/);
  return match ? Number(match[1]) : fallback;
}
function normalizeKissKhEpisodes(detail) {
  const explicitEpisodes = getArray(detail.episodes);
  const count = Math.max(0, Number(detail.episodesCount || explicitEpisodes.length || 0) || 0);
  const rows = explicitEpisodes.length > 0 ? explicitEpisodes : Array.from({
    length: count
  }, (_, index)=>({
      number: index + 1
    }));
  return rows.map((item, index)=>{
    const row = item && typeof item === 'object' ? item : {};
    const episodeNumber = episodeNumberFrom(row, index + 1);
    if (!episodeNumber) return null;
    const rawName = String(row.episodeName ?? row.episode_name ?? row.name ?? row.title ?? '').trim();
    const episodeName = rawName || `Tap ${episodeNumber}`;
    const slug = slugify(String(row.slug ?? row.episode_slug ?? (episodeName || `tap-${episodeNumber}`)));
    const schedule = parseKissKhDate(row.releaseDate ?? row.airDate ?? row.date ?? row.createdDate ?? row.updateDate);
    return {
      episodeNumber,
      episodeName,
      slug: slug || `tap-${episodeNumber}`,
      serverName: 'KissKH Schedule',
      linkM3u8: '',
      linkEmbed: '',
      subtitleUrl: '',
      thumbnailUrl: '',
      duration: schedule
    };
  }).filter((item)=>Boolean(item));
}
function normalizeBlvietsubEpisodes(payload) {
  return getArray(payload).map((item, index)=>{
    const row = item && typeof item === 'object' ? item : {};
    const episodeNumber = episodeNumberFrom(row, index + 1);
    const linkM3u8 = String(row.link_m3u8 ?? row.m3u8 ?? row.stream_url ?? row.streamUrl ?? '').trim();
    const linkEmbed = String(row.link_embed ?? row.embed_url ?? row.embedUrl ?? row.url ?? '').trim();
    if (!episodeNumber || !linkM3u8 && !linkEmbed) return null;
    return {
      episodeNumber,
      episodeName: String(row.episode_name ?? row.name ?? row.title ?? `Tap ${episodeNumber}`),
      slug: slugify(String(row.slug ?? row.episode_slug ?? `tap-${episodeNumber}`)),
      serverName: String(row.server_name ?? row.server ?? 'BLVietsub'),
      linkM3u8,
      linkEmbed,
      subtitleUrl: String(row.subtitle_url ?? row.subtitleUrl ?? ''),
      thumbnailUrl: String(row.thumbnail_url ?? row.thumbnail ?? ''),
      duration: String(row.duration ?? '')
    };
  }).filter((item)=>Boolean(item));
}
async function fetchBlvietsubEpisodes(title) {
  if (!BLVIETSUB_BASE) return [];
  const searchUrl = `${BLVIETSUB_BASE}${BLVIETSUB_SEARCH_PATH.replace('{query}', encodeURIComponent(title))}`;
  const searchPayload = await fetchJson(searchUrl).catch(()=>null);
  const first = getArray(searchPayload)[0];
  const detailId = first?.id ?? first?.slug ?? first?.movie_id ?? first?.url;
  let detailPayload = searchPayload;
  if (detailId) {
    const detailPath = BLVIETSUB_DETAIL_PATH.replace('{id}', encodeURIComponent(String(detailId))).replace('{slug}', encodeURIComponent(String(first?.slug ?? detailId)));
    detailPayload = await fetchJson(`${BLVIETSUB_BASE}${detailPath}`).catch(()=>searchPayload);
  }
  return normalizeBlvietsubEpisodes(detailPayload);
}
async function upsertKissKhEpisodes(supabase, movieId, episodes) {
  let upserted = 0;
  let skipped = 0;
  for (const ep of episodes){
    const { data: existing, error: findError } = await supabase.from('movie_episodes').select('id, link_m3u8, link_embed').eq('movie_id', movieId).eq('source', 'kisskh').eq('episode_number', ep.episodeNumber).limit(1).maybeSingle();
    if (findError) {
      skipped++;
      continue;
    }
    const payload = {
      movie_id: movieId,
      episode_number: ep.episodeNumber,
      episode_name: ep.episodeName,
      slug: ep.slug,
      server_name: ep.serverName,
      thumbnail_url: ep.thumbnailUrl || '',
      duration: ep.duration || '',
      source: 'kisskh',
      is_backup: false,
      updated_at: new Date().toISOString()
    };
    if (existing?.id) {
      const updatePayload = {
        episode_name: payload.episode_name,
        slug: payload.slug,
        server_name: payload.server_name,
        thumbnail_url: payload.thumbnail_url,
        duration: payload.duration,
        updated_at: payload.updated_at
      };
      const { error } = await supabase.from('movie_episodes').update(updatePayload).eq('id', existing.id);
      if (error) skipped++;
      else upserted++;
      continue;
    }
    const { error } = await supabase.from('movie_episodes').insert({
      ...payload,
      link_m3u8: '',
      link_embed: '',
      subtitle_url: ''
    });
    if (error) skipped++;
    else upserted++;
  }
  return {
    upserted,
    skipped
  };
}
async function insertBlvietsubEpisodes(supabase, movieId, episodes) {
  let inserted = 0;
  let skipped = 0;
  for (const ep of episodes){
    const [{ data: existingBl }, { data: hidden }] = await Promise.all([
      supabase.from('movie_episodes').select('id').eq('movie_id', movieId).eq('server_name', ep.serverName).eq('episode_number', ep.episodeNumber).limit(1).maybeSingle(),
      supabase.from('movie_episodes').select('id').eq('movie_id', movieId).eq('episode_number', ep.episodeNumber).eq('source', 'hidden').limit(1).maybeSingle()
    ]);
    if (existingBl || hidden) {
      skipped++;
      continue;
    }
    const { error } = await supabase.from('movie_episodes').insert({
      movie_id: movieId,
      episode_number: ep.episodeNumber,
      episode_name: ep.episodeName,
      slug: ep.slug,
      server_name: ep.serverName,
      link_m3u8: ep.linkM3u8,
      link_embed: ep.linkEmbed,
      subtitle_url: ep.subtitleUrl || '',
      thumbnail_url: ep.thumbnailUrl || '',
      duration: ep.duration || '',
      source: 'blvietsub',
      is_backup: false,
      updated_at: new Date().toISOString()
    });
    if (error) {
      skipped++;
      continue;
    }
    await Promise.all([
      supabase.from('episodes').insert({
        movie_id: movieId,
        server_name: ep.serverName,
        episode_number: ep.episodeNumber,
        episode_name: ep.episodeName,
        episode_slug: ep.slug,
        link_m3u8: ep.linkM3u8,
        link_embed: ep.linkEmbed,
        subtitle_url: ep.subtitleUrl || '',
        server_data: {
          name: ep.episodeName,
          slug: ep.slug,
          link_m3u8: ep.linkM3u8,
          link_embed: ep.linkEmbed,
          source: 'blvietsub'
        }
      }),
      supabase.from('streams').insert({
        movie_id: movieId,
        server_name: ep.serverName,
        episode_slug: ep.slug,
        stream_url: ep.linkM3u8,
        embed_url: ep.linkEmbed,
        subtitle_url: ep.subtitleUrl || '',
        source: 'blvietsub',
        quality: 'HD',
        priority: 80,
        is_active: true,
        updated_at: new Date().toISOString()
      })
    ]);
    inserted++;
  }
  return {
    inserted,
    skipped
  };
}
async function logSync(supabase, payload) {
  try {
    await supabase.from('sync_logs').insert({
      function_name: 'kisskh-blvietsub-sync',
      run_at: new Date().toISOString(),
      scanned: payload.scanned ?? 0,
      added: payload.added ?? 0,
      updated: payload.updated ?? 0,
      skipped: payload.skipped ?? 0,
      errors: payload.errors ?? 0,
      details: payload.details ?? [],
      elapsed_ms: payload.elapsed_ms ?? 0,
      success: payload.success ?? false
    });
  } catch (err) {
    console.warn('[kisskh-blvietsub-sync] sync_logs failed:', err);
  }
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders()
  });
  const start = Date.now();
  const url = new URL(req.url);
  const body = req.method === 'POST' ? await req.json().catch(()=>({})) : {};
  const secret = String(url.searchParams.get('secret') ?? body.secret ?? '');
  if (CRON_SECRET && secret !== CRON_SECRET) return jsonResponse({
    success: false,
    error: 'Unauthorized'
  }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({
    success: false,
    error: 'Missing Supabase service configuration'
  }, 500);
  const mode = String(url.searchParams.get('mode') ?? body.mode ?? 'last-update');
  const action = String(url.searchParams.get('action') ?? body.action ?? 'sync').toLowerCase();
  const query = String(url.searchParams.get('q') ?? body.query ?? '');
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') ?? body.limit ?? 20) || 20));
  const country = String(url.searchParams.get('c') ?? body.c ?? body.country ?? (normalizeKissKhMode(mode) === 'library' ? '0' : '1'));
  const page = Math.max(1, Number(url.searchParams.get('page') ?? body.page ?? 1) || 1);
  const pages = Math.max(1, Math.min(200, Number(url.searchParams.get('pages') ?? body.pages ?? 1) || 1));
  const listType = String(url.searchParams.get('type') ?? body.type ?? '0');
  const sub = String(url.searchParams.get('sub') ?? body.sub ?? '0');
  const status = String(url.searchParams.get('status') ?? body.status ?? '0');
  const order = String(url.searchParams.get('order') ?? body.order ?? '2');
  const includeDetails = String(url.searchParams.get('details') ?? body.details ?? 'true') !== 'false';
  const includeStreams = String(url.searchParams.get('streams') ?? body.streams ?? 'true') !== 'false';
  if (action === 'list' || action === 'preview') {
    try {
      const movies = await fetchKissKhClientMovies({
        mode,
        query,
        limit,
        country,
        page,
        type: listType,
        sub,
        status,
        order,
        includeDetails
      });
      return jsonResponse({
        success: true,
        action: 'list',
        mode: normalizeKissKhMode(mode),
        query,
        page,
        type: listType,
        sub,
        country,
        status,
        order,
        count: movies.length,
        movies,
        elapsed_ms: Date.now() - start
      });
    } catch (err) {
      return jsonResponse({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        elapsed_ms: Date.now() - start
      }, 500);
    }
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
  let scanned = 0;
  let added = 0;
  let updated = 0;
  let kisskhEpisodesUpserted = 0;
  let episodesInserted = 0;
  let skipped = 0;
  const details = [];
  try {
    const list = [];
    const seenSourceIds = new Set();
    for(let currentPage = page; currentPage < page + pages; currentPage++){
      const pageItems = await fetchKissKhList({
        mode,
        query,
        limit,
        country,
        page: currentPage,
        type: listType,
        sub,
        status,
        order
      });
      if (pageItems.length === 0) break;
      for (const item of pageItems){
        const key = String(item.id || item.title || '').trim();
        if (!key || seenSourceIds.has(key)) continue;
        seenSourceIds.add(key);
        list.push(item);
      }
      if (normalizeKissKhMode(mode) !== 'library') break;
      await new Promise((resolve)=>setTimeout(resolve, 180));
    }
    scanned = list.length;
    for (const item of list){
      try {
        if (!item.id) {
          skipped++;
          continue;
        }
        const detail = await fetchKissKhDetail(item.id);
        const result = await upsertMovie(supabase, detail);
        if (result.created) added++;
        if (result.updated) updated++;
        const kisskhEpisodes = normalizeKissKhEpisodes(detail);
        const kisskhEpResult = await upsertKissKhEpisodes(supabase, result.movieId, kisskhEpisodes);
        kisskhEpisodesUpserted += kisskhEpResult.upserted;
        skipped += kisskhEpResult.skipped;
        if (includeStreams) {
          const episodes = await fetchBlvietsubEpisodes(detail.title || '');
          const epResult = await insertBlvietsubEpisodes(supabase, result.movieId, episodes);
          episodesInserted += epResult.inserted;
          skipped += epResult.skipped;
        }
        await supabase.from('movie_api_cache').delete().eq('slug', result.slug);
        await new Promise((resolve)=>setTimeout(resolve, 350));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        details.push(`[${item.title || item.id}] ${message}`);
      }
    }
    await supabase.from('home_page_cache').delete().neq('id', '__never__');
    const payload = {
      success: details.length === 0,
      message: `KissKH synced: scanned ${scanned}, added ${added}, updated ${updated}, KissKH episodes upserted ${kisskhEpisodesUpserted}, BLVietsub episodes inserted ${episodesInserted}, skipped ${skipped}, errors ${details.length}`,
      scanned,
      added,
      updated,
      mode: normalizeKissKhMode(mode),
      page,
      pages,
      type: listType,
      sub,
      country,
      status,
      order,
      kisskh_episodes_upserted: kisskhEpisodesUpserted,
      episodes_inserted: episodesInserted,
      skipped,
      errors: details.length,
      details,
      elapsed_ms: Date.now() - start
    };
    await logSync(supabase, payload);
    return jsonResponse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const payload = {
      success: false,
      error: message,
      scanned,
      added,
      updated,
      skipped,
      errors: details.length + 1,
      details: [
        message,
        ...details
      ],
      elapsed_ms: Date.now() - start
    };
    await logSync(supabase, payload);
    return jsonResponse(payload, 500);
  }
});
