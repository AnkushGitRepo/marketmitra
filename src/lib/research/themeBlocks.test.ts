import { describe, expect, it } from 'vitest';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import type { BarChartBlock } from './blocks';
import { themeBlocks } from './themeBlocks';

const row = (symbol: string, cap: number, sales: number | null, profit: number | null): ScreenerResultRow =>
  ({ symbol, name: symbol, market_cap: cap, pe: 20, roce: 15, roe: 12, sales_growth_3y_cagr: sales, profit_growth_3y_cagr: profit }) as unknown as ScreenerResultRow;

const chart = (rows: ScreenerResultRow[]) => themeBlocks(['Capital Goods'], rows, rows.length).find((b): b is BarChartBlock => b.type === 'bar_chart');

describe('themeBlocks growth chart', () => {
  it('leaves out companies with no 3-year figure instead of drawing an empty gap', () => {
    const c = chart([row('HAL', 9, 20, 25), row('NOGROWTH', 8, null, null), row('BEL', 7, 15, 18)]);
    expect(c?.categories).toEqual(['HAL', 'BEL']);
  });

  it('keeps a company that has one of the two figures, with the other as null', () => {
    const c = chart([row('HAL', 9, 20, null)]);
    expect(c?.categories).toEqual(['HAL']);
    expect(c?.series[1].values).toEqual([null]);
  });

  it('takes up to six of the largest that have data', () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(`S${i}`, 100 - i, 10, 10));
    expect(chart(rows)?.categories).toHaveLength(6);
  });

  it('has no chart when nobody has growth data', () => {
    expect(chart([row('A', 1, null, null)])).toBeUndefined();
  });
});
