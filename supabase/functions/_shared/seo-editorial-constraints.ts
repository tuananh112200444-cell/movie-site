type EditorialMovieFacts = {
  name?: unknown;
  origin_name?: unknown;
  year?: unknown;
};

type EditorialPayload = {
  seo_title?: string;
  meta_description?: string;
  secondary_keywords?: string[];
  movie_patch?: EditorialMovieFacts;
};

function plain(value: unknown): string {
  return String(value ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalized(value: string): string {
  return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
}

function shortenSentence(value: string, maxLength: number): string {
  const clean = plain(value);
  if (clean.length <= maxLength) return clean;
  const slice = clean.slice(0, Math.max(1, maxLength - 1));
  const boundary = slice.lastIndexOf(' ');
  return `${slice.slice(0, boundary >= Math.floor(maxLength * 0.65) ? boundary : slice.length).replace(/[\s,;:–—-]+$/g, '')}.`;
}

function movieName(facts: EditorialMovieFacts = {}): string {
  return plain(facts.name) || plain(facts.origin_name) || 'Phim';
}

export function normalizeMetaDescription(value: unknown, facts: EditorialMovieFacts = {}): string {
  const current = plain(value);
  if (current.length >= 100 && current.length <= 165) return current;
  if (current.length > 165) return shortenSentence(current, 160);

  const name = movieName(facts);
  const origin = plain(facts.origin_name);
  const year = Number(facts.year || 0);
  const identity = origin && normalized(origin) !== normalized(name) ? `${name} (${origin})` : name;
  const candidates = [
    `${identity}${year ? `, phim ${year}` : ''}: nội dung, diễn viên, đạo diễn, trailer và thông tin phát hành được cập nhật tại KhoPhim.`,
    `${identity}${year ? ` (${year})` : ''} – xem nội dung, diễn viên, đạo diễn, trailer và tình trạng phát hành được cập nhật chính xác tại KhoPhim.`,
  ];
  const selected = candidates.find((item) => item.length >= 100 && item.length <= 165) || candidates[candidates.length - 1];
  if (selected.length < 100) {
    return shortenSentence(`${selected.replace(/[.!?]+$/g, '')}; theo dõi các thông tin mới trên cùng trang phim.`, 160);
  }
  return shortenSentence(selected, 160);
}

export function normalizeSeoTitle(value: unknown, facts: EditorialMovieFacts = {}): string {
  const current = plain(value);
  if (current.length >= 32 && current.length <= 68) return current;
  const name = movieName(facts);
  const year = Number(facts.year || 0);
  const preferred = `${name}${year ? ` (${year})` : ''} – Nội Dung, Diễn Viên | KhoPhim`;
  if (preferred.length <= 68) return preferred;
  const compact = `${name}${year ? ` (${year})` : ''} | KhoPhim`;
  return shortenSentence(compact, 68).replace(/\.$/, '');
}

export function normalizeSecondaryKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const keyword = plain(entry).slice(0, 160);
    const key = normalized(keyword);
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= 20) break;
  }
  return result;
}

export function applyDeterministicEditorialConstraints<T extends EditorialPayload>(payload: T): T {
  return {
    ...payload,
    seo_title: normalizeSeoTitle(payload.seo_title, payload.movie_patch),
    meta_description: normalizeMetaDescription(payload.meta_description, payload.movie_patch),
    secondary_keywords: normalizeSecondaryKeywords(payload.secondary_keywords),
  };
}
