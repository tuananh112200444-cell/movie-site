const endpoint = 'https://dzpddbthdeqbkrcjlzap.supabase.co/functions/v1/search-index-proxy?limit=5000';
const queries = ['In Love Forever', 'Deep In', 'The Eternal Fragrance', 'Love Has Fireworks', 'Viral Hit'];

const res = await fetch(endpoint);
const data = await res.json();
const items = Array.isArray(data.items) ? data.items : [];

const results = queries.map((query) => {
  const needle = query.toLowerCase();
  const matches = items.filter((movie) => [
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.slug,
  ].join(' ').toLowerCase().includes(needle));

  return {
    query,
    count: matches.length,
    matches: matches.map((movie) => ({
      slug: movie.slug,
      name: movie.name,
      origin_name: movie.origin_name,
      episode_current: movie.episode_current,
      source_site: movie.source_site,
    })),
  };
});

console.log(JSON.stringify(results, null, 2));
