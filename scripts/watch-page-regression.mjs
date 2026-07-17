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

function getSourceFailureClusterFromUrl(value = '') {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();
  let host = '';
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    host = lower;
  }
  if (!raw) return 'empty';
  if (host.includes('ssplay') || host.includes('abyssplayer') || host.includes('short.icu') || lower.includes('ssplay')) {
    return 'ssplay_abyss';
  }
  if (host.includes('dailymotion.com') || host === 'dai.ly') return 'dailymotion';
  if (host.includes('video.khophim.org') || host.includes('supabase.co')) return 'khophim_direct';
  if (/\.m3u8(?:[?#].*)?$/i.test(raw) || /\.(mp4|webm|mkv|mov)(?:[?#].*)?$/i.test(raw)) {
    return `direct:${host || 'unknown'}`;
  }
  return host || lower.slice(0, 80);
}

function getEpisodeFailureCluster(ep) {
  return getSourceFailureClusterFromUrl(ep?.link_m3u8 || ep?.link_embed || '');
}

function buildFallbackServersAvoidingCluster(servers, activeServer, activeEpisode) {
  const activeHost = activeEpisode?.link_m3u8 || activeEpisode?.link_embed || '';
  const activeCluster = getEpisodeFailureCluster(activeEpisode);
  return servers
    .map((server, index) => ({ server, index }))
    .filter(({ index }) => index !== activeServer)
    .map(({ server, index }) => ({
      index,
      server: {
        ...server,
        server_data: (server.server_data ?? []).filter((ep) => {
          const url = ep.link_m3u8 || ep.link_embed || '';
          return url !== activeHost && getEpisodeFailureCluster(ep) !== activeCluster;
        }),
      },
    }))
    .filter(({ server }) => (server.server_data ?? []).length > 0);
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

const STREAM_SERVER_PRIORITY = ['OPHIM', 'KKPHIM', 'KHOPHIM', 'DM', 'SUPABASE', 'SS', 'OK', 'ABYSS', 'VK'];

function normalizeServerPriorityText(value) {
  return value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getServerPriorityRank(server, episode) {
  const text = normalizeServerPriorityText([
    server.server_name,
    episode?.link_embed,
    episode?.link_m3u8,
  ].filter(Boolean).join(' '));
  const tokens = new Set(text.split(/\s+/).filter(Boolean));
  const compact = text.replace(/\s+/g, '');
  const hasDailymotionSource =
    compact.includes('DAILYMOTION') ||
    compact.includes('DAILY') ||
    compact.includes('DAILYLY') ||
    /(^|[./])dai\.ly/i.test(String(episode?.link_embed || ''));
  const hasOphimSource =
    tokens.has('OPHIM') ||
    compact.includes('OPHIM') ||
    String(episode?.link_embed || episode?.link_m3u8 || '').toLowerCase().includes('ophim') ||
    String(episode?.link_embed || episode?.link_m3u8 || '').toLowerCase().includes('opstream');
  const hasKkphimSource =
    tokens.has('KKPHIM') ||
    tokens.has('PHIMAPI') ||
    compact.includes('KKPHIM') ||
    compact.includes('PHIMAPI') ||
    String(episode?.link_embed || episode?.link_m3u8 || '').toLowerCase().includes('kkphim') ||
    String(episode?.link_embed || episode?.link_m3u8 || '').toLowerCase().includes('phimapi');
  const isOwnHlsSource = Boolean(episode?.link_m3u8) && (
    compact.includes('KHOPHIM') ||
    compact.includes('VIDEOKHOPHIMORG') ||
    compact.includes('SUPABASE')
  );
  if (hasOphimSource) return STREAM_SERVER_PRIORITY.indexOf('OPHIM');
  if (hasKkphimSource) return STREAM_SERVER_PRIORITY.indexOf('KKPHIM');
  if (hasDailymotionSource && !isOwnHlsSource) return STREAM_SERVER_PRIORITY.indexOf('DM');
  if (tokens.has('KHOPHIM') || compact.includes('KHOPHIM') || compact.includes('VIDEOKHOPHIMORG')) {
    return STREAM_SERVER_PRIORITY.indexOf('KHOPHIM');
  }
  if (tokens.has('SUPABASE') || compact.includes('SUPABASE')) return STREAM_SERVER_PRIORITY.indexOf('SUPABASE');
  if (tokens.has('DM') || tokens.has('DAILYMOTION') || compact.includes('DAILYMOTION') || compact.includes('DAILY')) {
    return STREAM_SERVER_PRIORITY.indexOf('DM');
  }
  if (tokens.has('SS') || compact.includes('SSPLAY')) return STREAM_SERVER_PRIORITY.indexOf('SS');
  if (tokens.has('ABYSS') || compact.includes('ABYSSPLAYER') || compact.includes('SHORTICU')) {
    return STREAM_SERVER_PRIORITY.indexOf('ABYSS');
  }
  const rank = STREAM_SERVER_PRIORITY.findIndex((code) =>
    code !== 'SUPABASE' && (
      tokens.has(code) ||
      compact.includes(`SERVER${code}`) ||
      compact.includes(`SV${code}`)
    )
  );
  return rank >= 0 ? rank : STREAM_SERVER_PRIORITY.length;
}

function pickBestEpisodeByPriority(episodes, targetEpSlug) {
  const candidates = [];
  for (let serverIndex = 0; serverIndex < episodes.length; serverIndex++) {
    const server = episodes[serverIndex];
    for (const episode of server.server_data ?? []) {
      if (targetEpSlug && episode.slug !== targetEpSlug && episode.name !== targetEpSlug) continue;
      if (!hasPlayableUrl(episode)) continue;
      candidates.push({
        serverIndex,
        episode,
        priorityRank: getServerPriorityRank(server, episode),
      });
    }
  }
  candidates.sort((a, b) => a.priorityRank - b.priorityRank);
  return candidates[0] ?? null;
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

function shouldRaceOphimAsQuickSource(slug, source) {
  const isOphimSource = source === 'ophim';
  const looksLikeCjk = Array.from(slug).some((char) => char.charCodeAt(0) > 127);
  return isOphimSource && looksLikeCjk;
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

const multiSourceEpisode = [
  {
    server_name: 'Server ABYSS',
    server_data: [{ name: 'Tập 24', slug: 'tap-24', link_embed: 'https://short.icu/slow' }],
  },
  {
    server_name: 'Server Dailymotion',
    server_data: [{ name: 'Tập 24', slug: 'tap-24', link_embed: 'https://www.dailymotion.com/video/x123456' }],
  },
  {
    server_name: 'Server SS',
    server_data: [{ name: 'Tập 24', slug: 'tap-24', link_embed: 'https://ssplay.test/embed/x' }],
  },
];
assert(
  pickBestEpisodeByPriority(multiSourceEpisode, 'tap-24')?.serverIndex === 1,
  'Dailymotion embed should be preferred over slower third-party embed sources for the same episode'
);

const ssplayActiveWithAbyssMirror = [
  {
    server_name: 'Server SS',
    server_data: [{ name: 'Tap 24', slug: 'tap-24', link_embed: 'https://ssplay.net/v/demo.html' }],
  },
  {
    server_name: 'Server ABYSS',
    server_data: [{ name: 'Tap 24', slug: 'tap-24', link_embed: 'https://short.icu/mirror' }],
  },
  {
    server_name: 'Server Dailymotion',
    server_data: [{ name: 'Tap 24', slug: 'tap-24', link_embed: 'https://www.dailymotion.com/video/x123456' }],
  },
];
const clusterSafeFallbacks = buildFallbackServersAvoidingCluster(
  ssplayActiveWithAbyssMirror,
  0,
  ssplayActiveWithAbyssMirror[0].server_data[0]
);
assert(
  clusterSafeFallbacks.length === 1 && clusterSafeFallbacks[0].index === 2,
  'Fallback must skip Abyss when the failed source is ssplay because both share the same failure cluster'
);

const directUnknownVsDaily = [
  {
    server_name: 'Server HLS',
    server_data: [{ name: 'Tập 24', slug: 'tap-24', link_m3u8: 'https://unknown-slow.test/video.m3u8' }],
  },
  {
    server_name: 'Server Dailymotion',
    server_data: [{ name: 'Tập 24', slug: 'tap-24', link_embed: 'https://www.dailymotion.com/video/x123456' }],
  },
];
assert(
  pickBestEpisodeByPriority(directUnknownVsDaily, 'tap-24')?.serverIndex === 1,
  'Dailymotion should beat unknown direct HLS when both have the same episode'
);

const ownHlsVsDaily = [
  {
    server_name: 'KhoPhim',
    server_data: [{ name: 'Tập 24', slug: 'tap-24', link_m3u8: 'https://video.khophim.org/movie/tap-24.m3u8' }],
  },
  {
    server_name: 'Server Dailymotion',
    server_data: [{ name: 'Tập 24', slug: 'tap-24', link_embed: 'https://www.dailymotion.com/video/x123456' }],
  },
];
assert(
  pickBestEpisodeByPriority(ownHlsVsDaily, 'tap-24')?.serverIndex === 0,
  'KhoPhim HLS should still be preferred over Dailymotion'
);

const ophimFastButBehindBlvietsub = [
  {
    server_name: 'OPhim verified - Vietsub',
    server_data: [
      { name: 'Tap 1', slug: 'tap-1', link_m3u8: 'https://opstream.test/movie/tap-1.m3u8' },
      { name: 'Tap 2', slug: 'tap-2', link_m3u8: 'https://opstream.test/movie/tap-2.m3u8' },
      { name: 'Tap 5', slug: 'tap-5', link_m3u8: 'https://opstream.test/movie/tap-5.m3u8' },
    ],
  },
  {
    server_name: 'BLVietsub SS',
    server_data: [
      { name: 'Tap 1', slug: 'tap-1', link_embed: 'https://ssplay.net/v/tap-1.html' },
      { name: 'Tap 2', slug: 'tap-2', link_embed: 'https://ssplay.net/v/tap-2.html' },
      { name: 'Tap 6', slug: 'tap-6', link_embed: 'https://ssplay.net/v/tap-6.html' },
    ],
  },
];
assert(
  pickBestEpisodeByPriority(ophimFastButBehindBlvietsub, 'tap-2')?.serverIndex === 0,
  'Verified OPhim should be preferred for the same episode when it has a stronger source'
);
assert(
  pickBestEpisodeByPriority(ophimFastButBehindBlvietsub, 'tap-6')?.serverIndex === 1,
  'BLVietsub must serve newer episodes when verified OPhim is behind'
);
assert(
  getHighestEpisodeFromServers(ophimFastButBehindBlvietsub) === 6,
  'Episode brain must keep the highest playable episode across all verified sources'
);

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
assert(!shouldRaceOphimAsQuickSource('chasing-love', 'ophim'), 'ASCII source=ophim pages must not let stale OPhim detail beat stored/proxy data');
assert(shouldRaceOphimAsQuickSource('长安的荔枝', 'ophim'), 'CJK/non-ASCII OPhim slugs may still use direct OPhim as a quick source');

console.log('watch-page regression passed');
