import { describe, expect, it, vi } from 'vitest';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import { fundamentals } from './fixtures';
import { MAX_HOLDINGS, gatherPortfolioInputs, type PortfolioGetters } from './gather';

const holding = (symbol: string, qty = 10, avg = 100): EnrichedHolding => ({ symbol, name: symbol, sector: 'Utilities', quantity: qty, avgPrice: avg, ltp: avg, dayChange: null, dayChangePct: null }) as EnrichedHolding;
const rising = Array.from({ length: 100 }, (_, i) => 100 + (i % 7));

const getters = (over: Partial<PortfolioGetters> = {}): PortfolioGetters => ({
  holdings: async () => [holding('IGL'), holding('PNB')],
  page: async (f) => ({ rows: [fundamentals(String(f.q).toUpperCase())], total: 1 }),
  closes: async () => rising,
  ...over,
});

describe('gatherPortfolioInputs', () => {
  it('is null for an empty portfolio', async () => {
    expect(await gatherPortfolioInputs(getters({ holdings: async () => [] }))).toBeNull();
  });

  it('attaches each holding’s row and volatility', async () => {
    const inputs = await gatherPortfolioInputs(getters());
    expect(inputs?.positions.map((p) => p.symbol).sort()).toEqual(['IGL', 'PNB']);
    expect(inputs?.positions[0].fundamentals?.symbol).toBeTruthy();
    expect(inputs?.positions[0].volatilityPct).toBeGreaterThan(0);
  });

  it('keeps a holding whose lookups fail, with those figures null', async () => {
    const inputs = await gatherPortfolioInputs(getters({ page: vi.fn().mockRejectedValue(new Error('down')), closes: vi.fn().mockRejectedValue(new Error('down')) }));
    expect(inputs?.positions).toHaveLength(2);
    expect(inputs?.positions.every((p) => p.fundamentals === null && p.volatilityPct === null)).toBe(true);
  });

  it('does not take a different symbol’s row for a contains-match', async () => {
    const inputs = await gatherPortfolioInputs(getters({ holdings: async () => [holding('PNB')], page: async () => ({ rows: [fundamentals('PNBHOUSING')], total: 1 }) }));
    expect(inputs?.positions[0].fundamentals).toBeNull();
  });

  it('covers the biggest holdings by cost and says how many it left out', async () => {
    const many = Array.from({ length: MAX_HOLDINGS + 3 }, (_, i) => holding(`S${i}`, 1, 100 + i));
    const inputs = await gatherPortfolioInputs(getters({ holdings: async () => many }));
    expect(inputs?.positions).toHaveLength(MAX_HOLDINGS);
    expect(inputs?.omitted).toBe(3);
  });
});
