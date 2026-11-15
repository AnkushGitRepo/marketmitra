import { describe, expect, it } from 'vitest';
import { HOLDINGS } from './fixtures';
import { auditPortfolio } from './audit';
import { reviewDrawdowns } from './drawdown';
import { stressTest } from './stress';
import { guardrailSummary } from './guardrails';

const run = (limits: { maxStockPct: number; maxSectorPct: number }, tolerance: number) =>
  guardrailSummary({
    audit: auditPortfolio(HOLDINGS, limits),
    drawdowns: reviewDrawdowns(HOLDINGS),
    stress: stressTest(HOLDINGS, { kind: 'market', fallPct: 15 }, tolerance),
  });

describe('guardrailSummary', () => {
  it('reports five guardrails and counts the healthy ones', () => {
    const s = run({ maxStockPct: 25, maxSectorPct: 50 }, 20);
    expect(s.pills.map((p) => p.id)).toEqual(['stock', 'sector', 'concentration', 'drawdown', 'stress']);
    expect(s.pills.find((p) => p.id === 'stock')?.status).toBe('over');
    expect(s.pills.find((p) => p.id === 'sector')?.status).toBe('over');
    expect(s.pills.find((p) => p.id === 'concentration')?.status).toBe('over');
    expect(s.pills.find((p) => p.id === 'drawdown')?.status).toBe('watch');
    expect(s.pills.find((p) => p.id === 'stress')?.status).toBe('ok');
    expect(s.healthy).toBe(1);
    expect(s.total).toBe(5);
  });

  it('has nothing over its limit when the limits are generous', () => {
    const s = run({ maxStockPct: 90, maxSectorPct: 90 }, 50);
    expect(s.pills.find((p) => p.id === 'stock')?.status).toBe('ok');
    expect(s.pills.find((p) => p.id === 'sector')?.status).toBe('ok');
    expect(s.healthy).toBe(s.pills.filter((p) => p.status === 'ok').length);
  });

  it('flags a stress loss beyond tolerance', () => {
    expect(run({ maxStockPct: 25, maxSectorPct: 50 }, 10).pills.find((p) => p.id === 'stress')?.status).toBe('over');
  });
});
