import { describe, expect, it } from 'vitest';
import { stripCitationMarkers, toCandleSeries } from './transforms';
import type { PricePointOut } from './fundamentalsApi';

describe('stripCitationMarkers', () => {
  it('strips a single trailing citation marker', () => {
    expect(stripCitationMarkers('Founded in 1994.[1]')).toBe('Founded in 1994.');
  });

  it('strips multiple consecutive trailing markers', () => {
    expect(stripCitationMarkers('Founded in 1994.[1][2]')).toBe('Founded in 1994.');
  });

  it('strips a marker separated from the text by whitespace', () => {
    expect(stripCitationMarkers('Founded in 1994. [12]')).toBe('Founded in 1994.');
  });

  it('leaves text with no trailing marker unchanged', () => {
    expect(stripCitationMarkers('Founded in 1994.')).toBe('Founded in 1994.');
  });

  it('strips a bracketed number in the middle of the text too, collapsing the gap', () => {
    expect(stripCitationMarkers('It operates [1] branch nationwide.')).toBe(
      'It operates branch nationwide.'
    );
  });

  it('handles a real stranded mid-sentence marker (Federal Bank About text)', () => {
    expect(
      stripCitationMarkers('...foreign exchange business. [1] .It is the second-largest bank...')
    ).toBe('...foreign exchange business. .It is the second-largest bank...');
  });
});

function point(date: string, o: number | null, h: number | null, l: number | null, c: number | null): PricePointOut {
  return {
    trade_date: date,
    open: o === null ? null : String(o),
    high: h === null ? null : String(h),
    low: l === null ? null : String(l),
    close: c === null ? null : String(c),
    volume: null,
    source_tier: 'test',
  };
}

describe('toCandleSeries', () => {
  it('returns an empty series when there are no usable points', () => {
    expect(toCandleSeries([], '1y')).toEqual([]);
    expect(toCandleSeries([point('2026-01-01', null, null, null, null)], '1y')).toEqual([]);
  });

  it('reverses the newest-first API order into chronological candles', () => {
    const out = toCandleSeries(
      [point('2026-01-02', 11, 13, 10, 12), point('2026-01-01', 10, 12, 9, 11)],
      '1mo'
    );
    expect(out.map((c) => c.close)).toEqual([11, 12]);
    expect(out[0]).toMatchObject({ open: 10, high: 12, low: 9, close: 11 });
  });

  it('skips rows missing any OHLC field', () => {
    const out = toCandleSeries(
      [point('2026-01-02', 11, 13, 10, 12), point('2026-01-01', null, 12, 9, 11)],
      '1mo'
    );
    expect(out).toHaveLength(1);
  });

  it('aggregates dense series into at most maxCandles OHLC buckets', () => {
    const newestFirst = Array.from({ length: 100 }, (_, i) => {
      const day = 100 - i; // chronological day number, 1..100
      return point(`2026-01-${String((day % 28) + 1).padStart(2, '0')}`, day, day + 5, day - 5, day + 1);
    });
    const out = toCandleSeries(newestFirst, '1y', 10);
    expect(out).toHaveLength(10);
    // First bucket = chronological days 1..10: open of day 1, close of day 10,
    // extreme high/low across the bucket.
    expect(out[0]).toMatchObject({ open: 1, close: 11, high: 15, low: -4 });
    // Last bucket ends on the most recent close.
    expect(out[9].close).toBe(101);
  });
});
