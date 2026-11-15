import { describe, expect, it } from 'vitest';
import { HOLDINGS } from './fixtures';
import { trackerRows, type AnalystView } from './tracker';

const crit = (breached: boolean, enabled = true) => ({ id: 'roce', metric: 'roce', op: 'below', threshold: 10, baseline: 20, why: '', source: 'default', enabled, breached }) as const;
const LIMITS = { maxStockPct: 35, maxSectorPct: 90 };

describe('trackerRows', () => {
  const analysts: AnalystView[] = [
    { symbol: 'AAA', status: 'active', hasDossier: true, criteria: [crit(false)] },
    { symbol: 'BBB', status: 'active', hasDossier: true, criteria: [crit(true)] },
    { symbol: 'CCC', status: 'initializing', hasDossier: false, criteria: null },
  ];
  const rows = trackerRows(HOLDINGS, analysts, LIMITS);

  it('builds one row per holding from average price and LTP', () => {
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ symbol: 'AAA', avgPrice: 50, ltp: 100, returnPct: 100 });
  });

  it('reflects the rules: criteria review, drawdown, over the stock limit, else within limits', () => {
    expect(rows.map((r) => r.status)).toEqual(['overweight', 'review', 'within', 'drawdown']);
    expect(rows[0].weightPct).toBeCloseTo(40, 1);
  });

  it('puts a thesis-criteria breach ahead of a drawdown', () => {
    const r = trackerRows([HOLDINGS[3]], [{ symbol: 'DDD', status: 'active', hasDossier: true, criteria: [crit(true)] }], LIMITS);
    expect(r[0].status).toBe('review');
  });

  it('ignores switched-off criteria', () => {
    const r = trackerRows([HOLDINGS[1]], [{ symbol: 'BBB', status: 'active', hasDossier: true, criteria: [crit(true, false)] }], { maxStockPct: 100, maxSectorPct: 100 });
    expect(r[0].status).toBe('within');
  });

  it('describes the analyst separately', () => {
    expect(rows.map((r) => r.analyst)).toEqual(['ready', 'ready', 'preparing', 'none']);
  });

  it('has a null return and no flags for unpriced holdings', () => {
    const r = trackerRows([{ ...HOLDINGS[0], ltp: null }], [], LIMITS)[0];
    expect(r.returnPct).toBeNull();
    expect(r.status).toBe('within');
  });
});
