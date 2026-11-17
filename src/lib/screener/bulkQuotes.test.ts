import { beforeEach, describe, expect, it, vi } from 'vitest';

const yahoo = vi.hoisted(() => ({
  plain: vi.fn<(symbols: string[]) => Promise<Record<string, unknown>[]>>(),
  tickers: vi.fn<(tickers: readonly string[]) => Promise<Record<string, unknown>[]>>(),
}));
vi.mock('@/lib/dashboard/yahooQuote', () => ({ fetchYahooQuoteChunk: yahoo.plain, fetchYahooTickerQuotes: yahoo.tickers }));

const { chunk, fetchScreenerQuoteRows, seriesTicker, toScreenerQuoteRow } = await import('./bulkQuotes');

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


describe('seriesTicker', () => {
  it('names the series-suffixed Yahoo ticker an SME share is often listed under', () => {
    expect(seriesTicker({ symbol: 'ANONDITA', series: 'SM', is_sme: true })).toBe('ANONDITA-SM.NS');
    expect(seriesTicker({ symbol: 'HGSINDIALT', series: 'ST', is_sme: true })).toBe('HGSINDIALT-ST.NS');
  });

  it('has none for the main board or an unknown series', () => {
    expect(seriesTicker({ symbol: 'TCS', series: 'EQ', is_sme: false })).toBeNull();
    expect(seriesTicker({ symbol: 'X', series: null, is_sme: true })).toBeNull();
    expect(seriesTicker({ symbol: 'X', series: 'BE', is_sme: true })).toBeNull();
  });
});

describe('fetchScreenerQuoteRows with SME', () => {
  beforeEach(() => {
    yahoo.plain.mockReset();
    yahoo.tickers.mockReset();
  });

  const NOW = new Date('2026-11-17T09:00:00Z');
  const FRESH = new Date('2026-11-17T08:47:31Z');
  const DEAD = new Date('2024-07-23T20:00:00Z');
  const universe = [
    { symbol: 'TCS', series: 'EQ', is_sme: false },
    { symbol: 'AAKAAR', series: 'SM', is_sme: true },
    { symbol: 'HGSINDIALT', series: 'ST', is_sme: true },
  ];

  it('quotes the main board by its plain ticker and SME only by its series-suffixed one', async () => {
    yahoo.plain.mockResolvedValue([{ symbol: 'TCS.NS', regularMarketPrice: 3500, marketCap: 1.28e13 }]);
    yahoo.tickers.mockResolvedValue([
      { symbol: 'AAKAAR-SM.NS', regularMarketPrice: 66, regularMarketTime: FRESH, longName: 'Aakaar Medical Technologies Limited' },
      { symbol: 'HGSINDIALT-ST.NS', regularMarketPrice: 230, regularMarketTime: FRESH },
    ]);
    const rows = await fetchScreenerQuoteRows(universe, NOW);
    expect(yahoo.plain).toHaveBeenCalledWith(['TCS']);
    expect(yahoo.tickers).toHaveBeenCalledWith(['AAKAAR-SM.NS', 'HGSINDIALT-ST.NS']);
    expect(rows.map((r) => r.symbol).sort()).toEqual(['AAKAAR', 'HGSINDIALT', 'TCS']);
    expect(rows.find((r) => r.symbol === 'AAKAAR')).toMatchObject({ current_price: 66, name: 'Aakaar Medical Technologies Limited' });
  });

  it('never asks for an SME symbol by its plain ticker: that line is dead for most of them', async () => {
    yahoo.plain.mockResolvedValue([]);
    yahoo.tickers.mockResolvedValue([]);
    await fetchScreenerQuoteRows(universe, NOW);
    expect(yahoo.plain.mock.calls.flat(2)).toEqual(['TCS']);
  });

  it('drops an SME quote that has not traded for over a week instead of storing a stale price', async () => {
    yahoo.plain.mockResolvedValue([]);
    yahoo.tickers.mockResolvedValue([
      { symbol: 'AAKAAR-SM.NS', regularMarketPrice: 66, regularMarketTime: FRESH },
      { symbol: 'HGSINDIALT-ST.NS', regularMarketPrice: 230, regularMarketTime: DEAD },
    ]);
    expect((await fetchScreenerQuoteRows(universe, NOW)).map((r) => r.symbol)).toEqual(['AAKAAR']);
  });

  it('skips the second call when there is no SME symbol', async () => {
    yahoo.plain.mockResolvedValue([{ symbol: 'TCS.NS', regularMarketPrice: 3500 }]);
    await fetchScreenerQuoteRows([universe[0]!], NOW);
    expect(yahoo.tickers).not.toHaveBeenCalled();
  });
});
