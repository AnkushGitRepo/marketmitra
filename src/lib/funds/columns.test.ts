import { describe, expect, it } from 'vitest';
import { FUND_COLUMNS, visibleColumns } from './columns';
import type { FundSummary } from './types';

const fund = (over: Partial<FundSummary> = {}): FundSummary => ({
  scheme_code: 1, name: 'A', base_name: 'A', fund_house: 'H', category: 'Equity', sub_category: null,
  plan: 'direct', option: 'growth', nav: 10, nav_date: '2026-11-17',
  ret_1m: 1, ret_3m: 1, ret_6m: 1, ret_1y: 1, ret_3y: 1, ret_5y: 1, ret_10y: null,
  std_dev_3y: 1, sharpe_3y: 1, sortino_3y: 1, max_drawdown_3y: -1, sip_xirr_3y: 1, sip_xirr_5y: 1,
  expense_ratio: 0.5, aum_cr: null, ...over,
});

describe('visibleColumns', () => {
  it('hides a column that has no figure for any fund on the page', () => {
    const keys = visibleColumns([fund(), fund({ scheme_code: 2 })]).map((c) => c.key);
    expect(keys).not.toContain('aum_cr');
    expect(keys).toContain('expense_ratio');
  });

  it('shows it as soon as one fund has a figure', () => {
    expect(visibleColumns([fund(), fund({ scheme_code: 2, aum_cr: 1200 })]).map((c) => c.key)).toContain('aum_cr');
  });

  it('keeps the core return and risk columns even when empty (a young fund list)', () => {
    const young = [fund({ ret_5y: null, ret_3y: null, sharpe_3y: null })];
    const keys = visibleColumns(young).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['ret_1y', 'ret_3y', 'ret_5y', 'sharpe_3y']));
  });

  it('shows every column on an empty page so the header does not jump', () => {
    expect(visibleColumns([])).toEqual(FUND_COLUMNS);
  });
});

describe('SORT_LABELS', () => {
  it('has a label for every sort key the service accepts, so the phone select never shows the wrong option', async () => {
    const { FUND_SORT_KEYS } = await import('./params');
    const { SORT_LABELS } = await import('./columns');
    for (const key of FUND_SORT_KEYS) expect(SORT_LABELS[key], key).toBeTruthy();
  });
});
