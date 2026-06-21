function epSortKey(ep) {
  const explicit = Number(ep.episode_number ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = ep.slug || ep.name || '';
  const match = text.match(/(\d+)/);
  if (match) return Number(match[1]);
  if (text.toLowerCase().includes('full')) return 0;
  return Infinity;
}

function hasPlayableUrl(ep) {
  return Boolean(ep.link_m3u8?.trim() || ep.link_embed?.trim());
}

function getLatestPlayableEpisodeSlug(episodes) {
  const latest = episodes
    .flatMap((server) => server.server_data ?? [])
    .filter((ep) => hasPlayableUrl(ep) && !ep.is_scheduled)
    .sort((a, b) => epSortKey(b) - epSortKey(a))[0];
  return latest?.slug || latest?.name;
}

function getLatestPlayableEpisode(episodes) {
  return [...episodes]
    .filter((ep) => hasPlayableUrl(ep) && !ep.is_scheduled)
    .sort((a, b) => epSortKey(b) - epSortKey(a))[0] ?? null;
}

function getHighestEpisodeFromServers(episodes) {
  return episodes.reduce((highest, server) => {
    const serverHighest = (server.server_data ?? []).reduce((max, ep) => {
      if (!hasPlayableUrl(ep) || ep.is_scheduled) return max;
      return Math.max(max, epSortKey(ep));
    }, 0);
    return Math.max(highest, serverHighest);
  }, 0);
}

function getAdvertisedCurrentEpisode(detail) {
  return [detail.movie?.current_episode, detail.movie?.episode_current].reduce((max, value) => {
    if (value == null) return max;
    const match = String(value).match(/(\d+)/);
    const num = match ? Number(match[1]) : Number(value);
    return Number.isFinite(num) ? Math.max(max, num) : max;
  }, 0);
}

function shouldRefreshEpisodeDetail(detail) {
  const displayedCurrent = getAdvertisedCurrentEpisode(detail);
  if (displayedCurrent < 2) return false;
  const playableCurrent = getHighestEpisodeFromServers(detail.episodes ?? []);
  return playableCurrent < displayedCurrent;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const servers = [
  {
    server_name: 'Vietsub #1',
    server_data: [
      { name: '1', slug: '1', link_m3u8: 'https://cdn.test/1.m3u8' },
      { name: '2', slug: '2', link_m3u8: 'https://cdn.test/2.m3u8' },
      { name: '6', slug: '6', link_m3u8: 'https://cdn.test/6.m3u8' },
      { name: '7', slug: '7', link_m3u8: '' },
    ],
  },
  {
    server_name: '#Ha Noi (Vietsub)',
    server_data: [
      { name: 'Tap 01', slug: 'tap-01', link_m3u8: 'https://cdn.test/tap-01.m3u8' },
      { name: 'Tap 03', slug: 'tap-03', link_m3u8: 'https://cdn.test/tap-03.m3u8' },
      { name: 'Tap 06', slug: 'tap-06', link_m3u8: 'https://cdn.test/tap-06.m3u8' },
    ],
  },
];

assert(getLatestPlayableEpisodeSlug(servers) === '6', 'Watch now must choose latest playable episode, not episode 1');
assert(getLatestPlayableEpisode(servers[1].server_data)?.slug === 'tap-06', 'Server fallback must choose latest playable episode');
assert(getHighestEpisodeFromServers(servers) === 6, 'Display episode count must reflect playable max');

const metadataEpisode = 148;
const playableEpisode = getHighestEpisodeFromServers([
  { server_name: 'Vietsub #1', server_data: [{ name: '50', slug: '50', link_m3u8: 'https://cdn.test/50.m3u8' }] },
]);
assert(playableEpisode < metadataEpisode, 'Regression fixture should cover metadata higher than playable episodes');

const staleTheAirLikeDetail = {
  movie: { name: 'Gio Thoang Tinh Theo', episode_current: 'Tap 6', current_episode: 6 },
  episodes: [
    { server_name: 'stale server', server_data: [{ name: '1', slug: '1', link_m3u8: 'https://cdn.test/1.m3u8' }] },
  ],
};
const freshTheAirLikeDetail = {
  movie: { name: 'Gio Thoang Tinh Theo', episode_current: 'Tap 6', current_episode: 6 },
  episodes: servers,
};
assert(shouldRefreshEpisodeDetail(staleTheAirLikeDetail), 'Detail page must refresh when badge says episode 6 but only episode 1 is loaded');
assert(!shouldRefreshEpisodeDetail(freshTheAirLikeDetail), 'Detail page must not refresh when playable episodes already match the badge');

console.log('watch-page regression passed');
