import { describe, expect, it } from 'vitest';
import { buildCommodities, METAL_ETFS, type RawInputs, type RawQuote } from './rates';

const q = (price: number | null, over: Partial<RawQuote> = {}): RawQuote => ({ price, changePct: 0.5, week52High: null, week52Low: null, asOf: '2026-11-27T18:00:00.000Z', ...over });
const full: RawInputs = {
  futures: { gold: q(3672.7, { week52High: 5586.2, week52Low: 3425.2 }), silver: q(43.805), platinum: q(1312.4) },
  usdInr: q(92.98),
  etfs: { GOLDBEES: q(103.78, { week52High: 148.14, week52Low: 99.88 }) },
};

describe('buildCommodities', () => {
  it('prices all four metals and flags them as estimates', () => {
    const d = buildCommodities(full);
    expect(d.metals.map((m) => m.id)).toEqual(['gold-24k', 'gold-22k', 'silver-999', 'platinum-999']);
    expect(d.metals.every((m) => m.estimate && m.priceInr !== null)).toBe(true);
    expect(d.metals[0].unit).toBe('10 g');
    expect(d.metals[2].unit).toBe('1 kg');
  });
  it('22K is 916/999 of 24K', () => {
    const d = buildCommodities(full);
    expect(d.metals[1].priceInr! / d.metals[0].priceInr!).toBeCloseTo(916 / 999, 6);
  });
  it('converts the 52-week range at the same rate', () => {
    const g = buildCommodities(full).metals[0];
    expect(g.week52HighInr!).toBeGreaterThan(g.priceInr!);
    expect(g.week52LowInr!).toBeLessThan(g.priceInr!);
  });
  it('has the gold/silver ratio and a time', () => {
    const d = buildCommodities(full);
    expect(d.goldSilverRatio).toBeGreaterThan(50);
    expect(d.asOf).toBe('2026-11-27T18:00:00.000Z');
  });
  it('shows nothing, never a made-up price, when the rupee rate is missing', () => {
    const d = buildCommodities({ ...full, usdInr: null });
    expect(d.metals.every((m) => m.priceInr === null)).toBe(true);
    expect(d.goldSilverRatio).toBeNull();
  });
  it('lists every ETF, with nulls for ones without a quote', () => {
    const d = buildCommodities(full);
    expect(d.etfs).toHaveLength(METAL_ETFS.length);
    expect(d.etfs.find((e) => e.symbol === 'GOLDBEES')?.price).toBe(103.78);
    expect(d.etfs.find((e) => e.symbol === 'TATSILV')?.price).toBeNull();
  });
});
