import { describe, expect, it } from 'vitest';
import { buildCommodities, type RawInputs, type RawQuote } from '@/lib/commodities/rates';
import type { BullionEntry } from './schema';
import { valueBullion } from './value';

const q = (price: number): RawQuote => ({ price, changePct: 0, week52High: null, week52Low: null, asOf: null });
const data = buildCommodities({ futures: { gold: q(3672.7), silver: q(43.8), platinum: q(1312.4) }, usdInr: q(92.98), etfs: {} } as RawInputs);
const entry = (over: Partial<BullionEntry>): BullionEntry => ({ id: 'x', metal: 'gold', purity: '24k', grams: 10, buyPricePerGram: null, note: null, ...over });

describe('valueBullion', () => {
  it('values grams at the estimated price per gram', () => {
    const goldPer10g = data.metals[0].priceInr!;
    const r = valueBullion([entry({ grams: 50 })], data);
    expect(r.rows[0].value).toBeCloseTo((goldPer10g / 10) * 50, 2);
    expect(r.totalValue).toBeCloseTo((goldPer10g / 10) * 50, 2);
  });
  it('22K is worth 916/999 of 24K', () => {
    const a = valueBullion([entry({ purity: '24k' })], data).rows[0].value!;
    const b = valueBullion([entry({ purity: '22k' })], data).rows[0].value!;
    expect(b / a).toBeCloseTo(916 / 999, 6);
  });
  it('gain needs a buy price, and is value minus cost', () => {
    const [none, some] = valueBullion([entry({}), entry({ buyPricePerGram: 10000 })], data).rows;
    expect(none.gain).toBeNull();
    expect(some.cost).toBe(100000);
    expect(some.gain).toBeCloseTo(some.value! - 100000, 2);
    expect(some.gainPct).toBeCloseTo(((some.value! - 100000) / 100000) * 100, 6);
  });
  it('only counts tracked cost and gain for entries that have both', () => {
    const r = valueBullion([entry({}), entry({ buyPricePerGram: 10000 })], data);
    expect(r.trackedCost).toBe(100000);
  });
  it('shows unpriced entries as null and counts them, never as zero value', () => {
    const r = valueBullion([entry({})], null);
    expect(r.rows[0].value).toBeNull();
    expect(r.unpriced).toBe(1);
    expect(r.totalValue).toBe(0);
  });
  it('is empty for no entries', () => expect(valueBullion([], data)).toMatchObject({ rows: [], totalValue: 0, unpriced: 0 }));
});
