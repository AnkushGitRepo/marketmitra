import { describe, expect, it } from 'vitest';
import type { PricePointOut } from './fundamentalsApi';
import { PERIOD_LOOKBACK_DAYS, slicePricesByPeriod } from './pricePeriods';

const row = (trade_date: string): PricePointOut => ({
  trade_date,
  open: '1',
  high: '1',
  low: '1',
  close: '1',
  volume: 1,
  source_tier: 't',
});

const TODAY = new Date('2026-11-06T00:00:00Z');

describe('slicePricesByPeriod', () => {
  // Newest-first, like the API.
  const rows = ['2026-11-06', '2026-10-20', '2026-10-07', '2026-06-01', '2026-01-01', '2025-11-06', '2024-01-01'].map(row);

  it('mirrors the API lookback windows', () => {
    expect(PERIOD_LOOKBACK_DAYS).toEqual({ '1mo': 30, '6mo': 182, '1y': 365, '5y': 1825 });
  });

  it('keeps only rows on or after today minus the window, preserving order', () => {
    expect(slicePricesByPeriod(rows, '1mo', TODAY).map((r) => r.trade_date)).toEqual([
      '2026-11-06',
      '2026-10-20',
      '2026-10-07',
    ]);
    expect(slicePricesByPeriod(rows, '6mo', TODAY).map((r) => r.trade_date)).toEqual([
      '2026-11-06',
      '2026-10-20',
      '2026-10-07',
      '2026-06-01',
    ]);
  });

  it('includes the boundary day', () => {
    // 2026-11-06 minus 365 days = 2025-11-06
    expect(slicePricesByPeriod(rows, '1y', TODAY).map((r) => r.trade_date)).toContain('2025-11-06');
  });

  it('5y keeps everything inside five years and drops older rows', () => {
    expect(slicePricesByPeriod(rows, '5y', TODAY)).toHaveLength(7);
    expect(slicePricesByPeriod([row('2020-01-01')], '5y', TODAY)).toEqual([]);
  });

  it('returns an empty list for null input', () => {
    expect(slicePricesByPeriod(null, '1y', TODAY)).toEqual([]);
  });
});
