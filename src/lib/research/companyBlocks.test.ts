import { describe, expect, it } from 'vitest';
import type { PeerOut } from '@/lib/dashboard/fundamentalsApi';
import { buildCompanyData, latestSalesGrowth } from './companyData';
import { companyBlocks } from './companyBlocks';
import { comparisonBlocks } from './comparisonBlocks';

const ratio = (name: string, value: string | null) => ({ name, value, unit: null, as_of: '2026-11-25', source_tier: 't' });
const item = (label: string, period_end: string, value: string, period_type = 'annual') => ({
  label,
  period_type,
  period_end,
  value,
  unit: 'INR_CR',
  source_tier: 't',
});
const sh = (category: string, quarter_end: string, percentage: string) => ({ category, quarter_end, percentage, source_tier: 't' });

const peer = (name: string, pe: string | null, is_target = false): PeerOut => ({
  symbol: name,
  name,
  is_target,
  cmp: '1',
  pe,
  market_cap: '1000',
  div_yield: '1',
  net_profit_qtr: null,
  qtr_profit_var_pct: null,
  sales_qtr: null,
  qtr_sales_var_pct: '5',
  roce_pct: '12',
  as_of: '2026-11-25',
  source_tier: 't',
});

const data = buildCompanyData({
  symbol: 'RELIANCE',
  name: 'Reliance Industries',
  ratios: [ratio('Market Cap', '1855310.0000'), ratio('Stock P/E', '22.6'), ratio('ROCE', '10.3'), ratio('ROE', '8.91')],
  profitAndLoss: [
    item('Sales', '2025-03-31', '962820'),
    item('Sales', '2026-03-31', '1055780'),
    item('Operating Profit', '2026-03-31', '179065'),
    item('Sales', '2026-06-30', '999', 'quarterly'),
  ],
  shareholding: [sh('FIIs', '2026-09-30', '25.4'), sh('FIIs', '2026-06-30', '24.0'), sh('Promoters', '2026-09-30', '50.4')],
});

describe('buildCompanyData', () => {
  it('keeps annual periods only, oldest first, and tolerates gaps', () => {
    expect(data.annual.map((a) => a.periodEnd)).toEqual(['2025-03-31', '2026-03-31']);
    expect(data.annual[0].operatingProfit).toBeNull();
  });
  it('reads the FII holding and its change in points', () => {
    expect(data.fii.latest).toBe(25.4);
    expect(data.fii.change).toBeCloseTo(1.4);
  });
  it('computes latest-year sales growth', () => {
    expect(latestSalesGrowth(data)).toBeCloseTo(9.66, 1);
  });
  it('does not fail when the company has no series at all', () => {
    const empty = buildCompanyData({ symbol: 'X', name: 'X', ratios: null, profitAndLoss: null, shareholding: null });
    expect(empty.annual).toEqual([]);
    expect(empty.fii).toEqual({ latest: null, change: null });
    expect(companyBlocks(empty, null).map((b) => b.type)).toEqual(['kpi_grid']);
  });
});

describe('companyBlocks', () => {
  it('builds KPI cards with the peer median, the sales chart and the peer table', () => {
    const peers = [peer('A', '10', true), peer('B', '20'), peer('C', '30'), peer('D', '40')];
    const blocks = companyBlocks(data, peers);
    expect(blocks.map((b) => b.type)).toEqual(['kpi_grid', 'bar_chart', 'data_table']);
    const kpi = blocks[0];
    if (kpi.type !== 'kpi_grid') throw new Error('expected kpi_grid');
    expect(kpi.items[0].value).toBe('₹18.55L Cr');
    expect(kpi.items[1]).toMatchObject({ value: '22.6x', note: 'Peer median 30.0x' });
    expect(kpi.items[3]).toMatchObject({ value: '25.4%', tone: 'positive' });
  });
  it('leaves the peer median out when there are too few peers', () => {
    const kpi = companyBlocks(data, [peer('A', '10', true), peer('B', '20')])[0];
    if (kpi.type !== 'kpi_grid') throw new Error('expected kpi_grid');
    expect(kpi.items[1].note).toBeUndefined();
  });
});

describe('comparisonBlocks', () => {
  const other = buildCompanyData({
    symbol: 'ONGC',
    name: 'ONGC',
    ratios: [ratio('Stock P/E', '8'), ratio('ROCE', '15')],
    profitAndLoss: null,
    shareholding: null,
  });
  it('builds a table plus a chart per metric that has data', () => {
    const blocks = comparisonBlocks([data, other]);
    expect(blocks.map((b) => b.type)).toEqual(['data_table', 'bar_chart', 'bar_chart', 'bar_chart']);
    const roce = blocks[1];
    if (roce.type !== 'bar_chart') throw new Error('expected bar_chart');
    expect(roce.categories).toEqual(['RELIANCE', 'ONGC']);
    expect(roce.series[0].values).toEqual([10.3, 15]);
  });
  it('skips a chart nobody has data for, and needs two companies', () => {
    const none = buildCompanyData({ symbol: 'Y', name: 'Y', ratios: null, profitAndLoss: null, shareholding: null });
    expect(comparisonBlocks([none, none]).map((b) => b.type)).toEqual(['data_table']);
    expect(comparisonBlocks([data])).toEqual([]);
  });
});
