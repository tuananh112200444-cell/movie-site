import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ENABLE_PUBLIC_LAZY_PERSIST = Deno.env.get('ENABLE_PUBLIC_LAZY_PERSIST') === 'true';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function normalizeDailymotionUrl(url: string): string {
  const dm = /^https?:\/\/(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/i.exec(url);
  if (dm) return `https://www.dailymotion.com/embed/video/${dm[1]}`;
  const short = /^https?:\/\/dai\.ly\/([a-zA-Z0-9]+)/i.exec(url);
  if (short) return `https://www.dailymotion.com/embed/video/${short[1]}`;
  return url;
}

function epSortKey(ep: { slug?: string; name?: string }): number {
  const text = ep.slug || ep.name || '';
  const match = text.match(/(\d+)/);
  if (match) return Number(match[1]);
  if (text.toLowerCase().includes('full')) return 0;
  return Infinity;
}
function extractEpNumber(text: string): number {
  const match = text.match(/(\d+)/);
  if (match) return Number(match[1]);
  if (text.toLowerCase().includes('full')) return 0;
  return 0;
}

function normalizeEpisodeKeyPart(value: string): string {
  return value.trim().toLowerCase().normalize('NFC');
}

function buildEpisodeDedupKeys(serverName: string, slug: string, episodeNumber: number, name = ''): string[] {
  const server = normalizeEpisodeKeyPart(serverName || 'Nguồn');
  const keys: string[] = [];
  const normalizedSlug = normalizeEpisodeKeyPart(slug || '');
  const normalizedName = normalizeEpisodeKeyPart(name || '');
  if (normalizedSlug) keys.push(`${server}|slug:${normalizedSlug}`);
  if (normalizedName) keys.push(`${server}|name:${normalizedName}`);
  if (Number.isFinite(episodeNumber)) keys.push(`${server}|num:${episodeNumber}`);
  return keys;
}

function hasSeenEpisode(seen: Set<string>, serverName: string, slug: string, episodeNumber: number, name = ''): boolean {
  return buildEpisodeDedupKeys(serverName, slug, episodeNumber, name).some((key) => seen.has(key));
}

function markSeenEpisode(seen: Set<string>, serverName: string, slug: string, episodeNumber: number, name = ''): void {
  for (const key of buildEpisodeDedupKeys(serverName, slug, episodeNumber, name)) {
    seen.add(key);
  }
}

function isHiddenEpisodeSource(source: unknown): boolean {
  return String(source || '').trim().toLowerCase() === 'hidden';
}

function pushEpisode(serverMap: Map<string, unknown[]>, serverName: string, epData: Record<string, unknown>): void {
  if (!serverMap.has(serverName)) serverMap.set(serverName, []);
  serverMap.get(serverName)!.push(epData);
}

/* ── Search OPhim for correct slug when detail 404 ── */
async function searchOphimForSlug(keyword: string): Promise<string | null> {
  const urls = [
    `https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=1`,
    `https://ophim.tv/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=1`,
  ];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch { /* noop */ } }, 4000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const data = await r.json() as Record<string, unknown>;
      const d = data as Record<string, unknown>;
      const items = (d?.data as Record<string, unknown>)?.items ?? d?.items ?? [];
      if (Array.isArray(items) && items.length > 0) {
        const first = items[0] as Record<string, unknown>;
        if (first.slug) return String(first.slug);
      }
    } catch { /* ignore */ }
  }
  return null;
}

