import { describe, expect, it, vi } from 'vitest';
import type { ScreenerFilters, ScreenerPage } from '@/lib/dashboard/screenerSchema';
import { themeSuggestions } from './themeSuggestions';

const facets = {
  sectors: ['Capital Goods'],
  industries: ['Aerospace & Defense', 'Pharmaceuticals'],
  sector_counts: { 'Capital Goods': 300 },
  industry_counts: { 'Aerospace & Defense': 27, Pharmaceuticals: 128 },
};
const row = (symbol: string, cap: number) => ({ symbol, market_cap: cap });
const page = vi.fn(async (f: ScreenerFilters): Promise<ScreenerPage> => ({ rows: (f.industry === 'Aerospace & Defense' ? [row('BEL', 5), row('HAL', 9), row('BDL', 2)] : [row('SUNPHARMA', 7)]) as never, total: 3 }));
const deps = { facets: async () => facets, page };

describe('themeSuggestions', () => {
  it('gives the count and the largest tickers of a matching theme', async () => {
    const [first] = await themeSuggestions('defence', deps);
    expect(first).toEqual({ kind: 'theme', label: 'Defence & Aerospace', count: 27, topTickers: ['HAL', 'BEL', 'BDL'] });
  });
  it('asks the data service for the theme’s industry, not the whole market', async () => {
    page.mockClear();
    await themeSuggestions('defence', deps, 1);
    expect(page).toHaveBeenCalledWith({ industry: 'Aerospace & Defense', limit: 4, offset: 0 });
  });
  it('asks by sector for a sector option', async () => {
    page.mockClear();
    const [first] = await themeSuggestions('capital goods', deps, 1);
    expect(first.label).toBe('Capital Goods');
    expect(page).toHaveBeenCalledWith({ sector: 'Capital Goods', limit: 4, offset: 0 });
  });
  it('returns nothing for text that matches nothing', async () => {
    expect(await themeSuggestions('zzzzqq', deps)).toEqual([]);
  });
});
