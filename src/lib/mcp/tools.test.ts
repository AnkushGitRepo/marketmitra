import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fApi = {
  getCompany: vi.fn(),
  getRatios: vi.fn(),
  getShareholding: vi.fn(),
  getPeers: vi.fn(),
  getDocuments: vi.fn(),
  getFinancials: vi.fn(),
  getPrices: vi.fn(),
  getIndices: vi.fn(),
  getQuotes: vi.fn(),
  searchSymbols: vi.fn(),
};
const newsApi = { getNews: vi.fn() };
const iposApi = { getIpos: vi.fn() };
const screenerApi = { runScreener: vi.fn() };

vi.mock('@/lib/dashboard/fundamentalsApi', () => fApi);
vi.mock('@/lib/dashboard/newsApi', () => newsApi);
vi.mock('@/lib/dashboard/iposApi', () => iposApi);
vi.mock('@/lib/dashboard/screener', () => screenerApi);

const { tools, toolNames } = await import('./tools');

const tool = (name: string) => {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

beforeEach(() => {
  for (const m of [...Object.values(fApi), newsApi.getNews, iposApi.getIpos, screenerApi.runScreener])
    m.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('tool registry', () => {
  it('exposes exactly the 8 v1 public-data tools', () => {
    expect(toolNames.sort()).toEqual(
      [
        'get_company_fundamentals',
        'get_market_indices',
        'get_news',
        'get_price_history',
        'get_quote',
        'list_ipos',
        'run_screener',
        'search_symbols',
      ].sort()
    );
  });

  it('every tool has a title, a non-trivial description, and a zod object input schema', () => {
    for (const t of tools) {
      expect(t.config.title).toBeTruthy();
      expect(t.config.description.length).toBeGreaterThan(40);
      // zod object schema — safeParse exists and {} either passes or fails cleanly
      expect(typeof t.config.inputSchema.safeParse).toBe('function');
    }
  });

  it('no tool touches per-user data (names only reference public data)', () => {
    for (const n of toolNames) {
      expect(n).not.toMatch(/portfolio|holding|alert|setting|watch|notification/i);
    }
  });
});

describe('search_symbols', () => {
  it('rejects an empty query at the schema boundary', () => {
    expect(tool('search_symbols').config.inputSchema.safeParse({ query: '' }).success).toBe(false);
  });

  it('returns results with a count', async () => {
    fApi.searchSymbols.mockResolvedValue([{ type: 'company', symbol: 'RELIANCE', name: 'Reliance' }]);
    const out = (await tool('search_symbols').run({ query: 'reli' })) as {
      count: number;
      results: unknown[];
    };
    expect(fApi.searchSymbols).toHaveBeenCalledWith('reli');
    expect(out.count).toBe(1);
    expect(out.results).toHaveLength(1);
  });
});

describe('get_quote', () => {
  it('caps the symbol list at 50 in the schema', () => {
    const symbols = Array.from({ length: 51 }, (_, i) => `S${i}`);
    expect(tool('get_quote').config.inputSchema.safeParse({ symbols }).success).toBe(false);
  });

  it('reports which requested symbols came back missing', async () => {
    fApi.getQuotes.mockResolvedValue([{ symbol: 'TCS', price: '3000', source_tier: 'tier2' }]);
    const out = (await tool('get_quote').run({ symbols: ['TCS', 'NOPE'] })) as {
      quotes: unknown[];
      missing: string[];
    };
    expect(out.quotes).toHaveLength(1);
    expect(out.missing).toEqual(['NOPE']);
  });
});

describe('get_company_fundamentals', () => {
  it('short-circuits with found:false when the company is unknown', async () => {
    fApi.getCompany.mockResolvedValue(null);
    const out = (await tool('get_company_fundamentals').run({ symbol: 'ZZZZ' })) as {
      found: boolean;
      message: string;
    };
    expect(out.found).toBe(false);
    expect(out.message).toMatch(/search_symbols/);
    expect(fApi.getRatios).not.toHaveBeenCalled();
  });

  it('fetches all sections by default and coalesces nulls to []', async () => {
    fApi.getCompany.mockResolvedValue({ symbol: 'RELIANCE', name: 'Reliance', about: 'oil' });
    fApi.getRatios.mockResolvedValue(null);
    fApi.getShareholding.mockResolvedValue([{ category: 'Promoters', percentage: '50' }]);
    fApi.getPeers.mockResolvedValue(null);
    fApi.getDocuments.mockResolvedValue(null);
    fApi.getFinancials.mockResolvedValue(null);
    const out = (await tool('get_company_fundamentals').run({ symbol: 'reliance' })) as {
      found: boolean;
      ratios: unknown[];
      shareholding: unknown[];
      financials: { profit_and_loss: unknown[] };
    };
    expect(out.found).toBe(true);
    expect(out.ratios).toEqual([]);
    expect(out.shareholding).toHaveLength(1);
    expect(out.financials.profit_and_loss).toEqual([]);
    expect(fApi.getFinancials).toHaveBeenCalledTimes(3);
  });

  it('honours a narrowed sections list', async () => {
    fApi.getCompany.mockResolvedValue({ symbol: 'TCS', name: 'TCS' });
    fApi.getRatios.mockResolvedValue([]);
    const out = (await tool('get_company_fundamentals').run({
      symbol: 'TCS',
      sections: ['company', 'ratios'],
    })) as Record<string, unknown>;
    expect(fApi.getRatios).toHaveBeenCalled();
    expect(fApi.getShareholding).not.toHaveBeenCalled();
    expect(fApi.getFinancials).not.toHaveBeenCalled();
    expect(out.shareholding).toBeUndefined();
    expect(out.financials).toBeUndefined();
  });
});

describe('get_price_history', () => {
  it('defaults period to 1y', async () => {
    fApi.getPrices.mockResolvedValue([{ trade_date: '2026-09-01', close: '100' }]);
    const parsed = tool('get_price_history').config.inputSchema.parse({ symbol: 'INFY' });
    const out = (await tool('get_price_history').run(parsed)) as { period: string; count: number };
    expect(fApi.getPrices).toHaveBeenCalledWith('INFY', '1y');
    expect(out.period).toBe('1y');
    expect(out.count).toBe(1);
  });

  it('rejects an unknown period', () => {
    expect(
      tool('get_price_history').config.inputSchema.safeParse({ symbol: 'INFY', period: '3y' }).success
    ).toBe(false);
  });
});

describe('get_news', () => {
  it('passes symbols through and carries the tone caveat', async () => {
    newsApi.getNews.mockResolvedValue({ items: [{ title: 'x' }], next_cursor: 'c1' });
    const parsed = tool('get_news').config.inputSchema.parse({ symbols: ['HDFCBANK'] });
    const out = (await tool('get_news').run(parsed)) as { next_cursor: string; note: string };
    expect(newsApi.getNews).toHaveBeenCalledWith({ symbols: ['HDFCBANK'], limit: 20, cursor: undefined });
    expect(out.next_cursor).toBe('c1');
    expect(out.note).toMatch(/not a signal/i);
  });

  it('omits an empty symbols array (broad stream)', async () => {
    newsApi.getNews.mockResolvedValue({ items: [], next_cursor: null });
    await tool('get_news').run({ symbols: [], limit: 20 });
    expect(newsApi.getNews).toHaveBeenCalledWith({ symbols: undefined, limit: 20, cursor: undefined });
  });
});

describe('list_ipos', () => {
  it('forwards the status filter and carries the GMP caveat', async () => {
    iposApi.getIpos.mockResolvedValue([{ slug: 'acme', name: 'Acme' }]);
    const out = (await tool('list_ipos').run({ status: 'open' })) as { count: number; note: string };
    expect(iposApi.getIpos).toHaveBeenCalledWith('open');
    expect(out.count).toBe(1);
    expect(out.note).toMatch(/unofficial grey-market estimate/i);
  });

  it('rejects an unknown status', () => {
    expect(tool('list_ipos').config.inputSchema.safeParse({ status: 'delisted' }).success).toBe(false);
  });
});

describe('get_market_indices', () => {
  it('returns indices with a count, tolerating null', async () => {
    fApi.getIndices.mockResolvedValue(null);
    const out = (await tool('get_market_indices').run({})) as { count: number; indices: unknown[] };
    expect(out.count).toBe(0);
    expect(out.indices).toEqual([]);
  });
});

describe('run_screener', () => {
  it('rejects a non-numeric value for a range filter at the boundary', () => {
    expect(
      tool('run_screener').config.inputSchema.safeParse({ pe_min: 'cheap' }).success
    ).toBe(false);
  });

  it('accepts an empty filter set (no criteria = default preset)', () => {
    expect(tool('run_screener').config.inputSchema.safeParse({}).success).toBe(true);
  });

  it('passes parsed filters straight through to runScreener', async () => {
    screenerApi.runScreener.mockResolvedValue([{ symbol: 'TCS' }]);
    await tool('run_screener').run({ pe_max: 20, roe_min: 15 });
    expect(screenerApi.runScreener).toHaveBeenCalledWith({ pe_max: 20, roe_min: 15 });
  });

  it('caps results at 20 and flags truncation, but reports the true count', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ symbol: `S${i}` }));
    screenerApi.runScreener.mockResolvedValue(rows);
    const out = (await tool('run_screener').run({})) as {
      count: number;
      results: unknown[];
      truncated: boolean;
    };
    expect(out.count).toBe(30);
    expect(out.results).toHaveLength(20);
    expect(out.truncated).toBe(true);
  });

  it('does not flag truncation when everything fits', async () => {
    screenerApi.runScreener.mockResolvedValue([{ symbol: 'TCS' }]);
    const out = (await tool('run_screener').run({})) as { truncated: boolean };
    expect(out.truncated).toBe(false);
  });
});
