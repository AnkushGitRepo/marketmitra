import { describe, expect, it } from 'vitest';
import type { PricePointOut } from '@/lib/dashboard/fundamentalsApi';
import type { YearFigures } from './statements';
import { ownMedianPe, peAtYearEnds, quantile, scenariosFromHistory } from './valuation';
import { valuationBlocks } from './valuationBlocks';

const year = (n: number, over: Partial<YearFigures> = {}): YearFigures => ({
  periodEnd: `20${n}-03-31`,
  label: `FY${n}`,
  sales: 1000,
  operatingProfit: 300,
  netProfit: 100,
  interest: null,
  eps: 10,
  borrowings: null,
  equity: null,
  totalAssets: null,
  cfo: null,
  fcf: null,
  cfoToEbitda: null,
  ...over,
});
const px = (trade_date: string, close: string): PricePointOut => ({ trade_date, open: null, high: null, low: null, close, volume: null, source_tier: 't' });

describe('peAtYearEnds', () => {
  const prices = [px('2024-03-28', '200'), px('2024-03-15', '150'), px('2025-03-31', '300'), px('2022-01-04', '90')];
  it('uses the last close on or before the year end, within a week', () => {
    const [a, b, c] = peAtYearEnds([year(24), year(25), year(22)], prices);
    expect(a).toMatchObject({ price: 200, pe: 20 });
    expect(b).toMatchObject({ price: 300, pe: 30 });
    expect(c.price).toBeNull();
  });
  it('gives no P/E for no EPS, a loss or an implausible ratio', () => {
    const out = peAtYearEnds([year(24, { eps: null }), year(24, { eps: -2 }), year(24, { eps: 0.1 })], prices);
    expect(out.map((o) => o.pe)).toEqual([null, null, null]);
  });
  it('copes with no price history', () => {
    expect(peAtYearEnds([year(24)], null)[0].pe).toBeNull();
  });
});

describe('quantile', () => {
  it('interpolates between neighbours', () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(quantile([7], 0.9)).toBe(7);
  });
});

describe('ownMedianPe', () => {
  const h = (pe: number | null) => ({ periodEnd: '', label: '', price: null, eps: null, pe });
  it('needs three years and reports how many it used', () => {
    expect(ownMedianPe([h(10), h(20), h(30), h(null)])).toEqual({ value: 20, years: 3 });
    expect(ownMedianPe([h(10), h(20)])).toBeNull();
  });
});

describe('scenariosFromHistory', () => {
  const years = [year(22, { sales: 1000, operatingProfit: 200 }), year(23, { sales: 1100, operatingProfit: 242 }), year(24, { sales: 1100, operatingProfit: 330 }), year(25, { sales: 1320, operatingProfit: 396 })];
  it('applies the quartiles of growth and margin to the latest year', () => {
    const set = scenariosFromHistory(years)!;
    expect(set.from).toBe('FY25');
    const [bear, base, bull] = set.scenarios;
    // growth 10, 0, 20 -> quartiles 5, 10, 15; margins 20, 22, 30, 30 -> 21.5, 26, 30
    expect(bear).toMatchObject({ name: 'Bear', salesGrowth: 5, margin: 21.5 });
    expect(base).toMatchObject({ name: 'Base', salesGrowth: 10, margin: 26 });
    expect(bull).toMatchObject({ name: 'Bull', salesGrowth: 15, margin: 30 });
    expect(bear.sales).toBeCloseTo(1320 * 1.05);
    expect(bull.operatingProfit).toBeCloseTo(1320 * 1.15 * 0.3);
  });
  it('damps one outlier year instead of taking it as the bull case', () => {
    const outlier = [year(21, { sales: 100 }), year(22, { sales: 150 }), year(23, { sales: 156 }), year(24, { sales: 162 }), year(25, { sales: 168 })];
    const [, base, bull] = scenariosFromHistory(outlier)!.scenarios;
    expect(base.salesGrowth).toBeCloseTo(3.9, 1); // the typical year, not the 50% one
    expect(bull.salesGrowth).toBeLessThan(20); // well under the 50% outlier
  });
  it('needs two growth rates and two margins', () => {
    expect(scenariosFromHistory([year(24), year(25)])).toBeNull();
    expect(scenariosFromHistory([])).toBeNull();
  });
  it('does not span a gap year as growth', () => {
    const gap = year(23, { sales: null, operatingProfit: null });
    expect(scenariosFromHistory([year(22), gap, year(24)])).toBeNull();
  });
});

describe('valuationBlocks', () => {
  const years = [22, 23, 24, 25].map((n, i) => year(n, { sales: 1000 + i * 100, eps: 10 + i, operatingProfit: 300 + i * 10 }));
  const prices = [px('2022-03-31', '200'), px('2023-03-31', '260'), px('2024-03-28', '300'), px('2025-03-31', '420')];
  it('builds cards, the P/E history with a Now bar, and the scenario table', () => {
    const blocks = valuationBlocks({ years, prices, ratios: { 'Stock P/E': 36, 'Current Price': 400, 'Book Value': 100 }, peerMedianPe: 28 });
    expect(blocks.map((b) => b.type)).toEqual(['kpi_grid', 'bar_chart', 'data_table']);
    const kpi = blocks[0];
    if (kpi.type !== 'kpi_grid') throw new Error();
    expect(kpi.items.map((i) => i.label)).toEqual(['P/E now', 'Own median P/E', 'Against its own median', 'Peer median P/E', 'Price to book']);
    expect(kpi.items[0].value).toBe('36.0x');
    expect(kpi.items[4].value).toBe('4.0x');
    const chart = blocks[1];
    if (chart.type !== 'bar_chart') throw new Error();
    expect(chart.categories.at(-1)).toBe('Now');
  });
  it('returns only what it has data for', () => {
    expect(valuationBlocks({ years: [], prices: null, ratios: {}, peerMedianPe: null })).toEqual([]);
    const only = valuationBlocks({ years: [], prices: null, ratios: { 'Stock P/E': 20 }, peerMedianPe: null });
    expect(only.map((b) => b.type)).toEqual(['kpi_grid']);
  });
});
