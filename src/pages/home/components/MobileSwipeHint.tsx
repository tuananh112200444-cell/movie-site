import { ChevronsRight, Hand } from 'lucide-react';

interface MobileSwipeHintProps {
  visible: boolean;
}

export default function MobileSwipeHint({ visible }: MobileSwipeHintProps) {
  return (
    <div
      className={`mb-1.5 flex min-h-7 items-center justify-end px-0.5 transition-opacity duration-200 md:hidden ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!visible}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold tracking-[0.02em] text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <Hand className="h-3 w-3 text-white/45" aria-hidden="true" />
        Vuốt ngang để xem thêm phim
        <ChevronsRight
          className="h-3.5 w-3.5 animate-pulse text-red-400 motion-reduce:animate-none"
          aria-hidden="true"
        />
      </span>
    </div>
  );
}
