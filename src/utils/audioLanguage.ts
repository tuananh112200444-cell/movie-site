export type AudioLanguageKind = 'vietsub' | 'thuyetminh' | 'longtieng' | 'english' | 'raw' | 'unknown';

export interface AudioLanguageLabel {
  kind: AudioLanguageKind;
  label: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

export function getAudioLanguageLabels(value?: string | null): AudioLanguageLabel[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const text = normalize(raw);
  const labels: AudioLanguageLabel[] = [];
  if (/\braw\b|chua\s*sub|khong\s*sub/.test(text)) labels.push({ kind: 'raw', label: 'RAW · Chưa phụ đề' });
  if (/viet\s*sub|\bsub\b|phu\s*de/.test(text)) labels.push({ kind: 'vietsub', label: 'Vietsub' });
  if (/thuyet\s*minh|\btm\b|voice\s*over/.test(text)) labels.push({ kind: 'thuyetminh', label: 'Thuyết minh' });
  if (/long\s*tieng|\blt\b|dubbed|\bdub\b/.test(text)) labels.push({ kind: 'longtieng', label: 'Lồng tiếng' });
  if (/tieng\s*anh|english|(^|[^a-z])en([^a-z]|$)/.test(text)) labels.push({ kind: 'english', label: 'Tiếng Anh' });
  if (labels.length) return labels;
  return [{ kind: 'unknown', label: raw.length > 28 ? `${raw.slice(0, 27)}…` : raw }];
}

export function getAudioLanguageClass(kind: AudioLanguageKind): string {
  if (kind === 'raw') return 'border-violet-300/40 bg-violet-500/20 text-violet-100';
  if (kind === 'vietsub') return 'border-emerald-400/35 bg-emerald-500/20 text-emerald-200';
  if (kind === 'thuyetminh') return 'border-orange-400/35 bg-orange-500/20 text-orange-200';
  if (kind === 'longtieng') return 'border-amber-300/40 bg-amber-400/20 text-amber-100';
  if (kind === 'english') return 'border-sky-300/35 bg-sky-500/20 text-sky-100';
  return 'border-white/15 bg-black/55 text-white/75';
}
