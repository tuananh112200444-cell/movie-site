type CatalogFetchOptions = { baseUrl: string; publicKey: string };
export function createPublicCatalogFetch(options: CatalogFetchOptions): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (typeof window === 'undefined' || /^\/admin(?:\/|$)/.test(window.location.pathname)) return fetch(request);
    const url = new URL(request.url);
    const base = new URL(options.baseUrl);
    const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i,'');
    if (url.origin !== base.origin || !url.pathname.startsWith('/rest/v1/')
      || (bearer && bearer !== options.publicKey)
      || (request.headers.get('apikey') && request.headers.get('apikey') !== options.publicKey)
      || (request.headers.get('accept-profile') && request.headers.get('accept-profile') !== 'public')
      || request.headers.has('range')) return fetch(request);
    const path = url.pathname.slice('/rest/v1/'.length);
    const params = new URLSearchParams(url.search);
    if (path === 'movies' && request.method === 'GET') {
      const limit=Number(params.get('limit'));
      const allowed=new Set(['select','is_published','superseded_by_movie_id','seo_catalog_status','episode_current','type','year','category','country','order','limit','offset','or','and','source_site','source_name','slug','id','current_episode','total_episodes','tmdb_vote_average','tmdb_vote_count','tmdb_popularity','name','origin_name','normalized_name','title_vi','title_en','title_zh','created_at','last_episode_change_at','published_at']);
      for(const key of params.keys()) if(!allowed.has(key))return fetch(request);
      if (!['eq.true','is.true'].includes(params.get('is_published') || '')
        || !Number.isInteger(limit) || limit<1 || limit>72
        || !/^[\w, ]+$/.test(params.get('select') || '')) return fetch(request);
    } else if (['rpc/get_stable_catalog_feed','rpc/get_top10_movies_today'].includes(path) && ['POST','GET'].includes(request.method)) {
      if(request.method==='POST') {
        let body: Record<string,unknown>;
        try { body=JSON.parse(await request.clone().text()); } catch { return fetch(request); }
        for(const [key,value] of Object.entries(body)) {
          if(value===null || !['string','number'].includes(typeof value)) return fetch(request);
          params.set(key,String(value));
        }
      }
    } else return fetch(request);
    const prefer=request.headers.get('prefer') || '';
    if(prefer) {
      const match=/^count=(exact|planned|estimated)$/.exec(prefer);
      if(!match)return fetch(request);
      params.set('__count',match[1]);
    }
    const proxy=new URL('/api/catalog-read/'+path,window.location.origin);
    proxy.search=params.toString();
    return fetch(proxy,{method:'GET',headers:{Accept:'application/json'},credentials:'omit',signal:request.signal});
  };
}

