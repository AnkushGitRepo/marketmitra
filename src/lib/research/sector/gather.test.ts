import { describe, expect, it, vi } from 'vitest';
import type { ScreenerFilters, ScreenerPage } from '@/lib/dashboard/screenerSchema';
import { gatherSectorInputs } from './gather';

const facets = {
  sectors: ['Capital Goods'],
  industries: ['Aerospace & Defense', 'Pharmaceuticals'],
  sector_counts: { 'Capital Goods': 300 },
  industry_counts: { 'Aerospace & Defense': 27, Pharmaceuticals: 128 },
};
const row = (symbol: string, cap: number) => ({ symbol, market_cap: cap }) as never;
const page = vi.fn(async (f: ScreenerFilters): Promise<ScreenerPage> => ({ rows: f.industry === 'Aerospace & Defense' ? [row('BEL', 5), row('HAL', 9)] : [], total: 2 }));

describe('gatherSectorInputs', () => {
  it('resolves the text to industries and returns the largest companies first', async () => {
    const got = await gatherSectorInputs('defence', { facets: async () => facets, page });
    expect(got?.label).toBe('Defence & Aerospace');
    expect(got?.count).toBe(27);
    expect(got?.rows.map((r) => r.symbol)).toEqual(['HAL', 'BEL']);
  });
  it('lists a company once when two queries return it', async () => {
    const twice = vi.fn(async (): Promise<ScreenerPage> => ({ rows: [row('HAL', 9), row('HAL', 9)], total: 2 }));
    const got = await gatherSectorInputs('capital goods', { facets: async () => facets, page: twice });
    expect(got?.rows).toHaveLength(1);
  });
  it('is null for an unknown theme, and for a theme with no companies', async () => {
    expect(await gatherSectorInputs('zzzzqq', { facets: async () => facets, page })).toBeNull();
    expect(await gatherSectorInputs('pharma', { facets: async () => facets, page })).toBeNull();
  });
});
