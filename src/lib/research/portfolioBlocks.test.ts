import { describe, expect, it } from 'vitest';
import { portfolioBlocks, type HoldingInput } from './portfolioBlocks';

const h = (symbol: string, sector: string | null, quantity: number, avgPrice: number, ltp: number | null): HoldingInput => ({
  symbol,
  name: symbol,
  sector,
  quantity,
  avgPrice,
  ltp,
});

describe('portfolioBlocks', () => {
  it('is empty with no holdings', () => {
    expect(portfolioBlocks([])).toEqual([]);
  });

  it('summarises value, P&L and the top sector', () => {
    const blocks = portfolioBlocks([h('A', 'Banks', 10, 100, 120), h('B', 'Banks', 10, 100, 90), h('C', 'IT', 10, 100, 110)]);
    expect(blocks.map((b) => b.type)).toEqual(['kpi_grid', 'donut_chart', 'bar_chart', 'data_table']);
    const kpi = blocks[0];
    if (kpi.type !== 'kpi_grid') throw new Error();
    expect(kpi.items[2]).toMatchObject({ label: 'Net P&L', value: '₹200', tone: 'positive' });
    expect(kpi.items[3].value).toBe('Banks');
    const bars = blocks[2];
    if (bars.type !== 'bar_chart') throw new Error();
    expect(bars.categories).toEqual(['A', 'C', 'B']);
    expect(bars.series[0].values).toEqual([200, 100, -100]);
  });

  it('shows a loss with a minus sign and counts an unpriced holding at cost', () => {
    const blocks = portfolioBlocks([h('A', 'Banks', 10, 100, 80), h('B', null, 5, 200, null)]);
    const kpi = blocks[0];
    if (kpi.type !== 'kpi_grid') throw new Error();
    expect(kpi.items[2]).toMatchObject({ value: '−₹200', tone: 'negative' });
    expect(kpi.items[1].note).toBe('1 without a live price, at cost');
    const donut = blocks[1];
    if (donut.type !== 'donut_chart') throw new Error();
    expect(donut.slices).toEqual([
      { label: 'Unclassified', value: 1000 },
      { label: 'Banks', value: 800 },
    ]);
  });

  it('drops the P&L chart when no holding has a live price', () => {
    expect(portfolioBlocks([h('A', 'IT', 1, 10, null)]).map((b) => b.type)).toEqual(['kpi_grid', 'donut_chart', 'data_table']);
  });

  it('folds a long tail of sectors into Other', () => {
    const many = Array.from({ length: 11 }, (_, i) => h(`S${i}`, `Sector ${i}`, 1, 100 - i, 100 - i));
    const donut = portfolioBlocks(many)[1];
    if (donut.type !== 'donut_chart') throw new Error();
    expect(donut.slices).toHaveLength(8);
    expect(donut.slices.at(-1)?.label).toBe('Other');
  });
});
