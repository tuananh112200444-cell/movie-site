import { getAudioLanguageClass, getAudioLanguageLabels } from '@/utils/audioLanguage';

export default function AudioLanguageBadges({
  value,
  compact = false,
  className = '',
}: {
  value?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const labels = getAudioLanguageLabels(value);
  if (!labels.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} aria-label={`Phiên bản: ${labels.map((item) => item.label).join(', ')}`}>
      {labels.map((item) => (
        <span
          key={item.kind}
          className={`${getAudioLanguageClass(item.kind)} inline-flex items-center gap-1 rounded-md border font-bold leading-none ${compact ? 'px-1.5 py-1 text-[9px]' : 'px-2 py-1 text-[10px] sm:text-xs'}`}
        >
          <i className={item.kind === 'vietsub' ? 'ri-file-text-line' : item.kind === 'thuyetminh' ? 'ri-mic-2-line' : item.kind === 'longtieng' ? 'ri-volume-up-line' : 'ri-translate-2'} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </span>
  );
}
