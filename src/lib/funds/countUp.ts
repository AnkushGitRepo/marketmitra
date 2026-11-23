// Count-up for the SIP summary figures (#304): the maths only, so it tests without a browser. The hook that drives it is
// `src/components/funds/useCountUp.ts`.

/** About 300 ms: quick enough to read as a nudge, not a wait. */
export const COUNT_UP_MS = 300;

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** Fast at the start, gentle at the end. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - clamp01(t)) ** 3;
}

/** The figure to show at `progress` (0 to 1) of a move from `from` to `to`; exactly `to` once finished. */
export function countUpValue(from: number, to: number, progress: number): number {
  return progress >= 1 ? to : from + (to - from) * easeOutCubic(progress);
}
