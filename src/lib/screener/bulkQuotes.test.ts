import { describe, expect, it } from 'vitest';
import { chunk, toScreenerQuoteRow } from './bulkQuotes';

describe('toScreenerQuoteRow', () => {
  it('converts market cap to rupees crore and strips the exchange suffix', () => {
    const row = toScreenerQuoteRow({
      symbol: 'TCS.NS',
      regularMarketPrice: 3500,
      marketCap: 1.28e13,
      trailingPE: 28.4,
      priceToBook: 13.1,
      dividendYield: 1.7,
    });
    expect(row).toEqual({
      symbol: 'TCS',
      current_price: 3500,
      market_cap: 1.28e6,
      pe: 28.4,
      pb: 13.1,
      dividend_yield: 1.7,
    });
  });

  it('returns null without a price or symbol', () => {
    expect(toScreenerQuoteRow({ symbol: 'X.NS' })).toBeNull();
    expect(toScreenerQuoteRow({ regularMarketPrice: 10 })).toBeNull();
  });

  it('drops negative/zero P/E and P/B instead of storing them', () => {
    const row = toScreenerQuoteRow({
      symbol: 'LOSS.NS',
      regularMarketPrice: 5,
      trailingPE: -4,
      priceToBook: 0,
    });
    expect(row).toEqual({ symbol: 'LOSS', current_price: 5 });
  });

  it('drops an implausible dividend yield', () => {
    const row = toScreenerQuoteRow({ symbol: 'A.NS', regularMarketPrice: 5, dividendYield: 480 });
    expect(row?.dividend_yield).toBeUndefined();
  });
});

describe('chunk', () => {
  it('splits into fixed-size groups with a short tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
