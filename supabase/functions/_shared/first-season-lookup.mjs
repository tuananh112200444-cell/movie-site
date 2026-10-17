import { seasonIdentity } from './season-identity.ts';

export async function findFirstSeasonAlias(db,entry) {
  const movie={name:entry.title||entry.name,origin_name:entry.originName||entry.origin_name,
    year:Number(entry.year)||null,type:entry.type,tmdb_id:Number(entry.tmdbId||entry.tmdb_id)||null,
    imdb_id:entry.imdbId||entry.imdb_id||'',episodes:entry.episodes||[]};
  const signature=seasonIdentity(movie);
  if (!movie.year || !movie.name || !movie.origin_name || signature.scope==='aggregate' || signature.scope==='conflict' || Number(signature.season||1)!==1) return null;
  const {data,error}=await db.rpc('find_verified_first_season_alias',{p_movie:{...movie,season_scope:signature.scope,season_number:signature.season}});
  if(error) throw new Error(`First-season identity lookup: ${error.message}`);
  return data?.id ? data : null;
}
