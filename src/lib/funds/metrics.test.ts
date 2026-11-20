import { describe, expect, it } from 'vitest';
import { calmarRatio, metricGrid, PRIMARY_LABELS } from './metrics';
import type { FundDetail } from './types';

const base: FundDetail = {
  scheme_code: 1, name: 'X Fund - Direct - Growth', base_name: 'X Fund', fund_house: 'X Mutual Fund',
  category: 'Equity', sub_category: 'Flexi Cap Fund', plan: 'direct', option: 'growth', nav: 10, nav_date: '2026-11-17',
  ret_1m: null, ret_3m: null, ret_6m: null, ret_1y: null, ret_3y: null, ret_5y: null, ret_10y: null,
  std_dev_3y: null, sharpe_3y: null, sortino_3y: null, max_drawdown_3y: null, sip_xirr_3y: null, sip_xirr_5y: null,
  expense_ratio: null, aum_cr: null,
  scheme_type: 'open_ended', isin_growth: null, isin_reinvest: null, peer_group: 'Flexi Cap Fund', is_active: true,
  metrics_as_of: null, factsheet: null,
};

const full: FundDetail = {
  ...base, ret_1y: 12.3456, ret_3y: 21, ret_5y: 18, ret_10y: 15, sip_xirr_3y: 9, sip_xirr_5y: 11, std_dev_3y: 14,
  sharpe_3y: 1.2, sortino_3y: 1.8, max_drawdown_3y: -14, expense_ratio: 0.68,
};

const labels = (tiles: readonly { label: string }[]): string[] => tiles.map((t) => t.label);

describe('metricGrid: the eight headline cells', () => {
  it('is one grid of up to eight cells in a fixed order, so the rows are balanced', () => {
    expect(labels(metricGrid(full).primary)).toEqual([...PRIMARY_LABELS]);
    expect(PRIMARY_LABELS).toHaveLength(8);
  });

  it('reads 1Y, 3Y CAGR, 3Y SIP and cost on the first row, and the risk ratios on the second', () => {
    expect([...PRIMARY_LABELS]).toEqual(['1Y return', '3Y CAGR', '3Y SIP', 'Expense ratio', 'Sharpe', 'Sortino', 'Volatility', 'Max drawdown']);
  });

  it('shows nothing for a fund with no figures: no empty cells, no dashes', () => {
    expect(metricGrid(base)).toEqual({ primary: [], more: [] });
  });

  it('leaves out a figure we do not have, and keeps the order of the rest', () => {
    const grid = metricGrid({ ...full, sortino_3y: null, expense_ratio: null });
    expect(labels(grid.primary)).toEqual(['1Y return', '3Y CAGR', '3Y SIP', 'Sharpe', 'Volatility', 'Max drawdown']);
  });

  it('formats percentages and tones them, and keeps ratios plain', () => {
    const tiles = metricGrid({ ...full, ret_3y: -4 }).primary;
    expect(tiles.find((t) => t.label === '1Y return')).toMatchObject({ value: '+12.35%', tone: 'up' });
    expect(tiles.find((t) => t.label === '3Y CAGR')).toMatchObject({ value: '-4.00%', tone: 'down' });
    expect(tiles.find((t) => t.label === 'Sharpe')).toMatchObject({ value: '1.20' });
    expect(tiles.find((t) => t.label === 'Volatility')?.value).toBe('14.0%');
  });

  it('never renders a dash or an empty value', () => {
    const grid = metricGrid(full);
    for (const tile of [...grid.primary, ...grid.more]) {
      expect(tile.value).not.toBe('—');
      expect(tile.value.trim()).not.toBe('');
    }
  });
});

describe('metricGrid: further figures go in one quiet line, not more cards', () => {
  it('holds the longer periods and Calmar, only when they exist', () => {
    expect(labels(metricGrid(full).more)).toEqual(['5Y CAGR', '10Y CAGR', '5Y SIP', 'Calmar']);
    expect(labels(metricGrid({ ...full, ret_10y: null, sip_xirr_5y: null }).more)).toEqual(['5Y CAGR', 'Calmar']);
  });

  it('adds the factsheet fields only when they hold data', () => {
    const sheet = { expense_ratio: null, aum_cr: 1200, exit_load: '', fund_manager: null, benchmark: 'Nifty 50 TRI', launch_date: null, as_of: null, source: 'x' };
    const l = labels(metricGrid({ ...base, factsheet: sheet }).more);
    expect(l).toEqual(['AUM', 'Benchmark']);
  });

  it('takes the expense ratio from the factsheet when the metrics row has none, and shows it once', () => {
    const sheet = { expense_ratio: 0.7, aum_cr: null, exit_load: null, fund_manager: null, benchmark: null, launch_date: null, as_of: null, source: 'x' };
    const grid = metricGrid({ ...base, factsheet: sheet });
    expect(labels(grid.primary)).toEqual(['Expense ratio']);
    expect(labels(grid.more)).not.toContain('Expense ratio');
  });

  it('does not change the fund it is given', () => {
    const copy = JSON.stringify(full);
    metricGrid(full);
    expect(JSON.stringify(full)).toBe(copy);
  });
});

describe('calmarRatio', () => {
  it('is the 3-year return divided by the size of the worst fall', () => {
    expect(calmarRatio(21, -14)).toBeCloseTo(1.5, 6);
  });

  it.each([
    [null, -10], [10, null], [10, 0], [10, 5], [Number.NaN, -10],
  ])('is null when it cannot be computed honestly (%s, %s)', (ret, dd) => {
    expect(calmarRatio(ret as number | null, dd as number | null)).toBeNull();
  });
});
