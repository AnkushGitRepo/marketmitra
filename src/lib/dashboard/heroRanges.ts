import type { RangeSeries } from './chartMath';
import type { PricePeriod } from './fundamentalsApi';

// Timeframes offered on the hero chart. There is no intraday price data, so there is deliberately no 1D tab:
// "Today's P&L" is the one-day view. 1W is derived from the daily series; the rest map to the existing periods.

export type HeroRange = '1w' | '1mo' | '1y' | '5y';

export const HERO_RANGES: readonly HeroRange[] = ['1w', '1mo', '1y', '5y'];

export const HERO_RANGE_LABELS: Record<HeroRange, string> = { '1w': '1W', '1mo': '1M', '1y': '1Y', '5y': '5Y' };

/** A week is ~5 trading days; one extra point gives the first day a starting value to compare against. */
export const WEEK_POINTS = 6;

export function lastPoints(series: RangeSeries, count: number): RangeSeries {
  if (count <= 0) return { v: [], l: [] };
  return { v: series.v.slice(-count), l: series.l.slice(-count) };
}

export function seriesForRange(history: Record<PricePeriod, RangeSeries>, range: HeroRange): RangeSeries {
  if (range === '1w') return lastPoints(history['1mo'], WEEK_POINTS);
  return history[range];
}
