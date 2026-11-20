import { describe, expect, it } from 'vitest';
import { calmarRatio, metricTiles } from './metrics';
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

const labels = (fund: FundDetail): string[] => metricTiles(fund).flatMap((g) => g.tiles.map((t) => t.label));

describe('metricTiles', () => {
  it('shows nothing for a fund with no figures: no empty groups, no dash rows', () => {
    expect(metricTiles(base)).toEqual([]);
  });

  it('shows only the figures that exist', () => {
    const fund = { ...base, ret_1y: 12.3456, sharpe_3y: 0.9, expense_ratio: 0.68 };
    expect(labels(fund)).toEqual(['1 year', 'Sharpe', 'Expense ratio']);
  });

  it('never renders a dash or an empty value', () => {
    const fund = { ...base, ret_1y: 5, ret_3y: 8, std_dev_3y: 12, max_drawdown_3y: -20, sip_xirr_3y: 9 };
    for (const tile of metricTiles(fund).flatMap((g) => g.tiles)) {
      expect(tile.value).not.toBe('—');
      expect(tile.value.trim()).not.toBe('');
    }
  });

  it('formats percentages, tones them, and keeps Sharpe plain', () => {
    const tiles = metricTiles({ ...base, ret_1y: 12.3456, ret_3y: -4, sharpe_3y: 1.234 }).flatMap((g) => g.tiles);
    expect(tiles.find((t) => t.label === '1 year')).toMatchObject({ value: '+12.35%', tone: 'up' });
    expect(tiles.find((t) => t.label === '3 years p.a.')).toMatchObject({ value: '-4.00%', tone: 'down' });
    expect(tiles.find((t) => t.label === 'Sharpe')).toMatchObject({ value: '1.23' });
  });

  it('adds the factsheet fields only when they hold data', () => {
    const sheet = { expense_ratio: null, aum_cr: 1200, exit_load: '', fund_manager: null, benchmark: 'Nifty 50 TRI', launch_date: null, as_of: null, source: 'x' };
    const l = labels({ ...base, factsheet: sheet });
    expect(l).toContain('AUM');
    expect(l).toContain('Benchmark');
    expect(l).not.toContain('Exit load');
    expect(l).not.toContain('Fund manager');
    expect(l).not.toContain('Launched');
  });

  it('puts the expense ratio from the metrics row first and does not repeat it from the factsheet', () => {
    const sheet = { expense_ratio: 0.7, aum_cr: null, exit_load: null, fund_manager: null, benchmark: null, launch_date: null, as_of: null, source: 'x' };
    expect(labels({ ...base, expense_ratio: 0.7, factsheet: sheet }).filter((l) => l === 'Expense ratio')).toHaveLength(1);
  });

  it('does not change the fund it is given', () => {
    const fund = { ...base, ret_1y: 5 };
    const copy = JSON.stringify(fund);
    metricTiles(fund);
    expect(JSON.stringify(fund)).toBe(copy);
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
