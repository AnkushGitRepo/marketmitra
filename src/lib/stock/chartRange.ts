// Range windows for the phone chart. Bars are daily, so 1D / 1W would need intraday data we do not have.

import type { Bar } from '@/lib/chart/bars';

export type MobileRange = '1M' | '3M' | '6M' | '1Y' | '5Y';
export const MOBILE_RANGES: readonly MobileRange[] = ['1M', '3M', '6M', '1Y', '5Y'];

/** Trading days per window (about 21 per month). */
const WINDOW_BARS: Record<MobileRange, number> = { '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '5Y': Number.POSITIVE_INFINITY };

export function windowBars(bars: readonly Bar[], range: MobileRange): Bar[] {
  const n = WINDOW_BARS[range];
  return Number.isFinite(n) ? bars.slice(-n) : [...bars];
}

export function rangeChangePct(bars: readonly Bar[]): number | null {
  if (bars.length < 2) return null;
  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return ((last - first) / first) * 100;
}
