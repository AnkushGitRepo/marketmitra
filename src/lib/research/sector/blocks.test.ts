import { describe, expect, it } from 'vitest';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import type { BarChartBlock, DataTableBlock, KpiGridBlock } from '../blocks';
import { leadersBlocks, leadershipRows, scorecardBlocks } from './blocks';
import type { SectorInputs } from './inputs';

const r = (symbol: string, cap: number, over: Partial<ScreenerResultRow> = {}): ScreenerResultRow =>
  ({ symbol, name: symbol, market_cap: cap, pe: 20, pb: 3, roce: 15, roe: 12, debt_to_equity: 0.5, sales_growth_3y_cagr: 10, profit_growth_3y_cagr: 12, ...over }) as ScreenerResultRow;

const inputs = (rows: ScreenerResultRow[]): SectorInputs => ({ label: 'Defence & Aerospace', kind: 'theme', industries: ['Aerospace & Defense'], sectors: [], count: 27, rows });

describe('scorecardBlocks', () => {
  const blocks = scorecardBlocks(inputs([r('HAL', 300, { pe: 30, roce: 30 }), r('BEL', 200, { pe: 40, roce: 20 }), r('LOSS', 10, { pe: -5, roce: 10 })]));
  it('says how many companies are listed and takes medians of the fetched ones, leaving loss-makers out of P/E', () => {
    const kpi = blocks[0] as KpiGridBlock;
    expect(kpi.items.find((i) => i.label === 'Listed companies')?.value).toBe('27');
    expect(kpi.items.find((i) => i.label === 'Median P/E')?.value).toBe('35.0x'); // median of 30 and 40, not -5
    expect(kpi.items.find((i) => i.label === 'Median ROCE')?.value).toBe('20.0%');
  });
  it('adds the labelled growth chart', () => {
    expect((blocks[1] as BarChartBlock).categories).toEqual(['HAL', 'BEL', 'LOSS']);
  });
  it('has nothing for an empty sector', () => {
    expect(scorecardBlocks(inputs([]))).toEqual([]);
  });
});

describe('leadership', () => {
  const rows = [r('A', 300, { roce: 10, debt_to_equity: 1 }), r('B', 200, { roce: 40, debt_to_equity: 0.1, pe: -3 }), r('C', 100, { roce: 20, debt_to_equity: null, pe: 12 })];
  it('names the leader on each measure, higher or lower as it should be', () => {
    const by = Object.fromEntries(leadershipRows(rows).map((x) => [x.metric, x.company]));
    expect(by['Largest by market cap']).toBe('A (A)');
    expect(by['Highest ROCE']).toBe('B (B)');
    expect(by['Lowest debt / equity']).toBe('B (B)');
    expect(by['Lowest P/E (profitable)']).toBe('C (C)'); // B's negative P/E is not a lead
  });
  it('leaves out a measure nobody reports', () => {
    const none = leadershipRows([r('A', 1, { roe: null })].map((x) => ({ ...x, roe: null })));
    expect(none.find((x) => x.metric === 'Highest ROE')).toBeUndefined();
  });
  it('shows ten companies at most, then the leadership table', () => {
    const many = Array.from({ length: 14 }, (_, i) => r(`S${i}`, 100 - i));
    const [table, lead] = leadersBlocks(inputs(many)) as DataTableBlock[];
    expect(table.rows).toHaveLength(10);
    expect(lead.title).toBe('Who leads on each measure');
  });
});
