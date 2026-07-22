import { readFile } from 'node:fs/promises';

const movieApi = await readFile('src/services/movieApi.ts', 'utf8');
const homeProxy = await readFile('supabase/functions/home-proxy/index.ts', 'utf8');
const detailProxy = await readFile('supabase/functions/movie-detail-proxy/index.ts', 'utf8');
const audioMigration = await readFile('supabase/migrations/20260720152500_add_audio_type_and_search_warm.sql', 'utf8');
const searchMigration = await readFile('supabase/migrations/20260722143000_optimize_search_rpc_v8_indexed_candidates.sql', 'utf8');
const searchIndexCompletionMigration = await readFile('supabase/migrations/20260722161000_complete_search_document_indexes.sql', 'utf8');
const failures = [];
const requiredMovieFields = ['id', 'slug', 'name', 'origin_name', 'poster_url', 'thumb_url', 'episode_current'];
const listSelect = movieApi.match(/const SUPABASE_LIST_SELECT = '([^']+)'/)?.[1] ?? '';
const selectedFields = listSelect.split(',').map((value) => value.trim());

for (const field of requiredMovieFields) {
  if (!selectedFields.includes(field)) failures.push(`SUPABASE_LIST_SELECT is missing required field: ${field}`);
}
if (selectedFields.includes('chieurap')) failures.push('SUPABASE_LIST_SELECT contains non-portable field: chieurap');

for (const snippet of ["response?.error?.code === '42703'", 'SUPABASE_LIST_CORE_SELECT', 'MOVIE_DETAIL_CORE_SELECT', 'supabaseDetailUsesCoreContract']) {
  if (!movieApi.includes(snippet)) failures.push(`Frontend compatibility fallback is missing: ${snippet}`);
}
for (const [name, source] of [['home-proxy', homeProxy], ['movie-detail-proxy', detailProxy]]) {
  if (!source.includes("from('movies')")) failures.push(`${name} no longer reads the movies contract`);
  if (!source.includes('episode_current')) failures.push(`${name} is missing episode_current compatibility`);
}
for (const snippet of ['add column if not exists audio_type', 'fill_stream_audio_type', 'warm-search-index-every-10-minutes']) {
  if (!audioMigration.includes(snippet)) failures.push(`Audio/search compatibility migration is missing: ${snippet}`);
}
for (const snippet of [
  'create table if not exists public.movie_search_documents',
  'movie_search_documents_blob_trgm_idx',
  'movies_refresh_search_document',
  'on delete cascade',
  'grant execute on function public.search_movies_fast',
]) {
  if (!searchMigration.includes(snippet)) failures.push(`Indexed search compatibility migration is missing: ${snippet}`);
}
if (!searchIndexCompletionMigration.includes('movie_search_documents_normalized_name_trgm_idx')) {
  failures.push('Indexed search compatibility migration is missing: normalized_name trigram index');
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'passed', requiredMovieFields, compatibilityFallbacks: 4 }, null, 2));
