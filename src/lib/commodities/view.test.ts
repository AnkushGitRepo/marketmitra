import { describe, expect, it } from 'vitest';
import type { EtfRow } from './rates';
import { shownPrice, sortEtfs, valueOfWeight } from './view';

const etf = (symbol: string, price: number | null, changePct: number | null): EtfRow => ({ symbol, name: symbol, metal: 'gold', price, changePct, week52High: null, week52Low: null });

describe('shownPrice', () => {
  it('adds 3% GST when asked', () => expect(shownPrice(100000, true)).toBeCloseTo(103000));
  it('leaves the price alone otherwise', () => expect(shownPrice(100000, false)).toBe(100000));
  it('keeps a missing price missing', () => expect(shownPrice(null, true)).toBeNull());
});

describe('sortEtfs', () => {
  const rows = [etf('B', 20, -1), etf('A', null, null), etf('C', 10, 3)];
  it('sorts by price both ways with missing values last', () => {
    expect(sortEtfs(rows, 'price', 'asc').map((r) => r.symbol)).toEqual(['C', 'B', 'A']);
    expect(sortEtfs(rows, 'price', 'desc').map((r) => r.symbol)).toEqual(['B', 'C', 'A']);
  });
  it('sorts by day change', () => expect(sortEtfs(rows, 'change', 'desc').map((r) => r.symbol)).toEqual(['C', 'B', 'A']));
  it('sorts by symbol and does not mutate its input', () => {
    expect(sortEtfs(rows, 'symbol', 'asc').map((r) => r.symbol)).toEqual(['A', 'B', 'C']);
    expect(rows.map((r) => r.symbol)).toEqual(['B', 'A', 'C']);
  });
});

describe('valueOfWeight', () => {
  it('prices gold per gram from the per-10-g figure', () => expect(valueOfWeight({ id: 'gold-24k', priceInr: 126000 }, 50)).toBeCloseTo(630000));
  it('prices silver from the per-kg figure', () => expect(valueOfWeight({ id: 'silver-999', priceInr: 150000 }, 500)).toBeCloseTo(75000));
  it('prices platinum per gram', () => expect(valueOfWeight({ id: 'platinum-999', priceInr: 4500 }, 2)).toBeCloseTo(9000));
  it('is null without a price, a positive weight or a known metal', () => {
    expect(valueOfWeight({ id: 'gold-24k', priceInr: null }, 10)).toBeNull();
    expect(valueOfWeight({ id: 'gold-24k', priceInr: 1 }, 0)).toBeNull();
    expect(valueOfWeight({ id: 'copper', priceInr: 1 }, 5)).toBeNull();
  });
});
