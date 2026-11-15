import { describe, expect, it } from 'vitest';
import { HOLDINGS } from './fixtures';
import { auditPortfolio } from './audit';

const LIMITS = { maxStockPct: 25, maxSectorPct: 50 };

describe('auditPortfolio', () => {
  const audit = auditPortfolio(HOLDINGS, LIMITS);

  it('measures each stock and sector against its limit', () => {
    expect(audit.totalValue).toBeCloseTo(1000, 1);
    expect(audit.stocks[0]).toMatchObject({ name: 'AAA', status: 'over', limitPct: 25 });
    expect(audit.stocks[0].pct).toBeCloseTo(40, 1);
    expect(audit.sectors[0]).toMatchObject({ name: 'Financials', status: 'over', limitPct: 50 });
    expect(audit.sectors[0].pct).toBeCloseTo(60, 1);
  });

  it('marks rows within 80% of the limit as near and the rest ok', () => {
    const near = auditPortfolio(HOLDINGS, { maxStockPct: 35, maxSectorPct: 90 });
    expect(near.stocks.find((s) => s.name === 'AAA')?.status).toBe('over');
    expect(near.stocks.find((s) => s.name === 'CCC')?.status).toBe('near');
    expect(near.stocks.find((s) => s.name === 'DDD')?.status).toBe('ok');
  });

  it('reports top-3 concentration and plain, neutral alerts', () => {
    expect(audit.top3Pct).toBeCloseTo(90, 0);
    expect(audit.alerts.join(' ')).toContain('AAA is 40.0% of the portfolio against your 25% single-stock limit');
    expect(audit.alerts.join(' ')).toContain('Financials is 60.0% of the portfolio against your 50% sector limit');
  });

  it('gives no limit status to unclassified holdings', () => {
    const a = auditPortfolio([{ ...HOLDINGS[0], sector: null }], LIMITS);
    expect(a.sectors[0]).toMatchObject({ name: 'Other', status: 'ok' });
  });

  it('is empty without priced holdings', () => {
    const a = auditPortfolio([{ ...HOLDINGS[0], ltp: null }], LIMITS);
    expect(a.totalValue).toBe(0);
    expect(a.stocks).toEqual([]);
    expect(a.alerts).toEqual([]);
    expect(a.unpricedCount).toBe(1);
  });
});
