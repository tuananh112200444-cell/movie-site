import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const originalFetch = globalThis.fetch;
const { onRequest } = await import('../functions/[[path]].js');

function playablePayload(slug, provider) {
  return {
    status: true,
    movie: { slug, name: `${provider} movie`, is_published: true },
    episodes: [{
      server_name: provider,
      server_data: [{ name: 'Full', slug: 'full', link_m3u8: `https://stream.example/${provider}.m3u8`, link_embed: '' }],
    }],
  };
}

function playableNguoncPayload(slug) {
  return {
    status: 'success',
    movie: {
      slug,
      name: 'NguồnC movie',
      episodes: [{
        server_name: 'NguồnC',
        items: [{ name: '1', slug: 'tap-1', embed: 'https://embed.example/nguonc' }],
      }],
    },
  };
}

function contextFor(slug, upstreamResponse, providerStatus = {}, preferredSource = '', localCanonical = null) {
  const providerCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes('/functions/v1/movie-detail-proxy')) {
      const requested = new URL(url).searchParams.get('slug');
      if (localCanonical && requested === localCanonical.slug) {
        return Response.json(playablePayload(localCanonical.slug, 'BLVIETSUB'));
      }
      if (upstreamResponse instanceof Error) throw upstreamResponse;
      return upstreamResponse;
    }
    if (url.includes('/rest/v1/rpc/search_movies_fast')) {
      return Response.json(localCanonical ? [localCanonical] : []);
    }
    const provider = url.startsWith('https://phimapi.com/phim/')
      ? 'KKPHIM'
      : url.startsWith('https://vsmov.com/api/phim/')
        ? 'VSMOV'
        : url.startsWith('https://phim.nguonc.com/api/film/')
          ? 'NGUONC'
        : url.startsWith('https://ophim1.com/phim/')
          ? 'OPHIM'
          : '';
    if (provider) {
      providerCalls.push(provider);
      if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const configured = providerStatus[provider] ?? (provider === 'KKPHIM' ? 'playable' : 'missing');
      if (configured === 'playable') {
        return Response.json(provider === 'NGUONC' ? playableNguoncPayload(slug) : playablePayload(slug, provider));
      }
      if (configured === 'metadata') return Response.json({ status: true, movie: { slug, name: `${provider} movie` }, episodes: [] });
      return Response.json({ status: false, message: 'not found' }, { status: 404 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return {
    providerCalls,
    context: {
      request: new Request(`https://khophim.org/api/movie-detail?slug=${slug}${preferredSource ? `&source=${preferredSource}` : ''}`),
      env: {
        MOVIE_DETAIL_PROXY_SECRET: 'test-secret',
      },
      waitUntil: () => undefined,
      next: () => new Response('not used'),
    },
  };
}

try {
  {
    const { context } = contextFor(
      'nguonc-only-movie',
      new DOMException('timed out', 'TimeoutError'),
      { KKPHIM: 'missing', VSMOV: 'missing', NGUONC: 'playable', OPHIM: 'missing' },
      'nguonc',
    );
    const response = await onRequest(context);
    assert.equal(response.status, 200, 'NguồnC item/embed payload must be normalized into the site playback contract');
    assert.equal(response.headers.get('X-KhoPhim-Detail-Fallback'), 'NGUONC');
    const detail = await response.json();
    assert.equal(detail.episodes[0].server_data[0].link_embed, 'https://embed.example/nguonc');
  }

  {
    const slowUpstream = new Promise((resolve) => setTimeout(
      () => resolve(Response.json({ status: false, message: 'unavailable' }, { status: 503 })),
      2200,
    ));
    const { context } = contextFor('cinema-movie', slowUpstream);
    const startedAt = Date.now();
    const response = await onRequest(context);
    assert.equal(response.status, 200, 'a slow primary must fail over before the browser proxy budget expires');
    assert.ok(Date.now() - startedAt < 2800, 'trusted failover must complete inside the browser three-second budget');
    assert.equal(response.headers.get('X-KhoPhim-Detail-Fallback'), 'KKPHIM');
  }

  {
    const { context, providerCalls } = contextFor(
      'ophim-catalogue-movie',
      new DOMException('timed out', 'TimeoutError'),
      { KKPHIM: 'playable', VSMOV: 'missing', OPHIM: 'playable' },
      'ophim',
    );
    const response = await onRequest(context);
    assert.equal(response.status, 200);
    assert.ok(providerCalls.includes('KKPHIM'));
    assert.ok(!providerCalls.includes('OPHIM'), 'retired OPhim transport must never join the playback pool');
    assert.equal(response.headers.get('X-KhoPhim-Detail-Fallback'), 'KKPHIM');
  }

  {
    const { context, providerCalls } = contextFor('cinema-movie', new DOMException('timed out', 'TimeoutError'));
    const response = await onRequest(context);
    assert.equal(response.status, 200, 'a KKPhim catalogue movie must cover a Supabase timeout');
    assert.equal(response.headers.get('X-KhoPhim-Detail-Fallback'), 'KKPHIM');
    assert.ok(providerCalls.includes('KKPHIM'));
    assert.equal((await response.json()).movie.slug, 'cinema-movie');
  }

  {
    const { context, providerCalls } = contextFor(
      'ophim-only-movie',
      new DOMException('timed out', 'TimeoutError'),
      { KKPHIM: 'missing', VSMOV: 'missing', OPHIM: 'playable' },
    );
    const response = await onRequest(context);
    assert.equal(response.status, 503, 'retired OPhim transport must not be resurrected as a last resort');
    assert.ok(providerCalls.includes('KKPHIM'));
    assert.ok(!providerCalls.includes('OPHIM'));
  }

  {
    const { context } = contextFor(
      'metadata-only-movie',
      Response.json({ status: true, movie: { slug: 'metadata-only-movie', name: 'Metadata Only', year: 2026, type: 'single' }, episodes: [] }),
      { KKPHIM: 'playable', VSMOV: 'missing', NGUONC: 'missing' },
    );
    const response = await onRequest(context);
    assert.equal(response.status, 200, 'HTTP 200 with zero playable episodes must use a healthy provider fallback');
    assert.equal(response.headers.get('X-KhoPhim-Detail-Fallback'), 'KKPHIM');
    assert.ok((await response.json()).episodes[0].server_data.length > 0);
  }

  {
    const localCanonical = {
      slug: 'blvietsub-quang-uyen-doc-tham',
      name: 'Quang Uyên (Đọc Thầm)',
      source_site: 'blvietsub',
      source_name: 'BLVietsub',
      type: 'series',
    };
    const { context } = contextFor(
      'quang-uyen',
      Response.json({ status: true, movie: { slug: 'quang-uyen', name: 'Quang Uyên', type: 'series' }, episodes: [] }),
      { KKPHIM: 'missing', VSMOV: 'missing', NGUONC: 'missing' },
      '',
      localCanonical,
    );
    const response = await onRequest(context);
    assert.equal(response.status, 200, 'a playable local canonical duplicate must rescue the legacy slug');
    assert.equal(response.headers.get('X-KhoPhim-Detail-Fallback'), 'LOCAL_CANONICAL');
    const detail = await response.json();
    assert.equal(detail.movie.slug, 'quang-uyen');
    assert.equal(detail.movie.canonical_slug, localCanonical.slug);
    assert.ok(detail.episodes[0].server_data.length > 0);
  }

  {
    const { context, providerCalls } = contextFor(
      'cinema-movie',
      Response.json({ status: false, message: 'Movie is not currently available' }, { status: 404 }),
    );
    const response = await onRequest(context);
    assert.equal(response.status, 404, 'an authoritative quarantine/not-found response must remain authoritative');
    assert.equal(response.headers.get('X-KhoPhim-Detail-Fallback'), null);
    assert.ok(providerCalls.length >= 1, 'provider rescue may start in parallel but must never override quarantine');
  }


  const edgeDetail = await readFile(new URL('../supabase/functions/movie-detail-proxy/index.ts', import.meta.url), 'utf8');
  assert.match(edgeDetail, /const catalogReadUnavailable = !!exactCatalogError/);
  assert.match(edgeDetail, /const cachedDetailPromise = forceRefresh/);
  assert.match(edgeDetail, /timeoutSignal\(6000\)/);
  assert.match(edgeDetail, /\.select\(MOVIE_DETAIL_SELECT\)[\s\S]*?\.eq\('slug', slug\)/);
  assert.match(edgeDetail, /catalogReadUnavailable \|\| movie \? \[\] : slugVariants/);
  assert.doesNotMatch(edgeDetail, /trackedPromises\[0\]/);
  assert.match(edgeDetail, /phim\.nguonc\.com\/api\/film/);
  assert.match(edgeDetail, /Array\.isArray\(server\.items\)/);
  assert.match(edgeDetail, /Promise\.allSettled\(trackedPromises\)/);
  assert.doesNotMatch(edgeDetail, /providerRank/);
  assert.match(edgeDetail, /targetTmdbIds\.has\(item\.tmdbId\)/, 'alias rescue must verify the same TMDB identity');
  assert.match(edgeDetail, /sameTitle && sameYear/, 'title aliases must also match the release year');
  assert.match(edgeDetail, /mergeMovieDataForRequestedSlug\(\{\}, external\.movie, slug\)/, 'alias rescue must preserve the requested canonical slug');

  console.log('Movie detail outage regression passed.');
} finally {
  globalThis.fetch = originalFetch;
}
