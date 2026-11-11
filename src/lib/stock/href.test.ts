import { describe, expect, it } from 'vitest';
import { stockHref } from './href';

describe('stockHref', () => {
  it('builds the stock page path with an upper-cased symbol', () => {
    expect(stockHref('sbin')).toBe('/stock/SBIN');
    expect(stockHref(' TCS ')).toBe('/stock/TCS');
  });
  it('encodes symbols with special characters', () => {
    expect(stockHref('M&M')).toBe('/stock/M%26M');
    expect(stockHref('BAJAJ-AUTO')).toBe('/stock/BAJAJ-AUTO');
  });
});
