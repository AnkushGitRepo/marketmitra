import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fApi = {
  getCompany: vi.fn(),
  getRatios: vi.fn(),
  getShareholding: vi.fn(),
  getPeers: vi.fn(),
  getDocuments: vi.fn(),
  getFinancials: vi.fn(),
  getQuotes: vi.fn(),
};

vi.mock('./fundamentalsApi', () => fApi);

const { getStockAggregate } = await import('./stockAggregate');

beforeEach(() => {
  for (const m of Object.values(fApi)) m.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('getStockAggregate', () => {
  it('returns found:false with a hint when the company is unknown', async () => {
    fApi.getCompany.mockResolvedValue(null);
    const out = await getStockAggregate('ZZZZ');
    expect(out.found).toBe(false);
    if (!out.found) expect(out.message).toMatch(/search_symbols|api\/search/);
    expect(fApi.getQuotes).not.toHaveBeenCalled();
  });

  it('fetches every section by default, including a live quote', async () => {
    fApi.getCompany.mockResolvedValue({ symbol: 'RELIANCE', name: 'Reliance' });
    fApi.getQuotes.mockResolvedValue([{ symbol: 'RELIANCE', price: '1400', source_tier: 'yahoo_finance2' }]);
    fApi.getRatios.mockResolvedValue(null);
    fApi.getShareholding.mockResolvedValue(null);
    fApi.getPeers.mockResolvedValue(null);
    fApi.getDocuments.mockResolvedValue(null);
    fApi.getFinancials.mockResolvedValue(null);

    const out = await getStockAggregate('reliance');
    expect(out.found).toBe(true);
    if (!out.found) throw new Error('unreachable');
    expect(out.quote?.price).toBe('1400');
    expect(out.ratios).toEqual([]);
    expect(out.financials?.profit_and_loss).toEqual([]);
    expect(fApi.getFinancials).toHaveBeenCalledTimes(3);
  });

  it('narrows to only the requested sections', async () => {
    fApi.getCompany.mockResolvedValue({ symbol: 'TCS', name: 'TCS' });
    const out = await getStockAggregate('TCS', ['company']);
    expect(out.found).toBe(true);
    if (!out.found) throw new Error('unreachable');
    expect(out.company).toBeDefined();
    expect(out.quote).toBeUndefined();
    expect(out.ratios).toBeUndefined();
    expect(fApi.getQuotes).not.toHaveBeenCalled();
    expect(fApi.getRatios).not.toHaveBeenCalled();
  });
});
