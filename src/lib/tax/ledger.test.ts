import { describe, expect, it } from 'vitest';
import { LTCG_EXEMPTION, lotTax, parseDate, type Lot } from './india';
import { LONG_TERM_SOON_DAYS, allowanceCard, harvestPool, longTermSoon, lotTag, unrealisedSplit, yearProgressPct } from './ledger';

const TODAY = parseDate('2026-11-27') as Date;
const lot = (symbol: string, purchaseDate: string | null, gain: number | null, quantity = 10): Lot => ({
  holdingId: symbol, symbol, quantity, avgPrice: 100, ltp: gain === null ? null : 100 + gain / quantity, purchaseDate,
});
const lt = (symbol: string, gain: number) => lotTax(lot(symbol, '2024-01-10', gain), TODAY); // long term
const st = (symbol: string, gain: number, date = '2026-03-01') => lotTax(lot(symbol, date, gain), TODAY); // short term

describe('allowanceCard', () => {
  it('splits the allowance into booked, unrealised and what is left', () => {
    const a = allowanceCard([lt('A', 25_000)], 50_000);
    expect(a).toMatchObject({ allowance: LTCG_EXEMPTION, booked: 50_000, unrealised: 25_000, remaining: 50_000 });
    expect(a.bookedPct).toBeCloseTo(40);
    expect(a.unrealisedPct).toBeCloseTo(20);
  });
  it('never lets the bar pass 100% or the remainder go negative', () => {
    const a = allowanceCard([lt('A', 300_000)], 100_000);
    expect(a.bookedPct + a.unrealisedPct).toBeLessThanOrEqual(100);
    expect(a.remaining).toBe(0);
  });
  it('ignores losses, short-term and undated lots, and a negative booked figure', () => {
    const a = allowanceCard([lt('A', -5_000), st('B', 9_000), lotTax(lot('C', null, 9_000), TODAY)], -10);
    expect(a).toMatchObject({ booked: 0, unrealised: 0, remaining: LTCG_EXEMPTION });
  });
});

describe('unrealisedSplit', () => {
  it('adds gains and losses by term', () => {
    expect(unrealisedSplit([lt('A', 1_000), lt('B', -200), st('C', 500), st('D', -100), lotTax(lot('E', null, 99), TODAY)])).toEqual({ short: 400, long: 800, total: 1200 });
  });
});

describe('harvestPool', () => {
  it('sums the losses and prices the shield against booked gains', () => {
    const p = harvestPool([st('A', -500), st('B', -300), lt('C', -1_000), st('D', 900)], 10_000, 0);
    expect(p).toMatchObject({ lots: 3, loss: 1_800 });
    expect(p.taxShield).toBeCloseTo(0.2 * 800); // only the short-term losses offset short-term gains
  });
  it('is zero shield when nothing is booked, but still reports the pool', () => {
    expect(harvestPool([st('A', -500)], 0, 0)).toEqual({ lots: 1, loss: 500, taxShield: 0 });
  });
  it('is empty without losing lots', () => expect(harvestPool([st('A', 500)], 1_000, 0)).toEqual({ lots: 0, loss: 0, taxShield: 0 }));
});

describe('longTermSoon', () => {
  it('counts short-term lots within the window and prices the rate gap on gains only', () => {
    // bought 2025-12-20: long term from 2026-12-21, 24 days from 2026-11-27
    const near = st('N', 4_000, '2025-12-20');
    const far = st('F', 4_000, '2026-06-01');
    const loss = st('L', -2_000, '2025-12-20');
    const r = longTermSoon([near, far, loss, lt('X', 100)]);
    expect(near.daysToLongTerm).toBeLessThanOrEqual(LONG_TERM_SOON_DAYS);
    expect(r.lots).toBe(2);
    expect(r.rateGap).toBeCloseTo(4_000 * 0.075);
  });
});

describe('yearProgressPct', () => {
  it('is 100 once long term, a share before, and null without a date', () => {
    expect(yearProgressPct(lt('A', 1))).toBe(100);
    const half = lotTax(lot('H', '2026-05-29', 1), TODAY);
    expect(yearProgressPct(half)).toBeGreaterThan(40);
    expect(yearProgressPct(half)).toBeLessThan(60);
    expect(yearProgressPct(lotTax(lot('M', null, 1), TODAY))).toBeNull();
  });
});

describe('lotTag', () => {
  const card = allowanceCard([], 0);
  it('prefers a loss, then turning long term soon, then the allowance', () => {
    expect(lotTag(st('A', -10), card)).toEqual({ kind: 'loss', term: 'short' });
    expect(lotTag(lt('B', -10), card)).toEqual({ kind: 'loss', term: 'long' });
    expect(lotTag(st('C', 100, '2025-12-20'), card)).toMatchObject({ kind: 'long_term_soon' });
    expect(lotTag(lt('D', 100), card)).toEqual({ kind: 'within_allowance' });
    expect(lotTag(st('E', 100), card)).toEqual({ kind: 'none' });
  });
  it('drops the allowance note once long-term gains pass it', () => {
    const over = allowanceCard([lt('A', 200_000)], 0);
    expect(lotTag(lt('A', 200_000), over)).toEqual({ kind: 'none' });
  });
  it('says the date is missing instead of guessing', () => expect(lotTag(lotTax(lot('M', null, 5), TODAY), card)).toEqual({ kind: 'date_missing' }));
});
