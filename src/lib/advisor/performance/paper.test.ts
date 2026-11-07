import { describe, expect, it } from 'vitest';
import { buildPaperReport, closeOnOrBefore, xirr, type PaperEntry, type PricePoint } from './paper';

const px = (pairs: Array<[string, number]>): PricePoint[] => pairs.map(([date, close]) => ({ date, close }));
const entry = (id: string, symbol: string, createdAt: string, amountINR = 10000): PaperEntry => ({
  id, symbol, name: symbol, createdAt, amountINR, priceAtTime: null,
});

describe('closeOnOrBefore', () => {
  const s = px([['2026-01-01', 10], ['2026-01-05', 12], ['2026-01-09', 9]]);
  it('picks the latest price on or before the date', () => {
    expect(closeOnOrBefore(s, '2026-01-05')).toBe(12);
    expect(closeOnOrBefore(s, '2026-01-07')).toBe(12);
    expect(closeOnOrBefore(s, '2026-02-01')).toBe(9);
  });
  it('is null before the first price', () => {
    expect(closeOnOrBefore(s, '2025-12-31')).toBeNull();
  });
});

describe('xirr', () => {
  it('matches a simple one-year doubling', () => {
    const r = xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 2000 }]);
    expect(r).toBeCloseTo(100, 0);
  });
  it('is null when no root exists', () => {
    expect(xirr([{ date: '2025-01-01', amount: 1000 }, { date: '2026-01-01', amount: 2000 }])).toBeNull();
  });
});

describe('buildPaperReport', () => {
  const bench = px([['2026-01-01', 100], ['2026-04-01', 110], ['2026-07-01', 105], ['2026-11-01', 120]]);

  it('compares each pick with the same rupees in the benchmark', () => {
    const prices = { AAA: px([['2026-01-01', 50], ['2026-11-01', 100]]) };
    const r = buildPaperReport({ entries: [entry('1', 'AAA', '2026-01-01T09:00:00Z')], prices, benchmark: bench, asOf: '2026-11-01' });
    expect(r.entries[0].returnPct).toBeCloseTo(100);
    expect(r.entries[0].benchmarkReturnPct).toBeCloseTo(20);
    expect(r.entries[0].excessPts).toBeCloseTo(80);
    expect(r.totals.sleeveValueINR).toBeCloseTo(20000);
    expect(r.totals.benchmarkValueINR).toBeCloseTo(12000);
  });

  it('reports a losing pick honestly, including in the month-end history', () => {
    const prices = { BBB: px([['2026-01-01', 100], ['2026-04-01', 80], ['2026-07-01', 60], ['2026-11-01', 70]]) };
    const r = buildPaperReport({ entries: [entry('1', 'BBB', '2026-01-01T09:00:00Z')], prices, benchmark: bench, asOf: '2026-11-01' });
    expect(r.entries[0].returnPct).toBeCloseTo(-30);
    expect(r.series.some((row) => row.sleeveReturnPct < 0 && row.excessPts < 0)).toBe(true);
    expect(r.series[r.series.length - 1].date).toBe('2026-11-01');
  });

  it('excludes entries it cannot price and says how many', () => {
    const r = buildPaperReport({ entries: [entry('1', 'ZZZ', '2026-01-01T09:00:00Z')], prices: {}, benchmark: bench, asOf: '2026-11-01' });
    expect(r.totals.unpriced).toBe(1);
    expect(r.totals.investedINR).toBe(0);
    expect(r.totals.sleeveReturnPct).toBeNull();
  });

  it('gives no verdict on a short record', () => {
    const prices = { AAA: px([['2026-01-01', 50], ['2026-11-01', 40]]) };
    const r = buildPaperReport({ entries: [entry('1', 'AAA', '2026-01-01T09:00:00Z')], prices, benchmark: bench, asOf: '2026-11-01' });
    expect(r.warning.status).toBe('insufficient');
  });

  it('warns when the old cohort trails the index', () => {
    const prices = {
      AAA: px([['2026-01-01', 100], ['2026-11-01', 90]]),
      BBB: px([['2026-01-01', 100], ['2026-11-01', 105]]),
      CCC: px([['2026-01-01', 100], ['2026-11-01', 100]]),
    };
    const entries = ['AAA', 'BBB', 'CCC'].map((s, i) => entry(String(i), s, '2026-01-01T09:00:00Z'));
    const r = buildPaperReport({ entries, prices, benchmark: bench, asOf: '2026-11-01' });
    expect(r.warning.status).toBe('trailing');
    expect(r.warning.message).toMatch(/index core/);
  });

  it('says ahead — with a caution — when the cohort beats the index', () => {
    const prices = {
      AAA: px([['2026-01-01', 100], ['2026-11-01', 150]]),
      BBB: px([['2026-01-01', 100], ['2026-11-01', 140]]),
      CCC: px([['2026-01-01', 100], ['2026-11-01', 130]]),
    };
    const entries = ['AAA', 'BBB', 'CCC'].map((s, i) => entry(String(i), s, '2026-01-01T09:00:00Z'));
    const r = buildPaperReport({ entries, prices, benchmark: bench, asOf: '2026-11-01' });
    expect(r.warning.status).toBe('ahead');
    expect(r.warning.message).toMatch(/not proof/);
  });

  it('shows annualised figures only after a year', () => {
    const prices = { AAA: px([['2025-01-01', 100], ['2026-11-01', 150]]) };
    const long = px([['2025-01-01', 100], ['2026-11-01', 120]]);
    const a = buildPaperReport({ entries: [entry('1', 'AAA', '2025-01-01T09:00:00Z')], prices, benchmark: long, asOf: '2026-11-01' });
    expect(a.totals.sleeveXirrPct).not.toBeNull();
    const b = buildPaperReport({ entries: [entry('1', 'AAA', '2026-01-01T09:00:00Z')], prices, benchmark: long, asOf: '2026-11-01' });
    expect(b.totals.sleeveXirrPct).toBeNull();
  });
});
