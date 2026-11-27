import { describe, expect, it } from 'vitest';
import type { EtfRow } from './rates';
import { shownPrice, sortEtfs } from './view';

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
