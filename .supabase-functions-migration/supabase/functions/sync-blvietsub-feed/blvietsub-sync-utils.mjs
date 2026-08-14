function isBlvietsubWatchPage(value = '') {
  return /^(?:https?:\/\/)?(?:www\.)?blvietsub\.com\/xem-phim\//i.test(String(value || '').trim());
}

export function isPlayableEpisodeLink(episode) {
  const embed = String(episode?.link_embed || '').trim();
  const hls = String(episode?.link_m3u8 || '').trim();
  if (embed && !isBlvietsubWatchPage(embed)) return true;
  if (hls && !isBlvietsubWatchPage(hls)) return true;
  return false;
}

export function countPlayableEpisodes(episodes = []) {
  return episodes.filter((episode) => isPlayableEpisodeLink(episode)).length;
}

export function maxPlayableEpisodeNumber(episodes = []) {
  return episodes.reduce((max, episode) => {
    if (!isPlayableEpisodeLink(episode)) return max;
    return Math.max(max, Number(episode?.episode_number || 0));
  }, 0);
}

export function shouldPublishMovieFromSync({ hasPlayableEpisode = false, hasUsableImage = false } = {}) {
  return Boolean(hasPlayableEpisode && hasUsableImage);
}

export function shouldIncludeMovieForBlvietsubSync(movie = {}) {
  const text = `${movie?.source_site || ''} ${movie?.source_name || ''} ${movie?.showtimes || ''} ${movie?.source_url || ''}`.toLowerCase();
  return text.includes('blvietsub') || text.includes('glvietsub') || text.includes('admin-queer');
}
