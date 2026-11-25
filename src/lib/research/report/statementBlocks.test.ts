import { describe, expect, it } from 'vitest';
import { statementBlocks } from './statementBlocks';
import type { YearFigures } from './statements';

const year = (label: string, over: Partial<YearFigures> = {}): YearFigures => ({
  periodEnd: `20${label.slice(2)}-03-31`,
  label,
  sales: 1000,
  operatingProfit: 300,
  netProfit: 100,
  interest: 30,
  eps: 5,
  borrowings: 400,
  equity: 800,
  totalAssets: 2000,
  cfo: 250,
  fcf: 80,
  cfoToEbitda: 83,
  ...over,
});
const EMPTY: Partial<YearFigures> = { sales: null, operatingProfit: null, netProfit: null, interest: null, eps: null, borrowings: null, equity: null, totalAssets: null, cfo: null, fcf: null, cfoToEbitda: null };

describe('statementBlocks', () => {
  const years = [year('FY24'), year('FY25', EMPTY), year('FY26', { cfo: 350, netProfit: 150, fcf: 200 })];
  const blocks = statementBlocks(years);

  it('builds cards, a chart and a table', () => {
    expect(blocks.map((b) => b.type)).toEqual(['kpi_grid', 'bar_chart', 'data_table']);
  });
  it('reports cash conversion over the years that have both figures, not the gap', () => {
    const kpi = blocks[0];
    if (kpi.type !== 'kpi_grid') throw new Error();
    expect(kpi.items[0]).toMatchObject({ label: 'Cash conversion', value: '240%' });
    expect(kpi.items[0].note).toContain('2 years');
    expect(kpi.items[1].value).toBe('₹280 Cr');
    expect(kpi.items[2]).toMatchObject({ label: 'Borrowings, FY26', note: 'Debt to equity 0.50x' });
    expect(kpi.items[3].value).toBe('10.0x');
  });
  it('keeps the gap year on the chart axis and as dashes in the table', () => {
    const chart = blocks[1];
    if (chart.type !== 'bar_chart') throw new Error();
    expect(chart.categories).toEqual(['FY24', 'FY25', 'FY26']);
    expect(chart.series[1].values).toEqual([250, null, 350]);
    const table = blocks[2];
    if (table.type !== 'data_table') throw new Error();
    expect(table.rows[1]).toMatchObject({ period: 'FY25', cfo: null, dte: null });
  });
  it('leaves a card out when its inputs are missing, and everything out with no data', () => {
    const noCash = statementBlocks([year('FY26', { cfo: null, fcf: null })]);
    expect(noCash.map((b) => b.type)).toEqual(['kpi_grid', 'data_table']);
    const kpi = noCash[0];
    if (kpi.type !== 'kpi_grid') throw new Error();
    expect(kpi.items.map((i) => i.label)).toEqual(['Borrowings, FY26', 'Interest cover, FY26']);
    expect(statementBlocks([year('FY26', EMPTY)])).toEqual([]);
    expect(statementBlocks([])).toEqual([]);
  });
});
