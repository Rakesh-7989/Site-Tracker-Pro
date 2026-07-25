import { useEffect, useRef, type RefObject } from "react";

interface SwipeConfig {
  threshold?: number;
  edgeSize?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function useSwipe(ref: RefObject<HTMLElement | null>, config: SwipeConfig): void {
  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      const threshold = config.threshold ?? 60;
      const edgeSize = config.edgeSize ?? 0;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        if (dx > 0) {
          if (edgeSize === 0 || startX.current <= edgeSize) config.onSwipeRight?.();
        } else {
          config.onSwipeLeft?.();
        }
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, config.onSwipeLeft, config.onSwipeRight, config.threshold, config.edgeSize]);
}
