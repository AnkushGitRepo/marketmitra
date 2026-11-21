import { describe, expect, it } from 'vitest';
import { allotmentOdds, applicationSizes } from './ipoAllotmentOdds';

// ₹100 a share, 150 shares a lot: a lot is ₹15,000.
const ipo = { price: 100, lotSize: 150 };

describe('applicationSizes', () => {
  it('sizes each category from the lot value (retail up to ₹2L, sNII above ₹2L to ₹10L, bNII above ₹10L)', () => {
    expect(applicationSizes(ipo)).toEqual({
      retail: { minLots: 1, maxLots: 13, minInvestment: 15_000 },
      snii: { minLots: 14, maxLots: 66, minInvestment: 210_000 },
      bnii: { minLots: 67, maxLots: null, minInvestment: 1_005_000 },
    });
  });
  it('is null without a price or a lot size', () => {
    expect(applicationSizes({ price: null, lotSize: 150 })).toBeNull();
    expect(applicationSizes({ price: 100, lotSize: null })).toBeNull();
    expect(applicationSizes({ price: 0, lotSize: 150 })).toBeNull();
  });
  it('lets retail apply for one lot even when a lot costs more than ₹2L', () => {
    expect(applicationSizes({ price: 5_000, lotSize: 50 })?.retail).toEqual({ minLots: 1, maxLots: 1, minInvestment: 250_000 });
  });
});

describe('allotmentOdds', () => {
  const sizes = applicationSizes(ipo)!;
  const odds = (subs: Parameters<typeof allotmentOdds>[0]) => allotmentOdds(subs, sizes);

  it('is a draw for retail and sNII: the chance of one allotment is one over the subscription', () => {
    const r = odds({ retail: 4, snii: 10, bnii: 20, qib: 30 });
    expect(r.retail).toMatchObject({ kind: 'chance', value: 0.25, minLots: 1 });
    expect(r.snii).toMatchObject({ kind: 'chance', value: 0.1, minLots: 14 });
  });
  it('is proportional for bNII: the share of the bid that is allotted', () => {
    expect(odds({ retail: 4, snii: 10, bnii: 20, qib: 30 }).bnii).toMatchObject({ kind: 'share', value: 0.05, minLots: 67 });
  });
  it('is certain (1) when a category is not oversubscribed', () => {
    const r = odds({ retail: 0.6, snii: 1, bnii: 0.2, qib: 3 });
    expect(r.retail?.value).toBe(1);
    expect(r.snii?.value).toBe(1);
    expect(r.bnii?.value).toBe(1);
  });
  it('leaves a category out when its subscription is unknown, instead of guessing', () => {
    const r = odds({ retail: 3.08, snii: null, bnii: null, qib: null });
    expect(r.retail?.value).toBeCloseTo(0.3247, 4);
    expect(r.snii).toBeNull();
    expect(r.bnii).toBeNull();
  });
  it('rejects zero, negative and non-finite subscriptions as unknown', () => {
    const r = odds({ retail: 0, snii: -2, bnii: Number.NaN, qib: Infinity });
    expect(r).toMatchObject({ retail: null, snii: null, bnii: null });
  });
  it('names the best chance among the draw categories only, never the proportional one', () => {
    expect(odds({ retail: 4, snii: 10, bnii: 1.2, qib: 5 }).bestChance).toBe('retail');
    expect(odds({ retail: 9, snii: 3, bnii: 1.2, qib: 5 }).bestChance).toBe('snii');
    expect(odds({ retail: null, snii: null, bnii: 2, qib: null }).bestChance).toBeNull();
  });
  it('breaks a tie towards the smaller application (retail)', () => {
    expect(odds({ retail: 5, snii: 5, bnii: null, qib: null }).bestChance).toBe('retail');
  });
  it('still gives the odds when the application sizes are unknown, with the sizes left null', () => {
    const r = allotmentOdds({ retail: 4, snii: null, bnii: null, qib: null }, null);
    expect(r.retail).toEqual({ kind: 'chance', value: 0.25, minLots: null, minInvestment: null });
  });
});
