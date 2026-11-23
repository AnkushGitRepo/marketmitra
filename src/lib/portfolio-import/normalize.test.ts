import { describe, expect, it } from 'vitest';
import { isSummaryLabel, mergeDuplicates, normalizeSymbol, parseAmount } from './normalize';

describe('parseAmount', () => {
  it.each([
    ['1,25,450.50', 125450.5],
    ['₹2,310.35', 2310.35],
    ['  $ 1,000 ', 1000],
    ['Rs. 99', 99],
    ['INR 1,500.00', 1500],
    ['12', 12],
    [42, 42],
  ])('reads %j as %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-', '₹', null, undefined, NaN, Infinity, '(5)', '-3'])('reads %j as not a positive amount', (input) => {
    const n = parseAmount(input);
    expect(Number.isFinite(n) && n > 0).toBe(false);
  });
});

describe('normalizeSymbol', () => {
  it.each([
    ['RELIANCE-EQ', 'RELIANCE'],
    ['TCS.NS', 'TCS'],
    ['hdfcbank.bo', 'HDFCBANK'],
    ['INFY.NSE', 'INFY'],
    ['SBIN.BSE', 'SBIN'],
    ['  itc-eq ', 'ITC'],
    ['M&M', 'M&M'],
    ['BAJAJ-AUTO', 'BAJAJ-AUTO'],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeSymbol(input)?.symbol).toBe(expected);
  });

  it('reads a lower-case ticker as a ticker, and a mixed-case or spaced name as a name', () => {
    expect(normalizeSymbol('hdfcbank')).toEqual({ symbol: 'HDFCBANK', name: null });
    expect(normalizeSymbol('Tata Consultancy Services')).toEqual({ symbol: null, name: 'Tata Consultancy Services' });
    expect(normalizeSymbol('Infosys')).toEqual({ symbol: null, name: 'Infosys' });
  });

  it('returns null for blank text', () => {
    expect(normalizeSymbol('   ')).toBeNull();
  });
});

describe('isSummaryLabel', () => {
  it.each(['Total', 'TOTAL', 'Grand Total', 'total:', 'Net Total', 'Summary'])('flags %j', (label) => {
    expect(isSummaryLabel(label)).toBe(true);
  });
  it.each(['TOTALENERGIES', 'TATAMOTORS', 'Total Play'])('does not flag %j', (label) => {
    expect(isSummaryLabel(label)).toBe(false);
  });
});

describe('mergeDuplicates', () => {
  it('merges a ticker bought in two tranches by weighted average cost', () => {
    const merged = mergeDuplicates([
      { rawSymbol: 'INFY', rawName: null, quantity: 10, avgPrice: 1400 },
      { rawSymbol: 'TCS', rawName: null, quantity: 1, avgPrice: 3000 },
      { rawSymbol: 'INFY', rawName: null, quantity: 5, avgPrice: 1550 },
    ]);
    expect(merged).toEqual([
      { rawSymbol: 'INFY', rawName: null, quantity: 15, avgPrice: 1450 },
      { rawSymbol: 'TCS', rawName: null, quantity: 1, avgPrice: 3000 },
    ]);
  });

  it('rounds the merged price to paise', () => {
    const [h] = mergeDuplicates([
      { rawSymbol: 'ITC', rawName: null, quantity: 1, avgPrice: 100 },
      { rawSymbol: 'ITC', rawName: null, quantity: 2, avgPrice: 101 },
    ]);
    expect(h.avgPrice).toBe(100.67);
  });

  it('merges name-only rows case-insensitively and does not mutate its input', () => {
    const input = [
      { rawSymbol: null, rawName: 'HDFC Bank', quantity: 2, avgPrice: 100 },
      { rawSymbol: null, rawName: 'hdfc bank', quantity: 2, avgPrice: 200 },
    ];
    const copy = JSON.parse(JSON.stringify(input));
    expect(mergeDuplicates(input)).toEqual([{ rawSymbol: null, rawName: 'HDFC Bank', quantity: 4, avgPrice: 150 }]);
    expect(input).toEqual(copy);
  });
});
