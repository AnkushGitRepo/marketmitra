import { describe, expect, it } from 'vitest';
import { LTCG_EXEMPTION, addMonths, financialYear, harvestCandidates, lotTax, parseDate, summarise, taxOn, type Lot } from './india';

const d = (s: string) => parseDate(s) as Date;
const lot = (over: Partial<Lot> = {}): Lot => ({ holdingId: 'h', symbol: 'AAA', quantity: 10, avgPrice: 100, ltp: 150, purchaseDate: '2025-01-15', ...over });

describe('parseDate / addMonths', () => {
  it('accepts only real calendar dates', () => {
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('26-01-01')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate('2026-02-28')).not.toBeNull();
  });
  it('clamps to the end of a shorter month', () => {
    expect(addMonths(d('2024-02-29'), 12).toISOString().slice(0, 10)).toBe('2025-02-28');
    expect(addMonths(d('2025-01-31'), 1).toISOString().slice(0, 10)).toBe('2025-02-28');
  });
});

describe('lotTax: the 12-month rule', () => {
  it('is short term up to and including the one-year anniversary', () => {
    expect(lotTax(lot({ purchaseDate: '2025-01-15' }), d('2026-01-15')).term).toBe('short');
    expect(lotTax(lot({ purchaseDate: '2025-01-15' }), d('2026-01-15')).daysToLongTerm).toBe(1);
  });
  it('is long term the day after', () => {
    const r = lotTax(lot({ purchaseDate: '2025-01-15' }), d('2026-01-16'));
    expect(r.term).toBe('long');
    expect(r.daysToLongTerm).toBe(0);
  });
  it('counts the days left for a recent buy', () => {
    const r = lotTax(lot({ purchaseDate: '2026-01-01' }), d('2026-06-01'));
    expect(r.term).toBe('short');
    expect(r.daysToLongTerm).toBe(215);
    expect(r.heldDays).toBe(151);
  });
  it('handles a leap-day purchase', () => expect(lotTax(lot({ purchaseDate: '2024-02-29' }), d('2025-03-01')).term).toBe('long'));
  it('says unknown, never guesses, without a date, with a future date, or without a price', () => {
    expect(lotTax(lot({ purchaseDate: null }), d('2026-01-01')).term).toBeNull();
    expect(lotTax(lot({ purchaseDate: '2030-01-01' }), d('2026-01-01')).term).toBeNull();
    expect(lotTax(lot({ ltp: null }), d('2026-06-01')).gain).toBeNull();
  });
  it('computes the unrealised gain', () => expect(lotTax(lot(), d('2026-06-01')).gain).toBe(500));
});

describe('taxOn', () => {
  it('taxes short-term gains at 20%', () => expect(taxOn(10_000, 0)).toBe(2_000));
  it('exempts the first 1.25 lakh of long-term gains, then 12.5%', () => {
    expect(taxOn(0, LTCG_EXEMPTION)).toBe(0);
    expect(taxOn(0, LTCG_EXEMPTION + 80_000)).toBe(10_000);
  });
  it('lets a short-term loss offset long-term gains before the exemption', () => {
    expect(taxOn(-50_000, 175_000)).toBe(0);
    expect(taxOn(-50_000, 225_000)).toBeCloseTo(0.125 * (175_000 - LTCG_EXEMPTION));
  });
  it('does not let a long-term loss offset short-term gains', () => expect(taxOn(10_000, -5_000)).toBe(2_000));
  it('is zero on a net loss', () => expect(taxOn(-1, -1)).toBe(0));
});

describe('summarise', () => {
  const lots = [
    lotTax(lot({ symbol: 'A', purchaseDate: '2026-03-01', ltp: 200 }), d('2026-06-01')), // short, +1000
    lotTax(lot({ symbol: 'B', purchaseDate: '2024-01-01', ltp: 300 }), d('2026-06-01')), // long, +2000
    lotTax(lot({ symbol: 'C', purchaseDate: null }), d('2026-06-01')), // unknown
  ];
  it('splits by term, counts what it cannot place and prices the extra tax', () => {
    const s = summarise(lots, 0, 0);
    expect(s).toMatchObject({ unrealisedShort: 1000, unrealisedLong: 2000, unknownLots: 1, taxOnBooked: 0 });
    expect(s.extraIfSoldToday).toBe(200);
  });
  it('adds to what is already booked', () => expect(summarise(lots, 10_000, 0).taxOnBooked).toBe(2_000));
});

describe('harvestCandidates', () => {
  const lots = [
    lotTax(lot({ symbol: 'LOSS_ST', purchaseDate: '2026-03-01', ltp: 50 }), d('2026-06-01')), // short, -500
    lotTax(lot({ symbol: 'LOSS_LT', purchaseDate: '2024-01-01', ltp: 40 }), d('2026-06-01')), // long, -600
    lotTax(lot({ symbol: 'WIN', ltp: 500 }), d('2026-06-01')),
  ];
  it('lists only loss lots, biggest saving first', () => {
    const out = harvestCandidates(lots, 5_000, 0);
    expect(out.map((c) => c.symbol)).toEqual(['LOSS_ST', 'LOSS_LT']);
    expect(out[0].taxSaved).toBe(100); // 500 x 20%
    expect(out[1].taxSaved).toBe(0); // a long-term loss cannot offset short-term gains
  });
  it('shows the loss even when no booked gain makes it save anything', () => {
    const out = harvestCandidates(lots, 0, 0);
    expect(out.every((c) => c.taxSaved === 0 && c.loss > 0)).toBe(true);
  });
});

describe('financialYear', () => {
  it('runs April to March', () => {
    expect(financialYear(d('2026-11-27')).label).toBe('FY 2026-27');
    expect(financialYear(d('2027-02-10')).label).toBe('FY 2026-27');
    expect(financialYear(d('2026-04-01')).label).toBe('FY 2026-27');
    expect(financialYear(d('2026-03-31')).label).toBe('FY 2025-26');
  });
  it('counts the days to 31 March', () => {
    expect(financialYear(d('2027-03-30')).daysLeft).toBe(1);
    expect(financialYear(d('2027-03-31')).daysLeft).toBe(0);
    expect(financialYear(d('2026-11-27')).daysLeft).toBe(124);
  });
});
