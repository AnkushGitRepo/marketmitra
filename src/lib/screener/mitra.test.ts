import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/dashboard/screener', () => ({
  runScreenerPage: vi.fn(),
  getScreenerStats: vi.fn(),
}));

const { screenerUrl, usesFundamentals } = await import('./mitra');

describe('screenerUrl', () => {
  it('deep-links the filters and drops paging', () => {
    const url = screenerUrl({
      sales_growth_3y_cagr_min: 15,
      roe_min: 15,
      sort_by: 'profit_growth_3y_cagr',
      limit: 20,
      offset: 40,
    });
    expect(url).toBe(
      '/screener?sales_growth_3y_cagr_min=15&roe_min=15&sort_by=profit_growth_3y_cagr',
    );
  });

  it('still carries a sort for an empty screen so the page shows the whole market', () => {
    expect(screenerUrl({})).toBe('/screener?sort_by=market_cap');
  });

  it('round-trips through the page parser', async () => {
    const { parseScreenerParams } = await import('./params');
    const filters = {
      roe_min: 15,
      sector: 'Capital Goods',
      q: 'tata',
      sort_by: 'roe' as const,
      order: 'asc' as const,
    };
    const parsed = parseScreenerParams(new URL(`http://x${screenerUrl(filters)}`).searchParams);
    expect(parsed).toEqual({ ok: true, filters });
  });
});

describe('usesFundamentals', () => {
  it('is false for price-derived fields only', () => {
    expect(
      usesFundamentals({ pe_max: 15, pb_max: 2, market_cap_min: 500, dividend_yield_min: 2 }),
    ).toBe(false);
  });

  it('is true for scraped fields, sector/industry, or sorting by them', () => {
    expect(usesFundamentals({ roe_min: 10 })).toBe(true);
    expect(usesFundamentals({ sector: 'IT' })).toBe(true);
    expect(usesFundamentals({ sort_by: 'roce' })).toBe(true);
    expect(usesFundamentals({ sort_by: 'pe' })).toBe(false);
  });
});
