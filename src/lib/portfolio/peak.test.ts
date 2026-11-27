import { describe, expect, it } from 'vitest';
import { peakSincePurchase } from './peak';

const rows = [
  { trade_date: '2025-12-01', close: '900' },
  { trade_date: '2026-03-10', close: '500' },
  { trade_date: '2026-06-15', close: '800' },
  { trade_date: '2026-09-01', close: null },
  { trade_date: '2026-10-01', close: '600' },
];

describe('peakSincePurchase', () => {
  it('ignores closes before the purchase date', () => {
    const r = peakSincePurchase(rows, '2026-03-01', 400)!;
    expect(r.peak).toBe(800);
    expect(r.peakDate).toBe('2026-06-15');
    expect(r.belowPeakPct).toBeCloseTo(50);
  });
  it('counts the purchase day itself', () => expect(peakSincePurchase(rows, '2025-12-01', 450)!.peak).toBe(900));
  it('treats a price above every close as the peak', () => expect(peakSincePurchase(rows, '2026-03-01', 1000)).toMatchObject({ peak: 1000, belowPeakPct: 0 }));
  it('is null without a purchase date, prices or a live price', () => {
    expect(peakSincePurchase(rows, null, 400)).toBeNull();
    expect(peakSincePurchase(null, '2026-03-01', 400)).toBeNull();
    expect(peakSincePurchase(rows, '2026-03-01', null)).toBeNull();
  });
  it('is null when no close falls after the purchase date', () => expect(peakSincePurchase(rows, '2027-01-01', 400)).toBeNull());
});

import { peakLabel } from './peak';
describe('peakLabel', () => {
  const money = (v: number) => `₹${v}`;
  it('says how far below the peak', () => expect(peakLabel({ peak: 918, peakDate: 'x', belowPeakPct: 55.2 }, money)).toBe('Peak ₹918 · 55.2% below'));
  it('says at the peak', () => expect(peakLabel({ peak: 2517, peakDate: 'x', belowPeakPct: 0 }, money)).toBe('At its peak ₹2517'));
});
