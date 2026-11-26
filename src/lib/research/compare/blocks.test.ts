import { describe, expect, it } from 'vitest';
import { blocksToMarkdown } from '../blocksMarkdown';
import type { CompareCompany } from './analysis';
import { matrixBlocks, trajectoryBlocks, valuationBlocks, verdictBlocks } from './blocks';

const annual = (sales: number[]) => sales.map((s, i) => ({ periodEnd: `${2022 + i}-03-31`, sales: s, operatingProfit: s / 5 }));
const co = (symbol: string, over: Partial<CompareCompany> = {}): CompareCompany => ({
  symbol, name: symbol, sector: 'Telecom', industry: 'Telecom Services', marketCap: 100_000, pe: 25, pb: 3, roce: 12, roe: 10, debtToEquity: 0.8, dividendYield: 0.5, salesCagr3y: 10, profitCagr3y: 15, annual: annual([100, 112, 125, 140, 157]), ...over,
});
const set = [co('JPL', { marketCap: 1_250_000, pe: 43.4, roce: 12.1, debtToEquity: 0.2 }), co('BHARTI', { marketCap: 1_310_000, pe: 39.7, roce: 17.6, debtToEquity: 1.8 }), co('IDEA', { marketCap: 122_000, pe: -3, pb: -2, roce: -1.7, debtToEquity: -4.6, profitCagr3y: null })];

describe('verdictBlocks', () => {
  it('shows four category cards and names a negative net worth beside balance-sheet safety', () => {
    const grid = verdictBlocks(set)[0] as Extract<ReturnType<typeof verdictBlocks>[number], { type: 'kpi_grid' }>;
    expect(grid.items.map((i) => i.label)).toEqual(['Scale', 'Profitability and ROCE', 'Balance-sheet safety', 'Growth momentum']);
    expect(grid.items[0].value).toBe('BHARTI');
    expect(grid.items[2].value).toBe('JPL');
    expect(grid.items[2].note).toContain('Negative net worth: IDEA');
  });
  it('builds nothing for fewer than two companies', () => {
    expect(verdictBlocks([co('A')])).toEqual([]);
  });
});

describe('trajectoryBlocks', () => {
  it('has three metric views sharing one axis, with the projection labelled', () => {
    const b = trajectoryBlocks(set)[0] as Extract<ReturnType<typeof trajectoryBlocks>[number], { type: 'trajectory_chart' }>;
    expect(b.views.map((v) => v.key)).toEqual(['sales', 'operatingProfit', 'indexed']);
    expect(b.labels.at(-1)).toBe('FY29E');
    expect(b.views.every((v) => v.series.every((s) => s.values.length === b.labels.length))).toBe(true);
    expect(b.note).toMatch(/not an analyst forecast/);
  });
  it('reads as tables in a text export', () => {
    expect(blocksToMarkdown(trajectoryBlocks(set))).toMatch(/Revenue \(₹ crore\)[\s\S]*FY27E/);
  });
});

describe('matrixBlocks', () => {
  const t = matrixBlocks(set)[0] as Extract<ReturnType<typeof matrixBlocks>[number], { type: 'data_table' }>;
  it('has a column per company', () => {
    expect(t.columns.map((c) => c.key)).toEqual(['measure', 'JPL', 'BHARTI', 'IDEA']);
    expect(t.rows[1]).toMatchObject({ measure: 'P/E', JPL: '43.40x', IDEA: 'n/m' });
  });
  it('marks the best of each row, never a negative-net-worth debt ratio, and does not rank P/E', () => {
    const at = (measure: string) => t.highlights?.find((h) => t.rows[h.row].measure === measure)?.column;
    expect(at('ROCE')).toBe('BHARTI');
    expect(at('P/E')).toBeUndefined(); // a lower multiple is not "better" in itself
    expect(at('Debt / equity')).toBe('JPL');
    expect(at('Market cap')).toBeUndefined();
  });
});

describe('valuationBlocks', () => {
  it('divides P/E by growth only where both are positive', () => {
    const t = valuationBlocks(set).find((b) => b.type === 'data_table') as Extract<ReturnType<typeof valuationBlocks>[number], { type: 'data_table' }>;
    expect(t.rows[0].ratio).toBeCloseTo(2.89, 1);
    expect(t.rows[2].ratio).toBeNull();
  });
});
