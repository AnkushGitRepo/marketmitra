'use client';

import { useEffect, useRef, useState } from 'react';
import { COUNT_UP_MS, countUpValue } from '@/lib/funds/countUp';

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The figure to show while it moves to `target` (#304): from what is on screen now to the new value over ~300 ms. With reduced motion
 * set, or no figure, the target is shown at once. State is only ever set from animation frames, never synchronously in the effect.
 */
export function useCountUp(target: number | null, durationMs: number = COUNT_UP_MS): number | null {
  const [value, setValue] = useState<number | null>(target);
  const shown = useRef<number | null>(target);

  useEffect(() => {
    const from = shown.current;
    const animate = target !== null && from !== null && from !== target && !prefersReducedMotion();
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const progress = animate ? Math.min(1, (now - start) / durationMs) : 1;
      const next = animate && from !== null && target !== null ? countUpValue(from, target, progress) : target;
      shown.current = next;
      setValue(next);
      if (animate && progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return target === null || prefersReducedMotion() ? target : value;
}
