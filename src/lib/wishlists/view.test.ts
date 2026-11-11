import { describe, expect, it } from 'vitest';
import type { Quote } from '@/lib/dashboard/quotes';
import {
  HOLDINGS_LIST_ID,
  HOLDINGS_LIST_NAME,
  isReservedName,
  sortSymbols,
  validateWatchlistName,
  withHoldingsList,
  type ViewList,
} from './view';

const q = (symbol: string, changePct: number): Quote => ({ symbol, name: symbol, sector: null, price: 100, change: changePct, changePct });
const quotes = { A: q('A', 1.5), B: q('B', -2.5), C: q('C', 0), D: q('D', 4) };

describe('sortSymbols', () => {
  const symbols = ['A', 'B', 'C', 'D', 'NOQUOTE'];
  it('keeps the stored order by default', () => {
    expect(sortSymbols(symbols, quotes, 'default')).toEqual(symbols);
  });
  it('puts the biggest gainers first and unknown quotes last', () => {
    expect(sortSymbols(symbols, quotes, 'gain')).toEqual(['D', 'A', 'C', 'B', 'NOQUOTE']);
  });
  it('puts the biggest losers first and unknown quotes last', () => {
    expect(sortSymbols(symbols, quotes, 'loss')).toEqual(['B', 'C', 'A', 'D', 'NOQUOTE']);
  });
  it('is stable for ties and does not mutate its input', () => {
    const tie = { A: q('A', 1), B: q('B', 1) };
    expect(sortSymbols(['B', 'A'], tie, 'gain')).toEqual(['B', 'A']);
    const copy = [...symbols];
    sortSymbols(symbols, quotes, 'gain');
    expect(symbols).toEqual(copy);
  });
});

describe('withHoldingsList', () => {
  const lists: ViewList[] = [{ id: 'a', name: 'IT', symbols: ['TCS'], managed: false }];
  it('puts a managed Holdings list first, deduped, upper-cased, in holding order', () => {
    const out = withHoldingsList(lists, [{ symbol: 'sbin' }, { symbol: 'TCS' }, { symbol: 'SBIN' }]);
    expect(out[0]).toEqual({ id: HOLDINGS_LIST_ID, name: HOLDINGS_LIST_NAME, symbols: ['SBIN', 'TCS'], managed: true });
    expect(out.slice(1)).toEqual(lists);
  });
  it('is omitted when there are no holdings', () => {
    expect(withHoldingsList(lists, [])).toEqual(lists);
  });
  it('does not mutate its input', () => {
    withHoldingsList(lists, [{ symbol: 'X' }]);
    expect(lists).toHaveLength(1);
  });
});

describe('validateWatchlistName', () => {
  const existing = [{ id: 'a', name: 'IT majors' }, { id: 'b', name: 'Banks' }];
  it('accepts a good name', () => expect(validateWatchlistName('Pharma', existing)).toBeNull());
  it('rejects empty and over-long names', () => {
    expect(validateWatchlistName('   ', existing)).toMatch(/enter a name/i);
    expect(validateWatchlistName('x'.repeat(61), existing)).toMatch(/60/);
  });
  it('rejects a duplicate (case-insensitive) unless it is the list being renamed', () => {
    expect(validateWatchlistName('banks', existing)).toMatch(/already/i);
    expect(validateWatchlistName('banks', existing, 'b')).toBeNull();
  });
  it('rejects the reserved Holdings name in any casing', () => {
    expect(validateWatchlistName('Holdings', existing)).toMatch(/reserved/i);
    expect(validateWatchlistName('  HOLDINGS ', existing)).toMatch(/reserved/i);
    expect(isReservedName('holdings')).toBe(true);
    expect(isReservedName('My holdings')).toBe(false);
  });
});
