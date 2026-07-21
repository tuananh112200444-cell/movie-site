type DbClient = {
  from: (table: string) => any;
};

const unique = (values: unknown[]) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];

function canonicalPriority(movie: Record<string, unknown>): number {
  const source = `${movie.source_site || ''} ${movie.source_name || ''}`.toLowerCase();
  let score = movie.is_published ? 100 : 0;
  if (source.includes('admin') || source.includes('supabase')) score += 500;
  else if (source.includes('blvietsub')) score += 450;
  else if (source.includes('ophim')) score += 400;
  else if (source.includes('kkphim') || source.includes('phimapi')) score += 350;
  else if (source.includes('glvietsub')) score += 200;
  else if (source.includes('onlyflix')) score += 100;
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
