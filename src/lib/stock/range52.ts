// 52-week range maths for the stock page hero. Pure.

import type { Bar } from '@/lib/chart/bars';

export interface Range52 {
  low: number;
  high: number;
}

export interface RangePosition {
  /** 0-100, clamped so a stale range can never push the marker off the bar. */
  pct: number;
  label: string;
}

/** About one trading year of daily bars. */
const YEAR_BARS = 252;
const NEAR_EDGE_PCT = 10;

const num = (s: string | null): number | null => {
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** The live quote's range when it is sane, otherwise the high/low of the last year of bars. */
export function resolveRange52(quote: { low: string | null; high: string | null }, bars: readonly Bar[]): Range52 | null {
  const low = num(quote.low);
  const high = num(quote.high);
  if (low !== null && high !== null && high > low) return { low, high };

  const recent = bars.slice(-YEAR_BARS).filter((b) => Number.isFinite(b.high) && Number.isFinite(b.low));
  if (recent.length === 0) return null;
  return {
    low: Math.min(...recent.map((b) => b.low)),
    high: Math.max(...recent.map((b) => b.high)),
  };
}

export function rangePosition(price: number | null, range: Range52 | null): RangePosition | null {
  if (price === null || range === null || !Number.isFinite(price) || range.high <= range.low) return null;
  const raw = ((price - range.low) / (range.high - range.low)) * 100;
  const pct = Math.round(Math.min(100, Math.max(0, raw)));
  let label: string;
  if (pct >= 100 - NEAR_EDGE_PCT) label = 'Near its 52-week high';
  else if (pct <= NEAR_EDGE_PCT) label = 'Near its 52-week low';
  else label = `Mid-range (${pct}% of the way up)`;
  return { pct, label };
}
