import { describe, expect, it } from 'vitest';
import { cagr, categoryWinners, negativeNetWorth, project, trajectory, valuationVsGrowth, type CompareCompany } from './analysis';

const annual = (sales: number[], start = 2022) => sales.map((s, i) => ({ periodEnd: `${start + i}-03-31`, sales: s, operatingProfit: s / 4 }));
const co = (symbol: string, over: Partial<CompareCompany> = {}): CompareCompany => ({
  symbol, name: `${symbol} Ltd`, sector: null, industry: null, marketCap: 1000, pe: 20, pb: 3, roce: 12, roe: 10, debtToEquity: 0.5, dividendYield: 1, salesCagr3y: 10, profitCagr3y: 12, annual: annual([100, 110, 121, 133, 146]), ...over,
});

describe('categoryWinners', () => {
  const books = [co('JPL', { marketCap: 1_250_000, roce: 12.1, debtToEquity: 0.2, profitCagr3y: 21.7 }), co('BHARTI', { marketCap: 1_310_000, roce: 17.6, debtToEquity: 1.8, profitCagr3y: 15 }), co('IDEA', { marketCap: 122_000, roce: -1.7, debtToEquity: -4.6, pb: -2, profitCagr3y: null, salesCagr3y: 5 })];
  it('names the leader of each category from the data', () => {
    const w = Object.fromEntries(categoryWinners(books).map((x) => [x.category, x.symbol]));
    expect(w).toEqual({ Scale: 'BHARTI', 'Profitability and ROCE': 'BHARTI', 'Balance-sheet safety': 'JPL', 'Growth momentum': 'JPL' });
  });
  it('does not call a negative net worth safe, however small its debt ratio looks', () => {
    const w = categoryWinners([co('IDEA', { debtToEquity: -4.6, pb: -2 }), co('X', { debtToEquity: 3 })]);
    expect(w.find((x) => x.category === 'Balance-sheet safety')?.symbol).toBe('X');
    expect(negativeNetWorth([co('IDEA', { pb: -2 }), co('X')]).map((c) => c.symbol)).toEqual(['IDEA']);
  });
  it('says so when no company has a figure', () => {
    const w = categoryWinners([co('A', { roce: null }), co('B', { roce: null })]);
    expect(w[1].symbol).toBeNull();
    expect(w[1].detail).toMatch(/No ROCE/);
  });
});

describe('cagr and project', () => {
  it('works out compound growth and refuses a non-positive start or end', () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1);
    expect(cagr(-5, 10, 2)).toBeNull();
    expect(cagr(100, 0, 2)).toBeNull();
  });
  it('carries the company’s own growth forward, fading each year, within a cap', () => {
    const next = project([100, 110, 121, 133.1, 146.41]);
    expect(next).toHaveLength(3);
    expect(next[0]).toBeCloseTo(146.41 * 1.08, 1); // 10% a year, faded to 8%
    expect(next[1]).toBeGreaterThan(next[0]);
    expect(project([100, 300, 900, 2700, 8100])[0]).toBeCloseTo(8100 * 1.24, 0); // capped at 30%, then faded
  });
  it('does not project from too little history or from a loss', () => {
    expect(project([100, 110])).toEqual([]);
    const shrinking = project([100, 90, 70, 50, 30]);
    expect(shrinking).toHaveLength(3);
    expect(shrinking[0]).toBeLessThan(30); // a falling company keeps falling, at a fading pace
    expect(project([-10, -5, -2])).toEqual([]);
  });
});

describe('trajectory', () => {
  const t = trajectory([co('A'), co('B', { annual: annual([50, 60, 70, 80, 90]) })])!;
  it('puts every company on one fiscal-year axis, actuals then projected years marked E', () => {
    expect(t.labels).toEqual(['FY22', 'FY23', 'FY24', 'FY25', 'FY26', 'FY27E', 'FY28E', 'FY29E']);
    expect(t.projectedFrom).toBe(5);
    expect(t.series.sales.map((s) => s.name)).toEqual(['A', 'B']);
    expect(t.series.sales[0].values.slice(0, 5)).toEqual([100, 110, 121, 133, 146]);
    expect(t.series.sales[0].values[5]).toBeGreaterThan(146);
  });
  it('indexes sales to 100 at the first year every company has', () => {
    expect(t.indexBase).toBe('FY22');
    expect(t.series.indexed[1].values[0]).toBe(100);
    expect(t.series.indexed[1].values[4]).toBe(180);
  });
  it('uses a shared base year even when one company’s history starts earlier', () => {
    const early = trajectory([co('A', { annual: annual([80, 100, 110, 120, 130, 140], 2021) }), co('B', { annual: annual([50, 60, 70, 80, 90]) })])!;
    expect(early.labels[0]).toBe('FY21');
    expect(early.indexBase).toBe('FY22');
    expect(early.series.indexed[0].values.slice(0, 2)).toEqual([80, 100]); // before the base, relative to it
    expect(early.series.indexed[1].values[0]).toBeNull();
    expect(early.series.indexed[1].values[1]).toBe(100);
  });
  it('leaves a gap where a company has no figure and stops where it cannot project', () => {
    const g = trajectory([co('A'), co('Z', { annual: annual([10, 5], 2025) })])!;
    expect(g.series.sales[1].values.slice(0, 3)).toEqual([null, null, null]);
    expect(g.series.sales[1].values).toHaveLength(g.labels.length);
    expect(g.series.sales[1].values.slice(5)).toEqual([null, null, null]);
  });
  it('is null with fewer than two fiscal years in the data', () => {
    expect(trajectory([co('A', { annual: annual([100]) })])).toBeNull();
  });
  it('has no projection marker when no company can be projected', () => {
    expect(trajectory([co('A', { annual: annual([100, 90]) }), co('B', { annual: annual([5, 6]) })])?.projectedFrom).toBeNull();
  });
});

describe('valuationVsGrowth', () => {
  it('divides P/E by profit growth only when both are positive', () => {
    const [a, b] = valuationVsGrowth([co('A', { pe: 30, profitCagr3y: 15 }), co('B', { pe: -5, profitCagr3y: 15 })]);
    expect(a.peToGrowth).toBe(2);
    expect(b.peToGrowth).toBeNull();
  });
});
