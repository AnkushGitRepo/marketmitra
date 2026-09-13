import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchYahooQuotesMock = vi.fn();

vi.mock('./yahooQuote', () => ({
  fetchYahooQuotes: fetchYahooQuotesMock,
}));

const { getQuotes } = await import('./fundamentalsApi');

const okJson = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

beforeEach(() => {
  fetchYahooQuotesMock.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getQuotes', () => {
  it('never calls the fundamentals-api fallback when yahoo-finance2 resolves everything', async () => {
    fetchYahooQuotesMock.mockResolvedValue(
      new Map([
        ['RELIANCE', { symbol: 'RELIANCE', price: '1400', source_tier: 'yahoo_finance2' }],
        ['TCS', { symbol: 'TCS', price: '3000', source_tier: 'yahoo_finance2' }],
      ])
    );

    const out = await getQuotes(['RELIANCE', 'TCS']);
    expect(fetch).not.toHaveBeenCalled();
    expect(out.map((q) => q.symbol)).toEqual(['RELIANCE', 'TCS']);
  });

  it('falls back to the fundamentals-api only for symbols yahoo-finance2 missed, preserving order', async () => {
    fetchYahooQuotesMock.mockResolvedValue(
      new Map([['RELIANCE', { symbol: 'RELIANCE', price: '1400', source_tier: 'yahoo_finance2' }]])
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okJson([{ symbol: 'TCS', price: '3000', source_tier: 'tier1_nse_bse' }])
    );

    const out = await getQuotes(['RELIANCE', 'TCS']);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('symbols=TCS');
    expect(String(url)).not.toContain('RELIANCE');
    expect(out.map((q) => q.symbol)).toEqual(['RELIANCE', 'TCS']);
    expect(out[1].source_tier).toBe('tier1_nse_bse');
  });

  it('omits a symbol both sources come up short on — never a fabricated price', async () => {
    fetchYahooQuotesMock.mockResolvedValue(new Map());
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okJson([]));

    const out = await getQuotes(['UNKNOWNCO']);
    expect(out).toEqual([]);
  });

  it('dedupes and uppercases symbols before calling either source', async () => {
    fetchYahooQuotesMock.mockResolvedValue(new Map());
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okJson([]));

    await getQuotes(['reliance', 'RELIANCE', ' Reliance ']);
    expect(fetchYahooQuotesMock).toHaveBeenCalledWith(['RELIANCE']);
  });

  it('short-circuits on an empty symbol list without calling either source', async () => {
    const out = await getQuotes([]);
    expect(out).toEqual([]);
    expect(fetchYahooQuotesMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
