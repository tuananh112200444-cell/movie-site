import type { MovieItem } from '../types/movie';
import { normalizeSearchText } from './searchHelper';

export type SearchReleaseKind = 'season' | 'arc' | 'movie' | 'tv-version' | 'special' | 'series';

export interface SearchReleaseMeta {
  kind: SearchReleaseKind;
  label: string;
  detail: string;
  episodeLabel: string;
}

function positiveNumber(value?: string | number): number {
  if (value === undefined || value === null) return 0;
  const matches = String(value).match(/\d+/g)?.map(Number).filter((item) => Number.isFinite(item) && item > 0) ?? [];
  return matches.length ? Math.max(...matches) : 0;
}

function seasonNumber(movie: MovieItem): number {
  const text = normalizeSearchText([
    movie.name,
    movie.origin_name,
    movie.title_vi,
    movie.title_en,
    movie.slug?.replace(/-/g, ' '),
  ].filter(Boolean).join(' '));
  const match = text.match(/\b(?:season|ss|phan|mua|part)\s*(\d{1,2})\b/)
    ?? text.match(/\bs(\d{1,2})\b/);
  return match?.[1] ? Number(match[1]) : 0;
}

function arcName(movie: MovieItem): string {
  const combined = `${movie.name || ''} ${movie.origin_name || ''}`;
  const knownArcs: Array<[RegExp, string]> = [
    [/kamado tanjiro|unwavering resolve/i, 'Kamado Tanjiro Lập Chí'],
    [/mugen train|chuyến tàu vô tận/i, 'Chuyến Tàu Vô Tận'],
    [/entertainment district|kỹ viện trấn|phố đèn đỏ|khu phố ăn chơi/i, 'Kỹ Viện Trấn'],
    [/swordsmith village|làng thợ rèn|làng rèn kiếm/i, 'Làng Thợ Rèn'],
    [/hashira training|đại trụ đặc huấn|huấn luyện trụ cột/i, 'Đại Trụ Đặc Huấn'],
    [/infinity castle|vô hạn thành/i, 'Vô Hạn Thành'],
  ];
  return knownArcs.find(([pattern]) => pattern.test(combined))?.[1] ?? '';
}

export function getSafeSearchEpisodeLabel(movie: MovieItem): string {
  const raw = String(movie.episode_current || '').trim();
  if (/^full$/i.test(raw) || movie.type === 'single') return 'Full';

  const currentFromColumn = positiveNumber(movie.current_episode);
  const currentFromText = positiveNumber(raw);
  const total = Math.max(positiveNumber(movie.total_episodes), positiveNumber(movie.episode_total));
  const candidates = [currentFromColumn, currentFromText].filter((value) => value > 0);
  const credible = total > 0 ? candidates.filter((value) => value <= total) : candidates;
  const current = credible.length ? Math.max(...credible) : 0;

  // When no total is known, very large values are usually a leaked resolution,
  // bitrate or release year. Do not present them as an episode number.
  if (total === 0 && current >= 250) return 'Đang cập nhật';

  if (/^(hoàn tất|hoan tat)/i.test(raw) && current > 0) {
    return total > 0 ? `Hoàn tất ${current}/${total}` : `Hoàn tất ${current} tập`;
  }
  if (current > 0 && total > 0 && current === total) return `Hoàn tất ${current}/${total}`;
  if (current > 0) return `Tập ${current}`;
  if (total > 0) return `${total} tập`;
  return raw && !/^tập\s*(?:1080|720|480|360)$/i.test(raw) ? raw : 'Đang cập nhật';
}

export function getSearchReleaseMeta(movie: MovieItem): SearchReleaseMeta {
  const text = normalizeSearchText(`${movie.name || ''} ${movie.origin_name || ''} ${movie.slug || ''}`);
  const season = seasonNumber(movie);
  const arc = arcName(movie);
  const isTvVersion = /\bban tv\b|\btv version\b/.test(text);
  const isSpecial = /\bdac biet\b|\bspecial\b|\btong hop\b|\bcompilation\b|特別編集版/.test(`${text} ${movie.origin_name || ''}`);
  const isMovie = movie.type === 'single'
    || Boolean(movie.chieurap)
    || /\bthe movie\b|\bmovie\b|\bdien anh\b|\bvo han thanh\b/.test(text);

  let kind: SearchReleaseKind = 'series';
  let label = 'Loạt phim';
  if (isTvVersion) {
    kind = 'tv-version';
    label = 'Bản TV';
  } else if (isSpecial) {
    kind = 'special';
    label = 'Bản đặc biệt';
  } else if (season > 0) {
    kind = 'season';
    label = `Phần ${season}`;
  } else if (isMovie) {
    kind = 'movie';
    label = 'Phim điện ảnh';
  } else if (arc) {
    kind = 'arc';
    label = 'Arc';
  } else if (Math.max(positiveNumber(movie.total_episodes), positiveNumber(movie.episode_total)) > 1) {
    kind = 'season';
    label = 'Mùa mở đầu';
  }

  return {
    kind,
    label,
    detail: arc && label !== arc ? arc : '',
    episodeLabel: getSafeSearchEpisodeLabel(movie),
  };
}
