import { describe, expect, it } from 'vitest';
import type { PricePointOut } from '@/lib/dashboard/fundamentalsApi';
import { rangeStartTime, toBars } from './bars';

const row = (d: string, o: number | null, h = 12, l = 9, c = 11, v: number | null = 1000): PricePointOut => ({
  trade_date: d,
  open: o === null ? null : String(o),
  high: String(h),
  low: String(l),
  close: String(c),
  volume: v,
  source_tier: 't',
});

describe('toBars', () => {
  it('returns chronological bars from the API newest-first rows', () => {
    const bars = toBars([row('2026-01-03', 10), row('2026-01-02', 10)]);
    expect(bars.map((b) => b.time)).toEqual(['2026-01-02', '2026-01-03']);
  });
  it('drops rows missing OHLC and de-duplicates dates', () => {
    const bars = toBars([row('2026-01-03', 10), row('2026-01-03', 10), row('2026-01-02', null)]);
    expect(bars).toHaveLength(1);
  });
  it('treats missing volume as 0', () => {
    expect(toBars([row('2026-01-02', 10, 12, 9, 11, null)])[0].volume).toBe(0);
  });
});

describe('rangeStartTime', () => {
  const last = '2026-11-06';
  it('maps range keys to a start date relative to the last bar', () => {
    expect(rangeStartTime('1M', last)).toBe('2026-10-06');
    expect(rangeStartTime('3M', last)).toBe('2026-08-06');
    expect(rangeStartTime('6M', last)).toBe('2026-05-06');
    expect(rangeStartTime('YTD', last)).toBe('2026-01-01');
    expect(rangeStartTime('1Y', last)).toBe('2025-11-06');
  });
  it('returns null for ranges that show everything', () => {
    expect(rangeStartTime('5Y', last)).toBeNull();
    expect(rangeStartTime('ALL', last)).toBeNull();
  });
});
