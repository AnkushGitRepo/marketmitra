import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const quoteMock = vi.fn();
const chartMock = vi.fn();

vi.mock('yahoo-finance2', () => ({
  default: class {
    quote(symbol: string) {
      return quoteMock(symbol);
    }
    chart(symbol: string, options: unknown) {
      return chartMock(symbol, options);
    }
  },
}));

const { fetchYahooQuotes, fetchIndexHistory, isTrackedIndexName, TRACKED_INDEX_NAMES } = await import(
  './yahooQuote'
);

beforeEach(() => {
  quoteMock.mockReset();
  chartMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('fetchYahooQuotes for SME stocks', () => {
  const NOW = new Date('2026-11-17T09:00:00Z');
  const fresh = (price: number) => ({ regularMarketPrice: price, regularMarketTime: new Date('2026-11-17T08:47:31Z') });
  const dead = (price: number) => ({ regularMarketPrice: price, regularMarketTime: new Date('2024-07-23T20:00:00Z') });

  it('uses the series-suffixed ticker when the plain one is a dead line (Oriana: 2,077.8 stale vs 212.15 live)', async () => {
    quoteMock.mockImplementation(async (t: string) => (t === 'ORIANA.NS' ? dead(2077.8) : t === 'ORIANA-SM.NS' ? fresh(212.15) : undefined));
    const result = await fetchYahooQuotes(['ORIANA'], NOW);
    expect(result.get('ORIANA')?.price).toBe('212.15');
  });

  it('tries the ST series too, and returns nothing rather than a stale price', async () => {
    quoteMock.mockImplementation(async (t: string) => (t === 'HGSINDIALT-ST.NS' ? fresh(230) : t === 'HGSINDIALT.NS' ? dead(10) : undefined));
    expect((await fetchYahooQuotes(['HGSINDIALT'], NOW)).get('HGSINDIALT')?.price).toBe('230');
    quoteMock.mockImplementation(async () => dead(10));
    expect((await fetchYahooQuotes(['GONE'], NOW)).has('GONE')).toBe(false);
  });

  it('does not look further when the plain ticker is live (the main board costs one call)', async () => {
    quoteMock.mockResolvedValue(fresh(1400));
    await fetchYahooQuotes(['RELIANCE'], NOW);
    expect(quoteMock).toHaveBeenCalledTimes(1);
  });
});

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

    const result = await fetchYahooQuotes(['RELIANCE'], new Date('2026-09-13T00:00:00Z'));
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
      if (symbol.startsWith('BOOM')) return Promise.reject(new Error('upstream 503'));
      return Promise.resolve({ regularMarketPrice: 500 });
    });

    const result = await fetchYahooQuotes(['BOOM', 'OK']);
    expect(result.has('BOOM')).toBe(false);
    expect(result.get('OK')?.price).toBe('500');
  });
});

describe('isTrackedIndexName / TRACKED_INDEX_NAMES', () => {
  it('recognizes all 4 tracked index names, case-insensitively', () => {
    expect(TRACKED_INDEX_NAMES.sort()).toEqual(
      ['INDIA VIX', 'NIFTY 50', 'NIFTY BANK', 'SENSEX'].sort()
    );
    expect(isTrackedIndexName('nifty 50')).toBe(true);
    expect(isTrackedIndexName('Sensex')).toBe(true);
  });

  it('rejects a name that is not a tracked index', () => {
    expect(isTrackedIndexName('RELIANCE')).toBe(false);
    expect(isTrackedIndexName('NIFTY NEXT 50')).toBe(false);
  });
});

describe('fetchIndexHistory', () => {
  it('maps chart() quotes to PricePointOut, newest first', async () => {
    chartMock.mockResolvedValue({
      quotes: [
        { date: new Date('2026-09-10'), open: 100, high: 105, low: 99, close: 104, volume: 1000 },
        { date: new Date('2026-09-11'), open: 104, high: 108, low: 103, close: 107, volume: 1200 },
      ],
    });

    const points = await fetchIndexHistory('NIFTY 50', '1mo');
    expect(chartMock).toHaveBeenCalledWith('^NSEI', expect.objectContaining({ interval: '1d' }));
    expect(points).toEqual([
      {
        trade_date: '2026-09-11',
        open: '104',
        high: '108',
        low: '103',
        close: '107',
        volume: 1200,
        source_tier: 'yahoo_finance2',
      },
      {
        trade_date: '2026-09-10',
        open: '100',
        high: '105',
        low: '99',
        close: '104',
        volume: 1000,
        source_tier: 'yahoo_finance2',
      },
    ]);
  });

  it('drops quotes with no close', async () => {
    chartMock.mockResolvedValue({
      quotes: [{ date: new Date('2026-09-10'), open: 100, high: 105, low: 99, close: null, volume: 1000 }],
    });
    expect(await fetchIndexHistory('SENSEX', '1mo')).toEqual([]);
  });

  it('returns [] (never throws) when chart() fails', async () => {
    chartMock.mockRejectedValue(new Error('upstream 503'));
    expect(await fetchIndexHistory('NIFTY 50', '1y')).toEqual([]);
  });
});
