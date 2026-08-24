import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const originalFetch = globalThis.fetch;
const qShard = await readFile(new URL('../out/search-fallback/q.json', import.meta.url), 'utf8');
const { onRequest } = await import('../functions/[[path]].js');
let databaseAvailable = false;

globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes('/rest/v1/rpc/search_movies_fast')) {
    if (databaseAvailable) {
      return Response.json([{
        id: 'movie-live-12',
        slug: 'blvietsub-1578-lay-chong-nha-giau',
        name: 'Lấy Chồng Nhà Giàu',
        type: 'phim-bo',
        current_episode: 12,
        total_episodes: 12,
        episode_current: 'Hoàn Tất (12/12)',
        updated_at: '2026-08-24T07:12:28Z',
      }]);
    }
    return Response.json({ message: 'database circuit open' }, { status: 522 });
  }
  if (url.includes('phimapi.com/') || url.includes('vsmov.com/') || url.includes('phim.nguonc.com/')) {
    return Response.json({ items: [] });
  }
  throw new Error(`Unexpected fetch: ${url}`);
};

try {
  const response = await onRequest({
    request: new Request('https://khophim.org/api/search?q=Quang%20Uyen&limit=12'),
    env: {
      ASSETS: {
        fetch: async (request) => {
          const pathname = new URL(request.url).pathname;
          if (pathname === '/search-fallback/q.json') {
            return new Response(qShard, { headers: { 'Content-Type': 'application/json' } });
          }
          return Response.json({ sections: {} });
        },
      },
    },
    waitUntil: () => undefined,
    next: () => new Response('not used'),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-KhoPhim-Search-Cache'), 'FALLBACK');
  const payload = await response.json();
  assert.ok(payload.items.some((movie) => movie.slug === 'blvietsub-6219-quang-uyen-doc-tham'));
  const normalize = (value) => String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  assert.equal(payload.items.filter((movie) => normalize(movie.name).startsWith('quang uyen')).length, 1, 'fallback must expose one canonical Quang Uyen result');

  databaseAvailable = true;
  const liveResponse = await onRequest({
    request: new Request('https://khophim.org/api/search?q=L%E1%BA%A5y%20Ch%E1%BB%93ng%20Nh%C3%A0%20Gi%C3%A0u&limit=12'),
    env: {
      ASSETS: {
        fetch: async (request) => {
          const pathname = new URL(request.url).pathname;
          if (pathname === '/search-fallback/l.json') {
            return Response.json({ items: [{
              id: 'movie-static-10',
              slug: 'blvietsub-1578-lay-chong-nha-giau',
              name: 'Lấy Chồng Nhà Giàu',
              type: 'phim-bo',
              current_episode: 10,
              total_episodes: 10,
              episode_current: 'Hoàn Tất (10/10)',
              updated_at: '2026-08-15T20:52:00Z',
            }] });
          }
          return Response.json({ sections: {} });
        },
      },
    },
    waitUntil: () => undefined,
    next: () => new Response('not used'),
  });
  assert.equal(liveResponse.status, 200);
  const livePayload = await liveResponse.json();
  assert.equal(livePayload.items[0].current_episode, 12, 'live database episode count must override a stale static shard');
  console.log('provider-neutral static search regression passed');
} finally {
  globalThis.fetch = originalFetch;
}
