import { describe, expect, it } from 'vitest';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import {
  annualisedVolatility,
  attribution,
  factorOf,
  healthScore,
  holdingsToSearch,
  riskRegister,
  scenarioRange,
  severityOf,
  toPositions,
  weightedAverage,
  weightedPe,
  type HoldingFacts,
} from './analysis';

const row = (over: Partial<ScreenerResultRow>): ScreenerResultRow => ({
  symbol: 'X', name: 'X', sector: null, industry: null, market_cap: 50_000, current_price: 1, pe: 20, book_value: 1, pb: 2, dividend_yield: 0,
  roce: 15, roe: 12, face_value: 1, debt_to_equity: 0.5, sales_growth_3y_cagr: 10, profit_growth_3y_cagr: 10, fetch_status: 'ok', source_tier: 't', fetched_at: '', ...over,
});

const h = (symbol: string, qty: number, avg: number, ltp: number | null, over: Partial<HoldingFacts> = {}): HoldingFacts => ({
  symbol, name: symbol, sector: 'Financial Services', quantity: qty, avgPrice: avg, ltp, fundamentals: row({ symbol }), volatilityPct: 30, ...over,
});

describe('severityOf', () => {
  it('tags losses by depth and nothing else', () => {
    expect(severityOf(-64.3)).toBe('CRITICAL');
    expect(severityOf(-30)).toBe('CRITICAL');
    expect(severityOf(-29.9)).toBe('MODERATE');
    expect(severityOf(-15)).toBe('MODERATE');
    expect(severityOf(-14.9)).toBe('NORMAL');
    expect(severityOf(0)).toBeNull();
    expect(severityOf(12)).toBeNull();
    expect(severityOf(null)).toBeNull();
  });
});

describe('toPositions', () => {
  it('weights by value, counting an unpriced holding at cost', () => {
    const p = toPositions([h('A', 10, 100, 150), h('B', 10, 100, null)]);
    expect(p[0].pl).toBe(500);
    expect(p[0].plPct).toBeCloseTo(50);
    expect(p[1].pl).toBeNull();
    expect(p[0].weightPct).toBeCloseTo(60);
    expect(p[1].weightPct).toBeCloseTo(40);
  });
});

describe('attribution', () => {
  it('finds the gain concentration in the top two winners', () => {
    const a = attribution(toPositions([h('A', 10, 100, 200), h('B', 10, 100, 150), h('C', 10, 100, 110), h('D', 10, 100, 60)]));
    expect(a.netPl).toBe(1000 + 500 + 100 - 400);
    expect(a.winners.map((p) => p.symbol)).toEqual(['A', 'B', 'C']);
    expect(a.losers.map((p) => p.symbol)).toEqual(['D']);
    expect(a.gainConcentrationPct).toBeCloseTo((1500 / 1200) * 100);
  });

  it('has no concentration figure when the book is not in profit', () => {
    expect(attribution(toPositions([h('A', 10, 100, 90)])).gainConcentrationPct).toBeNull();
  });
});

describe('weighted figures', () => {
  it('averages a ratio by weight and says nothing when too little of the book has it', () => {
    const p = toPositions([h('A', 10, 100, 100, { fundamentals: row({ roce: 10 }) }), h('B', 30, 100, 100, { fundamentals: row({ roce: 20 }) })]);
    expect(weightedAverage(p, (x) => x.fundamentals?.roce ?? null).value).toBeCloseTo(17.5);
    const sparse = toPositions([h('A', 10, 100, 100, { fundamentals: row({ roce: 10 }) }), h('B', 30, 100, 100, { fundamentals: null })]);
    expect(weightedAverage(sparse, (x) => x.fundamentals?.roce ?? null).value).toBeNull();
  });

  it('computes the portfolio P/E as value over earnings and skips loss-makers', () => {
    const p = toPositions([h('A', 10, 100, 100, { fundamentals: row({ pe: 10 }) }), h('B', 10, 100, 100, { fundamentals: row({ pe: 30 }) }), h('C', 1, 100, 100, { fundamentals: row({ pe: -5 }) })]);
    const pe = weightedPe(p);
    // Weights 47.6/47.6/4.8: the loss-maker is left out, and 95.2 / (47.6/10 + 47.6/30) = 15.
    expect(pe.value).toBeCloseTo(15, 0);
    expect(pe.coveragePct).toBeCloseTo(95.2, 0);
  });
});

