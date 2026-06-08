import { useMemo } from 'react';
import { useServerNow } from '@/hooks/useServerNow';
import type { MovieDetail, MovieItem } from '@/types/movie';
import { formatCompactTimeLeft, formatVerboseTimeLeft, getMovieCountdownInfo, getTimeLeft } from '@/utils/movieSchedule';

interface Props {
  movie: MovieItem | MovieDetail;
  variant?: 'card' | 'hero';
}

export default function MovieCountdown({ movie, variant = 'card' }: Props) {
  const now = useServerNow(true);
  const countdown = useMemo(() => getMovieCountdownInfo(movie, now), [movie, now]);

  if (!countdown) return null;

  if (countdown.kind === 'completed') {
    if (variant !== 'hero') return null;
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-2 text-emerald-300">
        <i className="ri-checkbox-circle-line" />
        <span className="text-xs sm:text-sm font-bold">Đã hoàn thành</span>
      </div>
    );
  }

  if (!countdown.targetAt) return null;
  const left = getTimeLeft(countdown.targetAt, now);
  if (left.totalMs <= 0) return null;

  if (variant === 'hero') {
    return (
      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2 text-amber-300">
          <i className="ri-timer-flash-line text-base" />
          <span className="text-xs sm:text-sm font-bold">{countdown.label}</span>
        </div>
        <div className="mt-1 font-mono text-lg sm:text-2xl font-black text-white">
          {formatVerboseTimeLeft(left)}
        </div>
        {countdown.note && <p className="mt-1 text-[11px] text-white/40">{countdown.note}</p>}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/95 px-1.5 py-0.5 text-[9px] font-black text-black shadow-sm">
      <i className="ri-timer-flash-line text-[10px]" />
      {countdown.targetEpisodeNumber ? `T${countdown.targetEpisodeNumber} ` : ''}
      {formatCompactTimeLeft(left)}
    </span>
  );
}
