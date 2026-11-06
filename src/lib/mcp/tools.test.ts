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
const screenerApi = { runScreenerPage: vi.fn(), getScreenerStats: vi.fn(), getScreenerFacets: vi.fn() };

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
  for (const m of [
    ...Object.values(fApi),
    newsApi.getNews,
    iposApi.getIpos,
    screenerApi.runScreenerPage,
    screenerApi.getScreenerStats,
  ])
    m.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('tool registry', () => {
  it('exposes exactly the 9 public-data tools', () => {
    expect(toolNames.sort()).toEqual(
      [
        'get_company_fundamentals',
        'get_market_indices',
        'get_news',
        'get_price_history',
        'get_quote',
        'get_screener_options',
        'list_ipos',
        'run_screener',
        'search_symbols',
      ].sort(),
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
    fApi.searchSymbols.mockResolvedValue([
      { type: 'company', symbol: 'RELIANCE', name: 'Reliance' },
    ]);
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

  it('fetches all sections by default (including a live quote) and coalesces nulls to []', async () => {
    fApi.getCompany.mockResolvedValue({ symbol: 'RELIANCE', name: 'Reliance', about: 'oil' });
    fApi.getQuotes.mockResolvedValue([
      { symbol: 'RELIANCE', price: '1400', source_tier: 'yahoo_finance2' },
    ]);
    fApi.getRatios.mockResolvedValue(null);
    fApi.getShareholding.mockResolvedValue([{ category: 'Promoters', percentage: '50' }]);
    fApi.getPeers.mockResolvedValue(null);
    fApi.getDocuments.mockResolvedValue(null);
    fApi.getFinancials.mockResolvedValue(null);
    const out = (await tool('get_company_fundamentals').run({ symbol: 'reliance' })) as {
      found: boolean;
      quote: { price: string } | null;
      ratios: unknown[];
      shareholding: unknown[];
      financials: { profit_and_loss: unknown[] };
    };
    expect(out.found).toBe(true);
    expect(out.quote?.price).toBe('1400');
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
    expect(fApi.getQuotes).not.toHaveBeenCalled();
    expect(fApi.getShareholding).not.toHaveBeenCalled();
    expect(fApi.getFinancials).not.toHaveBeenCalled();
    expect(out.quote).toBeUndefined();
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
      tool('get_price_history').config.inputSchema.safeParse({ symbol: 'INFY', period: '3y' })
        .success,
    ).toBe(false);
  });
});

describe('get_news', () => {
  it('passes symbols through and carries the tone caveat', async () => {
    newsApi.getNews.mockResolvedValue({ items: [{ title: 'x' }], next_cursor: 'c1' });
    const parsed = tool('get_news').config.inputSchema.parse({ symbols: ['HDFCBANK'] });
    const out = (await tool('get_news').run(parsed)) as { next_cursor: string; note: string };
    expect(newsApi.getNews).toHaveBeenCalledWith({
      symbols: ['HDFCBANK'],
      limit: 20,
      cursor: undefined,
    });
    expect(out.next_cursor).toBe('c1');
    expect(out.note).toMatch(/not a signal/i);
  });

  it('omits an empty symbols array (broad stream)', async () => {
    newsApi.getNews.mockResolvedValue({ items: [], next_cursor: null });
    await tool('get_news').run({ symbols: [], limit: 20 });
    expect(newsApi.getNews).toHaveBeenCalledWith({
      symbols: undefined,
      limit: 20,
      cursor: undefined,
    });
  });
});

describe('list_ipos', () => {
  it('forwards the status filter and carries the GMP caveat', async () => {
    iposApi.getIpos.mockResolvedValue([{ slug: 'acme', name: 'Acme' }]);
    const out = (await tool('list_ipos').run({ status: 'open' })) as {
      count: number;
      note: string;
    };
    expect(iposApi.getIpos).toHaveBeenCalledWith('open');
    expect(out.count).toBe(1);
    expect(out.note).toMatch(/unofficial grey-market estimate/i);
  });

  it('rejects an unknown status', () => {
    expect(tool('list_ipos').config.inputSchema.safeParse({ status: 'delisted' }).success).toBe(
      false,
    );
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
    expect(tool('run_screener').config.inputSchema.safeParse({ pe_min: 'cheap' }).success).toBe(
      false,
    );
  });

  it('accepts an empty filter set (no criteria = default preset)', () => {
    expect(tool('run_screener').config.inputSchema.safeParse({}).success).toBe(true);
  });

  const row = (symbol: string) => ({
    symbol,
    name: `${symbol} Ltd`,
    sector: 'IT',
    industry: null,
    market_cap: 1234.6,
    current_price: 10,
    pe: 12,
    book_value: null,
    pb: 2,
    dividend_yield: 1,
    roce: 20,
    roe: 18,
    face_value: 1,
    debt_to_equity: 0.2,
    sales_growth_3y_cagr: 15,
    profit_growth_3y_cagr: 22,
    fetch_status: 'ok',
    source_tier: 'x',
    fetched_at: '2026-11-06T00:00:00Z',
  });

  it('passes filters to the screener page query, without paging the caller supplied', async () => {
    screenerApi.runScreenerPage.mockResolvedValue({ rows: [row('TCS')], total: 1 });
    await tool('run_screener').run({ pe_max: 20, roe_min: 15, limit: 500, offset: 9 });
    expect(screenerApi.runScreenerPage).toHaveBeenCalledWith({
      pe_max: 20,
      roe_min: 15,
      limit: 20,
      offset: 0,
    });
  });

  it('returns compact rows, capped at 20, with the true total match count', async () => {
    screenerApi.runScreenerPage.mockResolvedValue({
      rows: Array.from({ length: 20 }, (_, i) => row(`S${i}`)),
      total: 137,
    });
    const out = (await tool('run_screener').run({})) as {
      count: number;
      results: { symbol: string; market_cap_cr: number; roe_pct: number }[];
      truncated: boolean;
    };
    expect(out.count).toBe(137);
    expect(out.results).toHaveLength(20);
    expect(out.results[0]).toMatchObject({ symbol: 'S0', market_cap_cr: 1235, roe_pct: 18 });
    expect(out.truncated).toBe(true);
  });

  it('does not flag truncation when everything fits', async () => {
    screenerApi.runScreenerPage.mockResolvedValue({ rows: [row('TCS')], total: 1 });
    const out = (await tool('run_screener').run({})) as { truncated: boolean };
    expect(out.truncated).toBe(false);
  });

  it('steers the next attempt when nothing matches', async () => {
    screenerApi.runScreenerPage.mockResolvedValue({ rows: [], total: 0 });
    screenerApi.getScreenerStats.mockResolvedValue({ universe: 1, with_fundamentals: 1 });
    const withSector = (await tool('run_screener').run({ sector: 'Pharma' })) as { hint?: string };
    expect(withSector.hint).toMatch(/get_screener_options/);
    const plain = (await tool('run_screener').run({ pe_max: 1 })) as { hint?: string };
    expect(plain.hint).toMatch(/Loosen/);
  });

  it('adds a coverage warning only when the screen uses scraped fundamentals', async () => {
    screenerApi.runScreenerPage.mockResolvedValue({ rows: [], total: 0 });
    screenerApi.getScreenerStats.mockResolvedValue({ universe: 2630, with_fundamentals: 900 });
    const priceOnly = (await tool('run_screener').run({ pe_max: 15 })) as { coverage?: unknown };
    expect(priceOnly.coverage).toBeUndefined();
    const quality = (await tool('run_screener').run({ roe_min: 15 })) as {
      coverage?: { companiesWithFundamentals: number; note: string };
    };
    expect(quality.coverage?.companiesWithFundamentals).toBe(900);
    expect(quality.coverage?.note).toMatch(/scraped so far/);
  });
});

describe('get_screener_options', () => {
  it('lists sectors with company counts when no sector is given', async () => {
    screenerApi.getScreenerFacets.mockResolvedValue({
      sectors: ['Capital Goods', 'Healthcare'],
      industries: ['x'],
      sector_counts: { 'Capital Goods': 40, Healthcare: 55 },
      industry_counts: {},
    });
    const out = (await tool('get_screener_options').run({})) as { sectors: { name: string; companies: number }[] };
    expect(screenerApi.getScreenerFacets).toHaveBeenCalledWith(undefined);
    expect(out.sectors).toEqual([
      { name: 'Capital Goods', companies: 40 },
      { name: 'Healthcare', companies: 55 },
    ]);
  });

  it('lists only that sector\'s industries when a sector is given', async () => {
    screenerApi.getScreenerFacets.mockResolvedValue({
      sectors: ['Healthcare'],
      industries: ['Pharmaceuticals', 'Hospitals'],
      industry_counts: { Pharmaceuticals: 30, Hospitals: 9 },
    });
    const out = (await tool('get_screener_options').run({ sector: 'Healthcare' })) as {
      industries: { name: string; companies: number }[];
    };
    expect(screenerApi.getScreenerFacets).toHaveBeenCalledWith('Healthcare');
    expect(out.industries[0]).toEqual({ name: 'Pharmaceuticals', companies: 30 });
  });
});