/* ── OPTIMIZED: Accept ANY 200 response from /phim/${slug} ── */
async function fetchExternalMovieDetail(
  slug: string,
): Promise<{
  movie: Record<string, unknown>;
  episodes: Array<{ server_name: string; server_data: unknown[] }>;
} | null> {
  const urls = [
    `https://ophim1.com/v1/api/phim/${encodeURIComponent(slug)}`,
    `https://phimapi.com/phim/${encodeURIComponent(slug)}`,
    `https://ophim.tv/v1/api/phim/${encodeURIComponent(slug)}`,
  ];

  const controllers: AbortController[] = [];

  const promises = urls.map((url) => {
    const ctrl = new AbortController();
    controllers.push(ctrl);
    const t = setTimeout(() => { try { ctrl.abort(); } catch { /* noop */ } }, 5000);

    return fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        clearTimeout(t);
        if (!r.ok) {
          if (r.status === 404) throw new Error('HTTP 404');
          throw new Error(`HTTP ${r.status}`);
        }
        const data = await r.json() as Record<string, unknown>;

        let movieData: Record<string, unknown> | undefined;
        let episodesData: Array<{ server_name: string; server_data: unknown[] }> | undefined;

        if (data.movie && typeof data.movie === 'object') {
          movieData = data.movie as Record<string, unknown>;
          episodesData = data.episodes as Array<{ server_name: string; server_data: unknown[] }> | undefined;
        } else if (
          data.data &&
          typeof data.data === 'object' &&
          (data.data as Record<string, unknown>).movie
        ) {
          movieData = (data.data as Record<string, unknown>).movie as Record<string, unknown>;
          episodesData = (data.data as Record<string, unknown>).episodes as Array<{ server_name: string; server_data: unknown[] }> | undefined;
        } else if (
          data.data &&
          typeof data.data === 'object' &&
          (data.data as Record<string, unknown>).item &&
          typeof (data.data as Record<string, unknown>).item === 'object'
        ) {
          const item = (data.data as Record<string, unknown>).item as Record<string, unknown>;
          if (item.movie && typeof item.movie === 'object') {
            movieData = item.movie as Record<string, unknown>;
            episodesData = item.episodes as Array<{ server_name: string; server_data: unknown[] }> | undefined;
          } else if (item.slug || item.name || item._id || item.id) {
            movieData = item;
            episodesData = item.episodes as Array<{ server_name: string; server_data: unknown[] }> | undefined;
          }
        }

        if (!movieData || !movieData.name) throw new Error('No movie data');

        return { movie: movieData, episodes: episodesData ?? [] };
      })
      .catch((err) => {
        clearTimeout(t);
        console.log(`[fetchExternalMovieDetail] ${url} failed: ${err.message}`);
        return null;
      });
  });

  const results = await Promise.all(promises);
  const winner = results.find((r) => r !== null);
  if (winner) {
    controllers.forEach((c) => { try { c.abort(); } catch { /* noop */ } });
  }
  return winner ?? null;
}
function slugifyVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function normalizeTitle(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleCandidates(value: Record<string, unknown>): string[] {
  return Array.from(new Set([
    value.name,
    value.title_vi,
    value.title_en,
    value.title_zh,
    value.title_original,
    value.origin_name,
    String(value.slug || '').replace(/-/g, ' '),
    String(value.ophim_slug || '').replace(/-/g, ' '),
    value.normalized_name,
  ]
    .map(normalizeTitle)
    .filter((title) => title.length >= 3)));
}

function hasSharedTitle(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aTitles = titleCandidates(a);
  const bTitles = titleCandidates(b);
  if (aTitles.length === 0 || bTitles.length === 0) return false;
  return aTitles.some((left) =>
    bTitles.some((right) =>
      left === right ||
      (left.length >= 8 && right.includes(left)) ||
      (right.length >= 8 && left.includes(right))
    )
  );
}

function sameMovieYearOrUnknown(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ay = Number(a.year || 0);
  const by = Number(b.year || 0);
  if (!Number.isFinite(ay) || !Number.isFinite(by)) return true;
  return ay <= 0 || by <= 0 || ay === by;
}

function escapePostgrestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, ' ');
}

