import { describe, expect, it } from 'vitest';
import { buildRiskCards } from '@/lib/portfolio/portfolioMetrics';
import { DEMO_HOLDINGS } from './demoPortfolio';

describe('demo portfolio', () => {
  it('is a small, fully priced sample with unique symbols', () => {
    expect(DEMO_HOLDINGS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(DEMO_HOLDINGS.map((h) => h.symbol)).size).toBe(DEMO_HOLDINGS.length);
    for (const h of DEMO_HOLDINGS) {
      expect(h.ltp).not.toBeNull();
      expect(h.quantity).toBeGreaterThan(0);
    }
  });
  it('is enough for the real risk cards to say something', () => {
    const cards = buildRiskCards(DEMO_HOLDINGS);
    expect(cards.map((c) => c.id)).toEqual(['concentration', 'sector', 'drivers']);
  });
});
