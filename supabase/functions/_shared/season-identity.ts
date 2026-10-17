// A series-level TMDB id and a shared slug never override a season boundary.
type Movie = Record<string, any>;
const normalize = (v: unknown) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
const fields = ['name', 'origin_name', 'original_name', 'title_vi', 'title_en', 'title_original', 'slug'];
function markers(value: unknown): number[] {
  return [...normalize(value).matchAll(/(?:^|[^a-z0-9])(?:season|phan|mua|part|s)[\s_-]*(\d{1,3})(?=$|[^a-z0-9])/g)]
    .map(m => Number(m[1])).filter(n => n > 0 && n <= 999);
}
export function seasonIdentity(movie: Movie) {
  const declared = [Number(movie.season_number || 0), Number(movie.tmdb?.season || 0), ...fields.flatMap(f => markers(movie[f]))].filter(n => Number.isInteger(n) && n > 0);
  const titleSeasons = [...new Set(declared)];
  const episodeSeasons = new Set<number>();
  for (const server of Array.isArray(movie.episodes) ? movie.episodes : []) {
    for (const episode of server.server_data || server.items || []) {
      for (const n of markers(`${episode.name || ''} ${episode.slug || ''}`)) episodeSeasons.add(n);
    }
  }
  if (titleSeasons.length > 1) return {scope: 'conflict', season: null};
  if (movie.season_scope === 'aggregate' || episodeSeasons.size > 1) return {scope: 'aggregate', season: null};
  const season = titleSeasons[0] || null;
  return {scope: season ? 'season' : 'unknown', season};
}
function mediaType(movie: Movie) {
  const t = normalize(movie.type || movie.tmdb_media_type || movie.tmdb?.type).replace(/[-_]/g, ' ');
  if (['single', 'movie', 'phim le', 'phim chieu rap'].includes(t)) return 'single';
  if (['series', 'tv', 'tvshows', 'tv shows', 'phim bo', 'hoathinh'].includes(t)) return 'series';
  return '';
}
export function movieIdentityBoundaryCompatible(a: Movie, b: Movie): boolean {
  const at = mediaType(a), bt = mediaType(b);
  if (at && bt && at !== bt) return false;
  const ai = String(a.tmdb_id || a.tmdb?.id || ''), bi = String(b.tmdb_id || b.tmdb?.id || '');
  if (ai && bi && ai !== '0' && bi !== '0' && ai !== bi) return false;
  const am = String(a.imdb_id || a.imdb?.id || '').toLowerCase(), bm = String(b.imdb_id || b.imdb?.id || '').toLowerCase();
  if (am && bm && am !== bm) return false;
  const as = seasonIdentity(a), bs = seasonIdentity(b);
  if (as.scope === 'conflict' || bs.scope === 'conflict') return false;
  if (as.scope === 'aggregate' || bs.scope === 'aggregate') return as.scope === bs.scope;
  return as.season === bs.season || implicitFirstSeasonIdentity(a,b);
}

export function implicitFirstSeasonIdentity(a: Movie,b: Movie): boolean {
  const sa=seasonIdentity(a),sb=seasonIdentity(b);
  if (!((sa.scope==='unknown' && sb.season===1)||(sb.scope==='unknown' && sa.season===1))) return false;
  if (mediaType(a)!=='series'||mediaType(b)!=='series') return false;
  const ay=Number(a.year||0),by=Number(b.year||0);
  if (!ay||ay!==by) return false;
  const base=(v:unknown)=>normalize(v).replace(/[^a-z0-9]+/g,' ').trim().replace(/ (?:phan|season|mua|part|s) 0*1$/,'').trim();
  const an=base(a.name||a.title_vi),bn=base(b.name||b.title_vi);
  const ao=base(a.origin_name||a.original_name||a.title_original||a.title_en),bo=base(b.origin_name||b.original_name||b.title_original||b.title_en);
  return an.length>=5 && an===bn && ao.length>=5 && ao===bo;
}
