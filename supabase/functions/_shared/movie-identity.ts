type DbClient = {
  from: (table: string) => any;
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

const unique = (values: unknown[]) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];

function normalizedTitleIdentity(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TITLE_FIELDS = ['name', 'origin_name', 'title_vi', 'title_en', 'title_original'] as const;

function movieTitleIdentities(movie: Record<string, unknown>): string[] {
  return unique(TITLE_FIELDS.map((field) => normalizedTitleIdentity(movie[field])));
}

function canonicalPriority(movie: Record<string, unknown>): number {
  const currentEpisode = Math.max(0, Number(movie.current_episode || 0) || 0);
  const totalEpisodes = Math.max(currentEpisode, Number(movie.total_episodes || 0) || 0);
  // Canonical identity is provider-neutral. Publication and real episode
  // completeness decide the winner; provider branding contributes no score.
  let score = movie.is_published ? 1_000 : 0;
  score += Math.min(currentEpisode, 200) * 20;
  score += Math.min(totalEpisodes, 200) * 2;
  return score;
}

export async function findCanonicalMovieByIdentity(
  db: DbClient,
  input: {
    names: unknown[];
    normalizedNames: unknown[];
    year: unknown;
    provider?: unknown;
    providerSlug?: unknown;
    providerId?: unknown;
    tmdbId?: unknown;
    imdbId?: unknown;
    originalTitle?: unknown;
    localizedTitle?: unknown;
    movieType?: unknown;
    season?: unknown;
    createSlug?: unknown;
    sourceName?: unknown;
  },
) {
  const year = Number(input.year || 0);
  const hasVerifiedYear = Number.isInteger(year) && year >= 1888 && year <= 2200;
  const fields = 'id,slug,name,origin_name,title_vi,title_en,title_original,normalized_name,year,source_site,source_name,current_episode,total_episodes,is_published,superseded_by_movie_id';
  const provider = String(input.provider || '').trim().toLowerCase();
  const providerSlug = String(input.providerSlug || '').trim().toLowerCase();
  const inputNames = unique(input.names);
  const inputNormalizedNames = unique([
    ...input.normalizedNames,
    ...inputNames.map(normalizedTitleIdentity),
  ]).filter((value) => value.length >= 6);

  // Prefer an already-published exact catalogue identity before registering a
  // provider identity. This prevents a provider-localized title from creating
  // a second movie when its English/original title already owns the public
  // slug (for example: Crazy Love, Moo-Moo! -> crazy-love-moo-moo).
  const existingCandidates: Record<string, unknown>[] = [];
  for (const normalizedName of inputNormalizedNames) {
    let query = db.from('movies').select(fields)
      .eq('slug', normalizedName)
      .is('superseded_by_movie_id', null)
      .limit(5);
    if (hasVerifiedYear) query = query.eq('year', year);
    const { data, error } = await query;
    if (!error) existingCandidates.push(...(data || []));
  }
  if (existingCandidates.length > 0) {
    return [...new Map(existingCandidates.map((movie) => [String(movie.id), movie])).values()]
      .sort((a, b) => canonicalPriority(b) - canonicalPriority(a))[0] || null;
  }

  // Outside an exact globally-unique slug, a title without a verified year is
  // not strong enough to merge two different movie records.
  if (!hasVerifiedYear) return null;

  if (provider && providerSlug && db.rpc) {
    const originalTitle = String(input.originalTitle || input.names[1] || input.names[0] || '').trim();
    const localizedTitle = String(input.localizedTitle || input.names[0] || originalTitle).trim();
    const { data, error } = await db.rpc('resolve_canonical_movie', {
      p_provider: provider,
      p_provider_slug: providerSlug,
      p_provider_id: String(input.providerId || ''),
      p_tmdb_id: Number(input.tmdbId || 0) || null,
      p_imdb_id: String(input.imdbId || ''),
      p_original_title: originalTitle,
      p_localized_title: localizedTitle,
      p_year: year,
      p_movie_type: String(input.movieType || ''),
      p_season: Number(input.season || 0) || null,
      p_create_slug: String(input.createSlug || `${provider}-${providerSlug}`),
      p_source_name: String(input.sourceName || provider),
    });
    if (error) throw error;
    const resolvedId = String(Array.isArray(data) ? data[0]?.movie_id || '' : data?.movie_id || '');
    if (resolvedId) {
      const { data: resolved, error: lookupError } = await db.from('movies').select(fields).eq('id', resolvedId).maybeSingle();
      if (lookupError) throw lookupError;
      if (resolved?.id) return resolved as Record<string, unknown>;
    }
  }
  const candidates: Record<string, unknown>[] = [];
  let names = inputNames;
  let normalizedNames = inputNormalizedNames;

  // Two exact passes let a bilingual catalogue row bridge provider-localized
  // titles. The mandatory year and exact per-title verification keep this out
  // of fuzzy matching territory.
  for (let pass = 0; pass < 2; pass += 1) {
    const passCandidates: Record<string, unknown>[] = [];
    for (const name of names) {
      const exactCaseInsensitiveName = name.replaceAll('%', '\\%').replaceAll('_', '\\_');
      for (const column of TITLE_FIELDS) {
        const { data, error } = await db.from('movies').select(fields).eq('year', year)
          .is('superseded_by_movie_id', null).ilike(column, exactCaseInsensitiveName).limit(20);
        if (!error) passCandidates.push(...(data || []));
      }
    }

    for (const normalizedName of normalizedNames) {
      const { data, error } = await db.from('movies').select(fields).eq('year', year)
        .is('superseded_by_movie_id', null).ilike('normalized_name', `%${normalizedName}%`).limit(50);
      if (error) continue;
      passCandidates.push(...(data || []).filter((movie: Record<string, unknown>) =>
        movieTitleIdentities(movie).includes(normalizedName)
      ));
    }

    candidates.push(...passCandidates);
    const expandedNames = unique(passCandidates.flatMap((movie) => TITLE_FIELDS.map((field) => movie[field])));
    const expandedNormalizedNames = unique(expandedNames.map(normalizedTitleIdentity)).filter((value) => value.length >= 6);
    if (!expandedNormalizedNames.some((value) => !normalizedNames.includes(value))) break;
    names = unique([...names, ...expandedNames]);
    normalizedNames = unique([...normalizedNames, ...expandedNormalizedNames]);
  }

  const byId = new Map(candidates.filter((movie) => movie?.id).map((movie) => [String(movie.id), movie]));
  return [...byId.values()].sort((a, b) => canonicalPriority(b) - canonicalPriority(a))[0] || null;
}

export async function retireSourceMovieDuplicate(
  db: DbClient,
  input: {
    source: Record<string, unknown> | null | undefined;
    target: Record<string, unknown> | null | undefined;
    provider: string;
  },
): Promise<boolean> {
  const sourceId = String(input.source?.id || '');
  const targetId = String(input.target?.id || '');
  const sourceSlug = String(input.source?.slug || '');
  const targetSlug = String(input.target?.slug || '');
  const provider = String(input.provider || '').toLowerCase();
  const sourceIdentity = `${input.source?.source_site || ''} ${input.source?.source_name || ''}`.toLowerCase();
  if (!sourceId || !targetId || sourceId === targetId || !sourceSlug || !targetSlug || !provider) return false;
  if (!sourceIdentity.includes(provider) && !sourceSlug.startsWith(`${provider}-`)) return false;

  // Collapse any older alias chain directly onto the final canonical movie.
  // Detail lookup intentionally does not guess or recursively follow titles.
  const { error: aliasRedirectError } = await db.from('movie_slug_aliases').update({
    movie_id: targetId,
    canonical_slug: targetSlug,
    reason: `auto-${provider}-canonical-identity`,
    updated_at: new Date().toISOString(),
  }).eq('movie_id', sourceId);
  if (aliasRedirectError) throw aliasRedirectError;

  const { error: aliasError } = await db.from('movie_slug_aliases').upsert({
    alias_slug: sourceSlug,
    movie_id: targetId,
    canonical_slug: targetSlug,
    reason: `auto-${provider}-canonical-identity`,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'alias_slug' });
  if (aliasError) throw aliasError;

  const { error: retireError } = await db.from('movies').update({
    is_published: false,
    seo_catalog_status: 'superseded',
    superseded_by_movie_id: targetId,
    source_site: 'merged',
    source_name: `Merged into ${targetSlug}`,
    tmdb_id: null,
    imdb_id: '',
    ophim_id: '',
    ophim_slug: null,
    updated_at: new Date().toISOString(),
  }).eq('id', sourceId);
  if (retireError) throw retireError;

  // A retired row must no longer own provider identity. Without this redirect,
  // the next sync resolves straight back to the hidden duplicate forever.
  const { error: providerIdentityError } = await db.from('provider_movie_identities')
    .update({ movie_id: targetId, last_seen_at: new Date().toISOString() })
    .eq('movie_id', sourceId);
  if (providerIdentityError) throw providerIdentityError;

  const { error: canonicalIdentityError } = await db.from('canonical_movie_identities')
    .update({ movie_id: targetId, updated_at: new Date().toISOString() })
    .eq('movie_id', sourceId);
  if (canonicalIdentityError) throw canonicalIdentityError;

  await db.from('movie_api_cache').delete().in('slug', [sourceSlug, targetSlug]);
  await db.from('home_page_cache').delete().neq('id', '__never__');
  return true;
}