function buildPersistMoviePayload(
  movie: Record<string, unknown>,
  requestedSlug: string,
  detailSlug: string,
): Record<string, unknown> {
  const name = String(movie.name || movie.title || requestedSlug);
  const originName = String(movie.origin_name || movie.originName || movie.original_title || '');
  const canonicalSlug = String(movie.slug || detailSlug || requestedSlug || slugifyVietnamese(name));
  const now = new Date().toISOString();
  const normalizedName = normalizeTitle(name);
  return {
    slug: canonicalSlug,
    ophim_slug: detailSlug || canonicalSlug,
    ophim_id: String(movie._id || movie.id || movie.ophim_id || ''),
    name,
    title_vi: name,
    title_en: originName,
    title_original: originName || name,
    normalized_name: normalizedName,
    origin_name: originName,
    content: String(movie.content || movie.description || ''),
    type: String(movie.type || 'phim-le'),
    status: String(movie.status || 'completed'),
    thumb_url: String(movie.thumb_url || movie.thumbUrl || movie.thumb || ''),
    poster_url: String(movie.poster_url || movie.posterUrl || movie.poster || ''),
    trailer_url: String(movie.trailer_url || movie.trailerUrl || ''),
    time: String(movie.time || ''),
    episode_current: String(movie.episode_current || movie.episodeCurrent || ''),
    episode_total: String(movie.episode_total || movie.episodeTotal || ''),
    quality: String(movie.quality || 'HD'),
    lang: String(movie.lang || movie.language || 'Vietsub'),
    year: Number(movie.year || 0),
    actor: Array.isArray(movie.actor) ? movie.actor : [],
    director: Array.isArray(movie.director) ? movie.director : [],
    category: Array.isArray(movie.category) ? movie.category : [],
    country: Array.isArray(movie.country) ? movie.country : [],
    source_site: 'ophim',
    source_name: 'OPhim',
    is_published: true,
    last_synced_at: now,
    updated_at: now,
  };
}

