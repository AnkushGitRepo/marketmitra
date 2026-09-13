import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const quoteMock = vi.fn();

vi.mock('yahoo-finance2', () => ({
  default: class {
    quote(symbol: string) {
      return quoteMock(symbol);
    }
  },
}));

const { fetchYahooQuotes } = await import('./yahooQuote');

beforeEach(() => {
  quoteMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('fetchYahooQuotes', () => {
  it('maps a normal quote to QuoteOut, using the .NS suffix for an equity symbol', async () => {
    quoteMock.mockResolvedValue({
      regularMarketPrice: 1400.5,
      regularMarketPreviousClose: 1350.25,
      regularMarketChangePercent: 3.72,
      fiftyTwoWeekHigh: 1600,
      fiftyTwoWeekLow: 1100,
      regularMarketTime: new Date('2026-09-12T10:00:00Z'),
    });

    const result = await fetchYahooQuotes(['RELIANCE']);
    expect(quoteMock).toHaveBeenCalledWith('RELIANCE.NS');
    const quote = result.get('RELIANCE');
    expect(quote).toEqual({
      symbol: 'RELIANCE',
      price: '1400.5',
      prev_close: '1350.25',
      change_pct: '3.72',
      week52_high: '1600',
      week52_low: '1100',
      as_of: '2026-09-12T10:00:00.000Z',
      source_tier: 'yahoo_finance2',
    });
  });

  it('resolves a tracked index name to its ^ ticker', async () => {
    quoteMock.mockResolvedValue({ regularMarketPrice: 24500 });
    await fetchYahooQuotes(['NIFTY 50']);
    expect(quoteMock).toHaveBeenCalledWith('^NSEI');
  });

  it('omits a symbol with no last price — never a fabricated price', async () => {
    quoteMock.mockResolvedValue({ regularMarketPrice: undefined });
    const result = await fetchYahooQuotes(['GHOST']);
    expect(result.has('GHOST')).toBe(false);
  });

  it('null change_pct/prev_close when missing, without failing the whole quote', async () => {
    quoteMock.mockResolvedValue({ regularMarketPrice: 100 });
    const result = await fetchYahooQuotes(['X']);
    const quote = result.get('X');
    expect(quote?.prev_close).toBeNull();
    expect(quote?.change_pct).toBeNull();
  });

  it('one rejected symbol does not fail the others in the same batch', async () => {
    quoteMock.mockImplementation((symbol: string) => {
      if (symbol === 'BOOM.NS') return Promise.reject(new Error('upstream 503'));
      return Promise.resolve({ regularMarketPrice: 500 });
    });

    const result = await fetchYahooQuotes(['BOOM', 'OK']);
    expect(result.has('BOOM')).toBe(false);
    expect(result.get('OK')?.price).toBe('500');
  });
});