describe('factorOf', () => {
  it('reads the economic driver from the industry, then the sector', () => {
    const pos = (sector: string | null, industry: string | null) => toPositions([h('A', 1, 1, 1, { sector, fundamentals: row({ industry }) })])[0];
    expect(factorOf(pos('Financial Services', 'Banks - Regional'))).toBe('Rate and credit cycle');
    expect(factorOf(pos('Healthcare', 'Drug Manufacturers'))).toBe('Global and export demand');
    expect(factorOf(pos('Utilities', 'Gas Utilities'))).toBe('Regulated utilities and infrastructure');
    expect(factorOf(pos(null, null))).toBe('Other or unclassified');
  });
});

describe('riskRegister and healthScore', () => {
  const book = toPositions([h('A', 10, 100, 40), h('B', 10, 100, 45), h('C', 10, 100, 300)]);

  it('ranks the worst weaknesses first', () => {
    const items = riskRegister(book);
    expect(items[0].severity).toBe('CRITICAL');
    expect(items.map((i) => i.heading).join('|')).toMatch(/Single-sector overhang/);
    expect(items.some((i) => /Deep unrealised losses in 2 holdings/.test(i.heading))).toBe(true);
  });

  it('scores 100 less the points for each weakness, and shows them', () => {
    const s = healthScore(book);
    expect(s.score).toBe(100 - s.deductions.reduce((a, d) => a + d.points, 0));
    expect(s.label).toBe('Stressed');
    const calm = healthScore(toPositions(['A', 'B', 'C', 'D', 'E'].map((sym, i) => h(sym, 10, 100, 110, { sector: `S${i}` }))));
    expect(calm.score).toBeGreaterThanOrEqual(75);
  });
});

describe('scenarioRange', () => {
  it('draws the range from the holdings volatility, with the base case unchanged', () => {
    const range = scenarioRange(toPositions([h('A', 10, 100, 100, { volatilityPct: 20 }), h('B', 10, 100, 100, { volatilityPct: 40 })]));
    expect(range?.volatilityPct).toBeCloseTo(30);
    expect(range?.scenarios.map((s) => s.name)).toEqual(['Bear', 'Base', 'Bull']);
    expect(range?.scenarios[0].value).toBeCloseTo(2000 * 0.7);
    expect(range?.scenarios[1].value).toBe(2000);
    expect(range?.scenarios[2].value).toBeCloseTo(2000 * 1.3);
    expect(range?.byHolding[0].symbol).toBe('B');
  });

  it('gives no range when too little of the book has a price history', () => {
    expect(scenarioRange(toPositions([h('A', 10, 100, 100, { volatilityPct: null })]))).toBeNull();
  });
});

describe('annualisedVolatility', () => {
  it('is zero for a flat series and null for a short one', () => {
    expect(annualisedVolatility(Array(100).fill(50))).toBe(0);
    expect(annualisedVolatility([1, 2, 3])).toBeNull();
  });

  it('annualises daily moves', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 * (i % 2 === 0 ? 1 : 1.01));
    expect(annualisedVolatility(closes)).toBeGreaterThan(10);
  });
});

describe('holdingsToSearch', () => {
  it('picks the deep losers and the large positions, worst first', () => {
    const p = toPositions([h('A', 10, 100, 50), h('B', 100, 100, 120), h('C', 1, 100, 99), h('D', 1, 100, 99), h('E', 1, 100, 99), h('F', 1, 100, 99), h('G', 1, 100, 99), h('H', 1, 100, 99), h('I', 1, 100, 99), h('J', 1, 100, 99)]);
    expect(holdingsToSearch(p).map((x) => x.symbol)).toEqual(['A', 'B']);
  });
});
