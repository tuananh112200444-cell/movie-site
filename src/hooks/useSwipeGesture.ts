import { useRef, useState, useCallback } from 'react';

interface SwipeOptions {
  /** Ngưỡng tối thiểu (px) để trigger swipe */
  threshold?: number;
  /** Ngưỡng dọc tối đa (px). Vượt quá thì cancel swipe ngang */
  verticalThreshold?: number;
  /** Thời gian tối đa (ms). Swipe quá chậm thì không tính */
  maxDuration?: number;
  /** Callback khi swipe trái (x < 0) đủ ngưỡng */
  onSwipeLeft?: () => void;
  /** Callback khi swipe phải (x > 0) đủ ngưỡng */
  onSwipeRight?: () => void;
}

interface SwipeState {
  isSwiping: boolean;
  direction: 'left' | 'right' | null;
  /** Tỉ lệ 0..1 của swipe hiện tại */
  progress: number;
}

export function useSwipeGesture(options: SwipeOptions) {
  const {
    threshold = 60,
    verticalThreshold = 50,
    maxDuration = 500,
    onSwipeLeft,
    onSwipeRight,
  } = options;

  const [state, setState] = useState<SwipeState>({
    isSwiping: false,
    direction: null,
    progress: 0,
  });

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTouchX = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    lastTouchX.current = t.clientX;
    setState({ isSwiping: true, direction: null, progress: 0 });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    lastTouchX.current = t.clientX;

    // Nếu dọc quá nhiều → cancel swipe ngang
    if (Math.abs(dy) > verticalThreshold) {
      touchStart.current = null;
      setState({ isSwiping: false, direction: null, progress: 0 });
      return;
    }

    // Chỉ tính khi ngang đủ lớn
    if (Math.abs(dx) > 10) {
      const direction = dx > 0 ? 'right' : 'left';
      const progress = Math.min(Math.abs(dx) / threshold, 1);
      setState({ isSwiping: true, direction, progress });
    }
  }, [threshold, verticalThreshold]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;

    const start = touchStart.current;
    touchStart.current = null;

    const elapsed = Date.now() - start.time;
    // Lấy vị trí cuối từ changedTouches thay vì state (an toàn hơn)
    const endX = e.changedTouches[0]?.clientX ?? lastTouchX.current;
    const dx = endX - start.x;

    // Reset state visual trước
    setState({ isSwiping: false, direction: null, progress: 0 });

    // Kiểm tra điều kiện trigger
    if (elapsed > maxDuration) return;
    if (Math.abs(dx) < threshold) return;

    if (dx < 0 && onSwipeLeft) {
      onSwipeLeft();
    } else if (dx > 0 && onSwipeRight) {
      onSwipeRight();
    }
  }, [threshold, maxDuration, onSwipeLeft, onSwipeRight]);

  const handleTouchCancel = useCallback(() => {
    touchStart.current = null;
    setState({ isSwiping: false, direction: null, progress: 0 });
  }, []);

  const bind = useCallback(
    () => ({
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    }),
    [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]
  );

  return { bind, ...state };
}