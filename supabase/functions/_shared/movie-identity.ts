type DbClient = {
  from: (table: string) => any;
};

const unique = (values: unknown[]) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];

function canonicalPriority(movie: Record<string, unknown>): number {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  const currentEpisode = Math.max(0, Number(movie.current_episode || 0) || 0);
  const totalEpisodes = Math.max(currentEpisode, Number(movie.total_episodes || 0) || 0);
  // Publication and real episode coverage outweigh provider branding. This
  // prevents an exact-title shell with one episode from becoming canonical
  // while a same-year record already contains the complete playable series.
  let score = movie.is_published ? 1_000 : 0;
  score += Math.min(currentEpisode, 200) * 20;
  score += Math.min(totalEpisodes, 200) * 2;
  if (source.includes('admin') || source.includes('supabase')) score += 180;
  else if (source.includes('blvietsub')) score += 160;
  else if (source.includes('ophim')) score += 140;
  else if (source.includes('kkphim') || source.includes('phimapi')) score += 130;
  else if (source.includes('glvietsub')) score += 120;
  else if (source.includes('onlyflix')) score += 80;
  return score;
}

export async function findCanonicalMovieByIdentity(
  db: DbClient,
  input: { names: unknown[]; normalizedNames: unknown[]; year: unknown },
) {
  const year = Number(input.year || 0);
  // A title without a verified year is not strong enough to merge two movies.
  if (!Number.isInteger(year) || year < 1888 || year > 2200) return null;

  const fields = 'id,slug,name,origin_name,normalized_name,year,source_site,source_name,current_episode,total_episodes,is_published';
  const candidates: Record<string, unknown>[] = [];
  for (const name of unique(input.names)) {
    for (const column of ['name', 'origin_name']) {
      const { data, error } = await db.from('movies').select(fields).eq('year', year).eq(column, name).limit(20);
      if (!error) candidates.push(...(data || []));
    }
  }
  const normalizedNames = unique(input.normalizedNames);
  if (normalizedNames.length) {
    const { data, error } = await db.from('movies').select(fields).eq('year', year).in('normalized_name', normalizedNames).limit(50);
    if (!error) candidates.push(...(data || []));
  }

  const byId = new Map(candidates.filter((movie) => movie?.id).map((movie) => [String(movie.id), movie]));
  return [...byId.values()].sort((a, b) => canonicalPriority(b) - canonicalPriority(a))[0] || null;
}