async function findMovieIdForPersist(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const checks: Array<{ column: string; value: string }> = [
    { column: 'slug', value: String(payload.slug || '') },
    { column: 'ophim_slug', value: String(payload.ophim_slug || '') },
    { column: 'ophim_id', value: String(payload.ophim_id || '') },
  ].filter((item) => item.value.trim());

  for (const check of checks) {
    const { data } = await supabase
      .from('movies')
      .select('id')
      .eq(check.column, check.value)
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  const terms = Array.from(new Set([
    payload.name,
    payload.title_vi,
    payload.title_en,
    payload.title_original,
    payload.origin_name,
    String(payload.slug || '').replace(/-/g, ' '),
    String(payload.ophim_slug || '').replace(/-/g, ' '),
  ]
    .map((term) => String(term || '').trim())
    .filter((term) => term.length >= 3)
    .slice(0, 6)));

  const year = Number(payload.year || 0);
  for (const term of terms) {
    const safeTerm = escapePostgrestIlike(term);
    let query = supabase
      .from('movies')
      .select('id,slug,name,title_vi,title_en,title_zh,title_original,origin_name,normalized_name,ophim_slug,year,type')
      .or(`name.ilike.%${safeTerm}%,title_vi.ilike.%${safeTerm}%,title_en.ilike.%${safeTerm}%,title_zh.ilike.%${safeTerm}%,title_original.ilike.%${safeTerm}%,origin_name.ilike.%${safeTerm}%,slug.ilike.%${safeTerm}%,ophim_slug.ilike.%${safeTerm}%`)
      .eq('is_published', true);
    if (Number.isFinite(year) && year > 0) query = query.eq('year', year);

    const { data } = await query.limit(10);
    const match = ((data ?? []) as Record<string, unknown>[]).find((item) =>
      sameMovieYearOrUnknown(item, payload) && hasSharedTitle(item, payload)
    );
    if (match?.id) return String(match.id);
  }

  if (Number.isFinite(year) && year > 0 && titleCandidates(payload).length > 0) {
    const { data } = await supabase
      .from('movies')
      .select('id,slug,name,title_vi,title_en,title_zh,title_original,origin_name,normalized_name,ophim_slug,year,type')
      .eq('year', year)
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .limit(200);
    const match = ((data ?? []) as Record<string, unknown>[]).find((item) =>
      sameMovieYearOrUnknown(item, payload) && hasSharedTitle(item, payload)
    );
    if (match?.id) return String(match.id);
  }

  return null;
}

async function persistExternalMovie(
  supabase: ReturnType<typeof createClient>,
  external: { movie: Record<string, unknown>; episodes: Array<{ server_name: string; server_data: unknown[] }> },
  requestedSlug: string,
  detailSlug: string,
  existingMovieId = '',
): Promise<void> {
  try {
    const payload = buildPersistMoviePayload(external.movie, requestedSlug, detailSlug);
    let movieId = existingMovieId || await findMovieIdForPersist(supabase, payload);
    const now = new Date().toISOString();

    if (movieId) {
      await supabase
        .from('movies')
        .update({
          ophim_id: payload.ophim_id,
          ophim_slug: payload.ophim_slug,
    
          last_synced_at: now,
          updated_at: now,
        })
        .eq('id', movieId);
    } else {
      const { data, error } = await supabase
        .from('movies')
        .insert(payload)
        .select('id')
        .single();
      if (error) {
        console.log('[movie-detail-proxy] lazy movie insert failed:', error.message);
        return;
      }
      movieId = String(data.id);
    }

    const ophimId = String(payload.ophim_id || '');
    for (const srv of external.episodes) {
      const serverName = String(srv.server_name || 'Nguồn');
      const rows = (srv.server_data || []) as Array<Record<string, unknown>>;
      for (const ep of rows) {
        const linkM3u8 = String(ep.link_m3u8 || '').trim();
        const linkEmbed = String(ep.link_embed || '').trim();
        if (!linkM3u8 && !linkEmbed) continue;

        const epName = String(ep.name || '').trim();
        const epSlug = String(ep.slug || slugifyVietnamese(epName) || 'full').trim();
        const episodeNumber = extractEpNumber(epSlug || epName);
        const subtitleUrl = String(ep.subtitle_url || ep.subtitle || '').trim();

        const { data: existingEpisode } = await supabase
          .from('episodes')
          .select('id')
          .eq('movie_id', movieId)
          .eq('server_name', serverName)
          .eq('episode_number', episodeNumber)
          .limit(1)
          .maybeSingle();

        if (!existingEpisode) {
          await supabase.from('episodes').insert({
            movie_id: movieId,
            ophim_id: ophimId,
            server_name: serverName,
            episode_number: episodeNumber,
            episode_name: epName || (episodeNumber > 0 ? `Tập ${episodeNumber}` : 'Full'),
            episode_slug: epSlug,
            link_m3u8: linkM3u8,
            link_embed: linkEmbed,
            subtitle_url: subtitleUrl,
            server_data: ep,
          });
        }

        const { data: existingStream } = await supabase
          .from('streams')
          .select('id')
          .eq('movie_id', movieId)
          .eq('server_name', serverName)
          .eq('episode_slug', epSlug)
          .limit(1)
          .maybeSingle();

        if (!existingStream) {
          await supabase.from('streams').insert({
            movie_id: movieId,
            ophim_id: ophimId,
            server_name: serverName,
            episode_slug: epSlug,
            stream_url: linkM3u8,
            embed_url: linkEmbed,
            subtitle_url: subtitleUrl,
            source: 'ophim',
            is_active: true,
          });
        }
      }
    }
  } catch (err) {
    console.log('[movie-detail-proxy] lazy persist failed:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  if (!slug) {
    return new Response(JSON.stringify({ status: false, message: 'Missing slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    /* ── 1. Try Supabase DB first (multiple slug variants) ── */
    let movie: Record<string, unknown> | null = null;
    let movieId = '';
    let movieData: Record<string, unknown> | null = null;

    const slugVariants = Array.from(new Set([slug, slug.normalize('NFC'), decodeURIComponent(slug)]));
    for (const variant of slugVariants) {
      const { data, error } = await supabase
        .from('movies')
        .select('*')
        .eq('slug', variant)
        .eq('is_published', true)
        .maybeSingle();
      if (!error && data) {
        movie = data as Record<string, unknown>;
        movieId = movie.id as string;
        movieData = movie;
        break;
      }
    }

    // Fallback: ilike search
    if (!movie) {
      const safeSlug = slug.replace(/%/g, '\\%').replace(/_/g, '\\_');
      for (const variant of slugVariants) {
        const { data, error } = await supabase
          .from('movies')
          .select('*')
          .eq('ophim_slug', variant)
          .eq('is_published', true)
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          movie = data as Record<string, unknown>;
          movieId = movie.id as string;
          movieData = movie;
          break;
        }
      }
    }

    const useSupabase = !!movieData;
    const supabaseOphimId = movieData ? String(movieData.ophim_id || '').trim() : '';

    /* ── 2. Load episodes from DB ── */
    const serverMap = new Map<string, unknown[]>();
    const seen = new Set<string>();

    if (useSupabase && movieId) {
      const [
        { data: meRows, error: meErr },
        { data: oldEps },
        { data: streams },
      ] = await Promise.all([
        supabase
          .from('movie_episodes')
          .select('*')
          .eq('movie_id', movieId)
          .order('episode_number', { ascending: true }),
        supabase
          .from('episodes')
          .select('server_name, episode_number, episode_slug, episode_name, link_m3u8, link_embed, subtitle_url, server_data')
          .eq('movie_id', movieId)
          .order('episode_number', { ascending: true }),
        supabase
          .from('streams')
          .select('*')
          .eq('movie_id', movieId)
          .eq('is_active', true)
          .order('priority', { ascending: false }),
      ]);

      if (meErr) {
        console.log('[movie-detail-proxy] movie_episodes error:', meErr.message);
      }

      const movieEpisodeRows = [...(meRows ?? [])].sort((a, b) => {
        const am = a as Record<string, unknown>;
        const bm = b as Record<string, unknown>;
        const aHidden = isHiddenEpisodeSource(am.source);
        const bHidden = isHiddenEpisodeSource(bm.source);
        if (aHidden !== bHidden) return aHidden ? -1 : 1;
        const aApi = String(am.source || '').trim().toLowerCase() === 'ophim';
        const bApi = String(bm.source || '').trim().toLowerCase() === 'ophim';
        if (aApi !== bApi) return aApi ? 1 : -1;
        return Number(am.episode_number ?? 0) - Number(bm.episode_number ?? 0);
      });

      // 2a. movie_episodes overrides. Hidden rows block API rows without entering playback.
      for (const ep of movieEpisodeRows) {
        const em = ep as Record<string, unknown>;
        const num = Number(em.episode_number ?? 0);
        const slugVal = String(em.slug || `tap-${num}`);
        const serverName = String(em.server_name || 'Nguồn');
        const source = String(em.source || 'manual');
        const epData = {
          name: String(em.episode_name || `Tập ${num}`),
          slug: slugVal,
          filename: '',
          link_embed: normalizeDailymotionUrl(String(em.link_embed || '')),
          link_m3u8: String(em.link_m3u8 || ''),
          subtitle_url: String(em.subtitle_url || ''),
        };
        const alreadySeen = hasSeenEpisode(seen, serverName, slugVal, num, String(epData.name));
        markSeenEpisode(seen, serverName, slugVal, num, String(epData.name));
        if (isHiddenEpisodeSource(source) || alreadySeen) continue;
        pushEpisode(serverMap, serverName, epData);
      }

      // 2b. Episodes table
      for (const row of oldEps ?? []) {
        const rm = row as Record<string, unknown>;
        const serverName = String(rm.server_name || 'Nguồn');
        let epData: Record<string, unknown>;
        const num = Number(rm.episode_number ?? 0);
        const slugVal = String(rm.episode_slug || (num > 0 ? String(num) : 'full'));

        if (rm.link_m3u8 || rm.link_embed || rm.episode_name || rm.episode_slug) {
          epData = {
            name: String(rm.episode_name || (num > 0 ? `Tập ${num}` : 'Full')),
            slug: slugVal,
            filename: '',
            link_embed: normalizeDailymotionUrl(String(rm.link_embed || '')),
            link_m3u8: String(rm.link_m3u8 || ''),
            subtitle_url: String(rm.subtitle_url || ''),
          };
        } else if (rm.server_data && typeof rm.server_data === 'object' && !Array.isArray(rm.server_data)) {
          const sd = rm.server_data as Record<string, unknown>;
          epData = {
            name: String(sd.name || ''),
            slug: String(sd.slug || ''),
            filename: String(sd.filename || ''),
            link_embed: normalizeDailymotionUrl(String(sd.link_embed || '')),
            link_m3u8: String(sd.link_m3u8 || ''),
            subtitle_url: String(sd.subtitle_url || sd.subtitle || ''),
          };
        } else if (Array.isArray(rm.server_data)) {
          const sds = rm.server_data as Array<Record<string, unknown>>;
          for (const ep of sds) {
            const epSlug = String(ep.slug || ep.name || '');
            const epName = String(ep.name || '');
            const epNum = extractEpNumber(epSlug || epName);
            if (hasSeenEpisode(seen, serverName, epSlug, epNum, epName)) continue;
            markSeenEpisode(seen, serverName, epSlug, epNum, epName);
            pushEpisode(serverMap, serverName, {
              name: String(ep.name || ''),
              slug: epSlug,
              filename: String(ep.filename || ''),
              link_embed: normalizeDailymotionUrl(String(ep.link_embed || '')),
              link_m3u8: String(ep.link_m3u8 || ''),
              subtitle_url: String(ep.subtitle_url || ep.subtitle || ''),
            });
          }
          continue;
        } else {
          continue;
        }

        if (hasSeenEpisode(seen, serverName, slugVal, num, String(epData.name || ''))) continue;
        markSeenEpisode(seen, serverName, slugVal, num, String(epData.name || ''));
        pushEpisode(serverMap, serverName, epData);
      }

      // 2c. Streams table — skip dead streams
      for (const s of streams ?? []) {
        const sm = s as Record<string, unknown>;
        const streamUrl = String(sm.stream_url || '').trim();
        const embedUrl = String(sm.embed_url || '').trim();
        if (!streamUrl && !embedUrl) continue;

        const slugVal = String(sm.episode_slug || 'full');
        const serverName = String(sm.server_name || 'Nguồn');
        const num = extractEpNumber(slugVal);
        const epName = slugVal === 'full' ? 'Full' : `Tập ${num || slugVal}`;
        if (hasSeenEpisode(seen, serverName, slugVal, num, epName)) continue;
        markSeenEpisode(seen, serverName, slugVal, num, epName);
        const epData = {
          name: epName,
          slug: slugVal,
          filename: '',
          link_embed: normalizeDailymotionUrl(embedUrl),
          link_m3u8: streamUrl,
          subtitle_url: String(sm.subtitle_url || ''),
        };

        pushEpisode(serverMap, serverName, epData);
      }
    }

    /* ── 3. Fetch external if no DB episodes or no DB movie ── */
    let externalMovieData: Record<string, unknown> | null = null;

    if (serverMap.size === 0 || !useSupabase) {
      let detailSlug = slug;
      let external = await fetchExternalMovieDetail(detailSlug);

      // If 404, search OPhim for correct slug
      if (!external) {
        const foundSlug = await searchOphimForSlug(slug);
        if (foundSlug && foundSlug !== slug) {
          console.log(`[movie-detail-proxy] Search found slug "${foundSlug}" for "${slug}" - retrying detail`);
          external = await fetchExternalMovieDetail(foundSlug);
          if (external) detailSlug = foundSlug;
        }
      }

      if (external) {
        externalMovieData = external.movie;
        if (!movieData) {
          movieData = external.movie;
        }
        if (ENABLE_PUBLIC_LAZY_PERSIST) {
          try {
            const runtime = globalThis as unknown as {
              EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
            };
            const persistPromise = persistExternalMovie(supabase, external, slug, detailSlug, movieId);
            if (runtime.EdgeRuntime?.waitUntil) {
              runtime.EdgeRuntime.waitUntil(persistPromise);
            } else {
              void persistPromise;
            }
          } catch {
            /* lazy persist is best-effort */
          }
        
        }
        for (const srv of external.episodes) {
          const serverName = String(srv.server_name || 'Nguồn');
          const sds = (srv.server_data ?? []) as Array<Record<string, unknown>>;
          for (const ep of sds) {
            const slugVal = String(ep.slug || ep.name || '');
            const epName = String(ep.name || '');
            const epNum = extractEpNumber(slugVal || epName);
            if (hasSeenEpisode(seen, serverName, slugVal, epNum, epName)) continue;
            markSeenEpisode(seen, serverName, slugVal, epNum, epName);
            pushEpisode(serverMap, serverName, {
              name: String(ep.name || ''),
              slug: slugVal,
              filename: String(ep.filename || ''),
              link_embed: normalizeDailymotionUrl(String(ep.link_embed || '')),
              link_m3u8: String(ep.link_m3u8 || ''),
              subtitle_url: String(ep.subtitle_url || ep.subtitle || ''),
            });
          }
        }
      }
    }

    /* ── 4. Sort episodes ── */
    for (const [, eps] of serverMap) {
      eps.sort((a: { slug?: string; name?: string }, b: { slug?: string; name?: string }) => epSortKey(a) - epSortKey(b));
    }

    const episodeServers: Array<{ server_name: string; server_data: unknown[] }> = [];
    for (const [serverName, serverData] of serverMap) {
      const playable = (serverData as Array<{ link_m3u8?: string; link_embed?: string }>)
        .filter((ep) => !!(ep.link_m3u8?.trim() || ep.link_embed?.trim()));
      if (playable.length > 0) {
        episodeServers.push({ server_name: serverName, server_data: playable });
      }
    }

    if (!movieData) {
      return new Response(JSON.stringify({ status: false, message: 'Movie not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const m = movieData;
    const response = {
      status: true,
      movie: {
        _id: String(m.id || m._id || externalMovieData?.id || externalMovieData?._id || ''),
        name: String(m.name || externalMovieData?.name || ''),
        slug: String(m.slug || externalMovieData?.slug || slug),
        origin_name: String(m.origin_name || m.originName || externalMovieData?.origin_name || ''),
        content: String(m.content || m.description || externalMovieData?.content || ''),
        type: String(m.type || externalMovieData?.type || 'phim-le'),
        status: String(m.status || externalMovieData?.status || 'completed'),
        thumb_url: String(m.thumb_url || m.thumbUrl || m.thumb || externalMovieData?.thumb_url || ''),
        poster_url: String(m.poster_url || m.posterUrl || m.poster || externalMovieData?.poster_url || ''),
        trailer_url: String(m.trailer_url || m.trailerUrl || externalMovieData?.trailer_url || ''),
        time: String(m.time || externalMovieData?.time || ''),
        episode_current: String(m.episode_current || m.episodeCurrent || externalMovieData?.episode_current || ''),
        episode_total: String(m.episode_total || m.episodeTotal || externalMovieData?.episode_total || ''),
        current_episode: Number(m.current_episode || externalMovieData?.current_episode || 0) || undefined,
        total_episodes: Number(m.total_episodes || externalMovieData?.total_episodes || 0) || undefined,
        schedule_type: String(m.schedule_type || externalMovieData?.schedule_type || ''),
        release_time: String(m.release_time || externalMovieData?.release_time || ''),
        release_day: m.release_day ?? externalMovieData?.release_day,
        schedule_timezone: String(m.schedule_timezone || externalMovieData?.schedule_timezone || ''),
        release_at: String(m.release_at || externalMovieData?.release_at || ''),
        next_episode_at: String(m.next_episode_at || externalMovieData?.next_episode_at || ''),
        next_episode_name: String(m.next_episode_name || externalMovieData?.next_episode_name || ''),
        schedule_note: String(m.schedule_note || externalMovieData?.schedule_note || ''),
        quality: String(m.quality || externalMovieData?.quality || 'HD'),
        lang: String(m.lang || m.language || externalMovieData?.lang || 'Vietsub'),
        year: Number(m.year || externalMovieData?.year || 0),
        actor: Array.isArray(m.actor) ? (m.actor as string[]) : (Array.isArray(externalMovieData?.actor) ? externalMovieData?.actor as string[] : []),
        director: Array.isArray(m.director) ? (m.director as string[]) : (Array.isArray(externalMovieData?.director) ? externalMovieData?.director as string[] : []),
        category: Array.isArray(m.category)
          ? (m.category as Array<{ id?: string; name: string; slug: string }>)
          : (Array.isArray(externalMovieData?.category) ? externalMovieData?.category as Array<{ id?: string; name: string; slug: string }> : []),
        country: Array.isArray(m.country)
          ? (m.country as Array<{ id?: string; name: string; slug: string }>)
          : (Array.isArray(externalMovieData?.country) ? externalMovieData?.country as Array<{ id?: string; name: string; slug: string }> : []),
        notify: String(m.notify || ''),
        showtimes: String(m.showtimes || ''),
        is_copyright: false,
        sub_docquyen: false,
        chieurap: false,
        view: Number(m.view || 0),
        ophim_id: String(m.ophim_id || m.ophimId || externalMovieData?.ophim_id || externalMovieData?._id || ''),
        modified: { time: String(m.updated_at || m.created_at || new Date().toISOString()) },
      },
      episodes: episodeServers,
    };

    // Cache successful responses for 30 seconds to reduce DB load
    const hasEpisodes = episodeServers.length > 0;
    const cacheControl = hasEpisodes
      ? 'public, max-age=30, stale-while-revalidate=60'
      : 'no-store';

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': cacheControl,
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error('[movie-detail-proxy] Fatal Error:', err);
    return new Response(JSON.stringify({ status: false, message: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
});
