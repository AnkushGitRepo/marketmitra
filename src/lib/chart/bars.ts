import type { PricePointOut } from '@/lib/dashboard/fundamentalsApi';

export interface Bar {
  /** ISO date (YYYY-MM-DD) — the daily-bar time format lightweight-charts expects. */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Range tabs the chart offers. 1D/5D from the reference design need intraday
 * data, which the price API doesn't have — everything here is daily bars. */
export type RangeKey = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'ALL';
export const RANGE_KEYS: RangeKey[] = ['1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];

/** API rows are newest-first; charts want oldest → newest, one bar per date,
 * and only complete OHLC rows. */
export function toBars(points: PricePointOut[]): Bar[] {
  const byDate = new Map<string, Bar>();
  for (const p of points) {
    if (p.open === null || p.high === null || p.low === null || p.close === null) continue;
    byDate.set(p.trade_date, {
      time: p.trade_date,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: p.volume ?? 0,
    });
  }
  return [...byDate.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First date to show for a range, counted back from the last bar; null = show all data. */
export function rangeStartTime(range: RangeKey, lastTime: string): string | null {
  const last = new Date(`${lastTime}T00:00:00Z`);
  const back = (months: number) => {
    const d = new Date(last);
    d.setUTCMonth(d.getUTCMonth() - months);
    return isoDate(d);
  };
  switch (range) {
    case '1M':
      return back(1);
    case '3M':
      return back(3);
    case '6M':
      return back(6);
    case '1Y':
      return back(12);
    case 'YTD':
      return `${last.getUTCFullYear()}-01-01`;
    default:
      return null;
  }
}

const sameBar = (a: Bar, b: Bar) =>
  a.open === b.open &&
  a.high === b.high &&
  a.low === b.low &&
  a.close === b.close &&
  a.volume === b.volume;

/**
 * Folds freshly polled bars into the ones already held: a bar with a known time replaces it, newer ones are appended.
 * Bars older than the first held bar are ignored. Returns the very same array when nothing changed, so callers can skip a redraw.
 * Times are compared as text for equality and ordered by their numeric value (intraday) or text (daily dates).
 */
export function mergeBars(existing: Bar[], incoming: Bar[]): Bar[] {
  if (existing.length === 0) return incoming;
  const first = existing[0].time;
  const order = (a: string, b: string) =>
    /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0;
  const byTime = new Map(existing.map((b) => [b.time, b]));
  let changed = false;
  for (const bar of incoming) {
    if (order(bar.time, first) < 0) continue;
    const held = byTime.get(bar.time);
    if (held && sameBar(held, bar)) continue;
    byTime.set(bar.time, bar);
    changed = true;
  }
  return changed ? [...byTime.values()].sort((a, b) => order(a.time, b.time)) : existing;
}
