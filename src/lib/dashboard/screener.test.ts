import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getJsonMock = vi.fn();

vi.mock('./fundamentalsApi', () => ({ getJson: getJsonMock }));

const { runScreener, getScreenerFacets } = await import('./screener');

beforeEach(() => {
  getJsonMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('runScreener', () => {
  it('builds a query string from only the provided filters', async () => {
    getJsonMock.mockResolvedValue([]);
    await runScreener({ pe_max: 20, roe_min: 15, sector: 'Information Technology' });

    expect(getJsonMock).toHaveBeenCalledTimes(1);
    const [path] = getJsonMock.mock.calls[0];
    expect(path).toContain('/screener?');
    expect(path).toContain('pe_max=20');
    expect(path).toContain('roe_min=15');
    expect(path).toContain('sector=Information');
  });

  it('omits undefined filters entirely, never sending pe_min=undefined', async () => {
    getJsonMock.mockResolvedValue([]);
    await runScreener({ pe_min: undefined, pe_max: 20 });
    const [path] = getJsonMock.mock.calls[0];
    expect(path).not.toContain('pe_min');
    expect(path).toContain('pe_max=20');
  });

  it('calls the bare path with no query string when no filters are given', async () => {
    getJsonMock.mockResolvedValue([]);
    await runScreener({});
    expect(getJsonMock).toHaveBeenCalledWith('/screener', 3600);
  });

  it('returns [] (never throws) when the fundamentals-api call fails', async () => {
    getJsonMock.mockResolvedValue(null);
    const result = await runScreener({ pe_max: 20 });
    expect(result).toEqual([]);
  });

  it('returns the rows unchanged on success', async () => {
    const rows = [{ symbol: 'TCS', name: 'Tata Consultancy Services', pe: 15 }];
    getJsonMock.mockResolvedValue(rows);
    const result = await runScreener({ pe_max: 20 });
    expect(result).toBe(rows);
  });
});

describe('getScreenerFacets', () => {
  it('returns empty arrays (never throws) when the call fails', async () => {
    getJsonMock.mockResolvedValue(null);
    expect(await getScreenerFacets()).toEqual({ sectors: [], industries: [] });
  });

  it('returns the facets unchanged on success', async () => {
    const facets = { sectors: ['IT'], industries: ['Software'] };
    getJsonMock.mockResolvedValue(facets);
    expect(await getScreenerFacets()).toBe(facets);
  });
});
