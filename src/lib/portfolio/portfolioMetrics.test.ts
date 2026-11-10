import { describe, expect, it } from 'vitest';
import {
  buildRiskCards,
  concentration,
  filterHoldings,
  filterCounts,
  newsForHoldings,
  portfolioTotals,
  sectorWeights,
  donutSegments,
  type HoldingLike,
} from './portfolioMetrics';

const h = (symbol: string, quantity: number, avgPrice: number, ltp: number | null, sector: string | null, dayChange: number | null = 0): HoldingLike => ({
  symbol,
  name: symbol,
  quantity,
  avgPrice,
  ltp,
  sector,
  dayChange,
});

const sample: HoldingLike[] = [
  h('AAA', 10, 100, 400, 'Financial Services', 5), // value 4000, +300%
  h('BBB', 10, 100, 200, 'Financial Services', 1), // value 2000, +100%
  h('CCC', 10, 100, 50, 'Healthcare', -2), // value 500, -50%
  h('DDD', 10, 100, 100, 'Healthcare', 0), // value 1000, flat
  h('EEE', 10, 100, null, null), // unpriced
];

describe('portfolioTotals', () => {
  it('sums priced value, full cost, and today change', () => {
    const t = portfolioTotals(sample);
    expect(t.totalValue).toBe(7500);
    expect(t.invested).toBe(5000);
    expect(t.todayChange).toBe(5 * 10 + 1 * 10 - 2 * 10);
  });

  it('is all zero for no holdings', () => {
    expect(portfolioTotals([])).toEqual({ totalValue: 0, invested: 0, todayChange: 0 });
  });
});

describe('sectorWeights', () => {
  it('weights by value, largest first, summing to 100', () => {
    const w = sectorWeights(sample);
    expect(w.map((s) => s.name)).toEqual(['Financial Services', 'Healthcare']);
    expect(w[0].pct).toBeCloseTo(80, 5);
    expect(w.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 5);
  });

  it('labels a missing sector as Other and folds the tail into one slice', () => {
    const many = Array.from({ length: 9 }, (_, i) => h(`S${i}`, 1, 1, 10 + i, `Sector ${i}`));
    const w = sectorWeights(many, 6);
    expect(w).toHaveLength(7);
    expect(w[w.length - 1].name).toBe('Other');
  });

  it('returns nothing when no holding is priced', () => {
    expect(sectorWeights([h('X', 1, 1, null, 'Tech')])).toEqual([]);
  });
});

describe('donutSegments', () => {
  it('lays segments end to end around the circle', () => {
    const segs = donutSegments([
      { name: 'a', pct: 75, value: 75 },
      { name: 'b', pct: 25, value: 25 },
    ]);
    expect(segs[0].offset).toBeCloseTo(0);
    expect(segs[0].length).toBeCloseTo(75);
    expect(segs[1].offset).toBeCloseTo(75);
    expect(segs[1].length).toBeCloseTo(25);
  });
});

describe('concentration', () => {
  it('reports top-3 share and the largest position', () => {
    const c = concentration(sample);
    expect(c.top3Pct).toBeCloseTo(((4000 + 2000 + 1000) / 7500) * 100, 5);
    expect(c.largest).toEqual({ symbol: 'AAA', pct: expect.closeTo((4000 / 7500) * 100, 5) });
  });

  it('has no largest position for an empty portfolio', () => {
    expect(concentration([])).toEqual({ top3Pct: 0, largest: null });
  });
});

describe('filterHoldings / filterCounts', () => {
  it('splits profit and loss and keeps flat and unpriced only under All', () => {
    expect(filterHoldings(sample, 'profit').map((x) => x.symbol)).toEqual(['AAA', 'BBB']);
    expect(filterHoldings(sample, 'loss').map((x) => x.symbol)).toEqual(['CCC']);
    expect(filterHoldings(sample, 'all')).toHaveLength(5);
    expect(filterCounts(sample)).toEqual({ all: 5, profit: 2, loss: 1 });
  });

  it('does not mutate its input', () => {
    const copy = [...sample];
    filterHoldings(sample, 'loss');
    expect(sample).toEqual(copy);
  });
});

describe('buildRiskCards', () => {
  it('flags high concentration, sector skew and return drivers from the numbers', () => {
    const cards = buildRiskCards(sample);
    expect(cards.map((c) => c.id)).toEqual(['concentration', 'sector', 'drivers']);
    expect(cards[0].severity).toBe('high');
    expect(cards[0].text).toContain('93.3%');
    expect(cards[1].text).toContain('80.0%');
    expect(cards[1].text).toContain('Financial Services');
    expect(cards[2].text).toContain('AAA (+300.0%)');
    expect(cards[2].text).toContain('CCC (-50.0%)');
  });

  it('rates a spread portfolio as low concentration', () => {
    const spread = Array.from({ length: 12 }, (_, i) => h(`S${i}`, 1, 100, 100, `Sec ${i % 6}`));
    const cards = buildRiskCards(spread);
    expect(cards[0].severity).toBe('low');
    expect(cards[2].text).toMatch(/no standout/i);
  });

  it('says so when there is nothing to analyse', () => {
    expect(buildRiskCards([])).toEqual([]);
  });

  it('does not claim drawdowns when nothing is in loss', () => {
    const cards = buildRiskCards([h('A', 1, 100, 150, 'Tech'), h('B', 1, 100, 120, 'Tech')]);
    expect(cards[2].text).not.toMatch(/drawdown/i);
  });
});

describe('newsForHoldings', () => {
  const items = [
    { id: '1', symbols: ['AAA'] },
    { id: '2', symbols: ['TCS'] },
    { id: '3', symbols: [] },
    { id: '4', symbols: ['tcs', 'bbb'] },
  ];

  it('keeps only stories that tag a held symbol, case-insensitively', () => {
    expect(newsForHoldings(items, sample).map((n) => n.id)).toEqual(['1', '4']);
  });

  it('returns nothing without holdings', () => {
    expect(newsForHoldings(items, [])).toEqual([]);
  });
});
