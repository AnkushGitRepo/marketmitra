import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTFOLIO_RULES, evaluatePortfolioRules, type RuleHolding } from './portfolioRules';
import type { PortfolioRulesParams } from './types';

const h = (symbol: string, avg: number, price: number | null, over: Partial<RuleHolding> = {}): RuleHolding => ({ symbol, quantity: 1, avgPrice: avg, price, week52High: null, ...over });
const off: PortfolioRulesParams = { profitMilestonesPct: [], costDrawdownPct: [], maxPositionWeightPct: null, week52High: false };

describe('milestones', () => {
  const params = { ...off, profitMilestonesPct: [100, 200, 300] };
  it('announces only the highest level crossed but remembers the lower ones', () => {
    const r = evaluatePortfolioRules(params, [h('LAURUS', 500, 2500)], []);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].line).toContain('+300% milestone');
    expect(r.keptKeys).toEqual(['ms:LAURUS:100', 'ms:LAURUS:200', 'ms:LAURUS:300']);
  });
  it('stays quiet once announced and speaks again at the next level', () => {
    const sent = ['ms:LAURUS:100', 'ms:LAURUS:200'];
    expect(evaluatePortfolioRules(params, [h('LAURUS', 500, 1500)], sent).hits).toHaveLength(0);
    expect(evaluatePortfolioRules(params, [h('LAURUS', 500, 2000)], sent).hits[0].line).toContain('+300%');
  });
  it('re-arms after the gain falls back below a level', () => {
    const r = evaluatePortfolioRules(params, [h('A', 100, 150)], ['ms:A:100']);
    expect(r.keptKeys).toEqual([]);
    expect(evaluatePortfolioRules(params, [h('A', 100, 310)], r.keptKeys).hits[0].line).toContain('+200%');
  });
});

describe('drawdown below cost', () => {
  it('announces the deepest line crossed', () => {
    const r = evaluatePortfolioRules({ ...off, costDrawdownPct: [10, 25] }, [h('ACC', 100, 54)], []);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].line).toContain('-25% line');
    expect(r.hits[0].line).toContain('46.0% below');
  });
});

describe('weight cap', () => {
  it('flags a holding above the cap', () => {
    const r = evaluatePortfolioRules({ ...off, maxPositionWeightPct: 20 }, [h('BIG', 10, 80), h('S1', 10, 10), h('S2', 10, 10)], []);
    expect(r.hits.map((x) => x.symbol)).toEqual(['BIG']);
    expect(r.hits[0].line).toContain('80.0% of your portfolio value');
  });
  it('ignores unpriced holdings', () => {
    expect(evaluatePortfolioRules({ ...off, maxPositionWeightPct: 20 }, [h('X', 10, null)], []).hits).toEqual([]);
  });
});

describe('52-week high', () => {
  it('announces at the high and only once', () => {
    const rows = [h('A', 100, 120, { week52High: 120 })];
    const first = evaluatePortfolioRules({ ...off, week52High: true }, rows, []);
    expect(first.hits[0].line).toContain('52-week high');
    expect(evaluatePortfolioRules({ ...off, week52High: true }, rows, first.keptKeys).hits).toEqual([]);
  });
});

describe('wording', () => {
  it('never gives advice', () => {
    const r = evaluatePortfolioRules(DEFAULT_PORTFOLIO_RULES, [h('A', 100, 500, { week52High: 500 }), h('B', 100, 40)], []);
    expect(r.hits.length).toBeGreaterThan(0);
    for (const hit of r.hits) expect(hit.line).not.toMatch(/\b(buy|sell|book|exit|hold|should)\b/i);
  });
});
