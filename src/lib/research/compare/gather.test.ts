import { describe, expect, it, vi } from 'vitest';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { gatherCompareInputs, type CompareGetters } from './gather';

const row = (symbol: string, over: Partial<ScreenerResultRow> = {}): ScreenerResultRow =>
  ({ symbol, name: symbol, sector: 'Telecom', industry: 'Telecom Services', market_cap: 1000, pe: 20, pb: 3, roce: 11, roe: 9, debt_to_equity: 0.7, dividend_yield: 0.4, sales_growth_3y_cagr: 8, profit_growth_3y_cagr: 12, ...over }) as ScreenerResultRow;
const pl = (symbol: string) => [2022, 2023, 2024].flatMap((y) => ['Sales', 'Operating Profit'].map((label) => ({ label, period_type: 'annual', period_end: `${y}-03-31`, value: String(label === 'Sales' ? 100 + y - 2022 : 20), unit: 'INR_CR', source_tier: symbol })));

const getters = (over: Partial<CompareGetters> = {}): CompareGetters => ({
  resolve: async (raw) => (raw === 'zzz' ? null : { symbol: raw.toUpperCase(), name: `${raw.toUpperCase()} Ltd` }),
  company: async () => ({ sector: 'Telecom', industry: 'Telecom Services' }) as never,
  ratios: async () => [{ name: 'Market Cap', value: '500', unit: 'INR_CR', as_of: '', source_tier: '' }],
  profitAndLoss: async (s) => pl(s) as never,
  page: async (f) => ({ rows: [row(String(f.q).toUpperCase())], total: 1 }),
  ...over,
});

describe('gatherCompareInputs', () => {
  it('loads each company with its figures, in the order typed', async () => {
    const r = await gatherCompareInputs(['jpl', 'bhartiartl'], getters());
    if (!('companies' in r)) throw new Error('unexpected');
    expect(r.companies.map((c) => c.symbol)).toEqual(['JPL', 'BHARTIARTL']);
    expect(r.companies[0]).toMatchObject({ marketCap: 1000, pe: 20, roce: 11, debtToEquity: 0.7, profitCagr3y: 12 });
    expect(r.companies[0].annual).toHaveLength(3);
  });

  it('names a company it cannot find instead of dropping it', async () => {
    expect(await gatherCompareInputs(['jpl', 'zzz'], getters())).toEqual({ unknown: ['zzz'] });
  });

  it('counts a company typed twice (as a name and a symbol) once', async () => {
    const r = await gatherCompareInputs(['jpl', 'JPL', 'idea'], getters());
    expect('companies' in r && r.companies.map((c) => c.symbol)).toEqual(['JPL', 'IDEA']);
  });

  it('falls back to the ratios when there is no screener row, and leaves the rest null', async () => {
    const r = await gatherCompareInputs(['a', 'b'], getters({ page: vi.fn().mockRejectedValue(new Error('down')) }));
    if (!('companies' in r)) throw new Error('unexpected');
    expect(r.companies[0].marketCap).toBe(500);
    expect(r.companies[0].debtToEquity).toBeNull();
    expect(r.companies[0].profitCagr3y).toBeNull();
  });

  it('does not take another symbol’s row from a contains-match', async () => {
    const r = await gatherCompareInputs(['idea', 'x'], getters({ page: async () => ({ rows: [row('IDEAFORGE')], total: 1 }) }));
    if (!('companies' in r)) throw new Error('unexpected');
    expect(r.companies[0].roce).toBeNull();
  });
});
