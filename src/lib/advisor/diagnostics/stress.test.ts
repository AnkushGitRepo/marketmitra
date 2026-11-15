import { describe, expect, it } from 'vitest';
import { HOLDINGS } from './fixtures';
import { stressTest } from './stress';

describe('stressTest', () => {
  it('applies a market-wide fall to every priced holding', () => {
    const r = stressTest(HOLDINGS, { kind: 'market', fallPct: 15 }, 20);
    expect(r.totalValue).toBeCloseTo(1000, 1);
    expect(r.lossINR).toBeCloseTo(150, 1);
    expect(r.lossPct).toBeCloseTo(15, 1);
    expect(r.withinTolerance).toBe(true);
  });

  it('applies a sector fall to that sector only', () => {
    const r = stressTest(HOLDINGS, { kind: 'sector', sector: 'Financials', fallPct: 20 }, 10);
    expect(r.lossINR).toBeCloseTo(120, 1);
    expect(r.lossPct).toBeCloseTo(12, 1);
    expect(r.withinTolerance).toBe(false);
  });

  it('treats a loss equal to the tolerance as within it', () => {
    expect(stressTest(HOLDINGS, { kind: 'market', fallPct: 20 }, 20).withinTolerance).toBe(true);
  });

  it('is zero for an empty or unpriced portfolio and an unknown sector', () => {
    expect(stressTest([], { kind: 'market', fallPct: 15 }, 20)).toMatchObject({ totalValue: 0, lossINR: 0, lossPct: 0 });
    expect(stressTest(HOLDINGS, { kind: 'sector', sector: 'Nope', fallPct: 50 }, 20).lossINR).toBe(0);
  });
});
