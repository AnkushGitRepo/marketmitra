import { describe, expect, it } from 'vitest';
import {
  bestFor,
  COMPARE_GROUPS,
  RISK_COST_KEYS,
  compareHref,
  COMPARE_ROWS,
  MAX_COMPARE,
  parseCompareCodes,
  parseStoredSelection,
  toggleSelection,
} from './compare';
import type { FundSummary } from './types';

const fund = (scheme_code: number, patch: Partial<FundSummary> = {}): FundSummary => ({
  scheme_code, name: `Fund ${scheme_code}`, base_name: `Fund ${scheme_code}`, fund_house: 'X Mutual Fund', category: 'Equity',
  sub_category: 'Flexi Cap Fund', plan: 'direct', option: 'growth', nav: 10, nav_date: '2026-11-17',
  ret_1m: null, ret_3m: null, ret_6m: null, ret_1y: null, ret_3y: null, ret_5y: null, ret_10y: null,
  std_dev_3y: null, sharpe_3y: null, sortino_3y: null, max_drawdown_3y: null, sip_xirr_3y: null, sip_xirr_5y: null,
  expense_ratio: null, aum_cr: null, ...patch,
});
const row = (key: string) => COMPARE_ROWS.find((r) => r.key === key)!;

describe('toggleSelection', () => {
  const a = { scheme_code: 1, name: 'A' };
  const b = { scheme_code: 2, name: 'B' };

  it('adds a fund, and removes it when toggled again', () => {
    const added = toggleSelection([], a);
    expect(added).toEqual({ selected: [a], blocked: false });
    expect(toggleSelection(added.selected, a)).toEqual({ selected: [], blocked: false });
  });

  it('stops at the limit and says so, leaving the selection as it was', () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => ({ scheme_code: i + 10, name: `F${i}` }));
    expect(toggleSelection(full, a)).toEqual({ selected: full, blocked: true });
  });

  it('still lets a full selection shrink', () => {
    const full = Array.from({ length: MAX_COMPARE }, (_, i) => ({ scheme_code: i + 10, name: `F${i}` }));
    expect(toggleSelection(full, full[0]!).selected).toHaveLength(MAX_COMPARE - 1);
  });

  it('does not change the selection it is given', () => {
    const start = [a];
    toggleSelection(start, b);
    expect(start).toEqual([a]);
  });
});

describe('parseCompareCodes', () => {
  it('reads up to three distinct valid codes in order', () => {
    expect(parseCompareCodes('122639,149329,1')).toEqual([122639, 149329, 1]);
    expect(parseCompareCodes('5,5,6')).toEqual([5, 6]);
  });

  it('drops anything that is not a scheme code, and caps at the limit', () => {
    expect(parseCompareCodes('abc,0,-2,7, 8 ,9,10,11')).toEqual([7, 8, 9]);
  });

  it.each([null, '', ',,'])('gives nothing for %j', (raw) => {
    expect(parseCompareCodes(raw)).toEqual([]);
  });
});

describe('compareHref', () => {
  it('links to the compare page with the codes in order', () => {
    expect(compareHref([3, 1])).toBe('/funds/compare?codes=3,1');
  });
});

describe('parseStoredSelection', () => {
  it('reads a saved selection', () => {
    expect(parseStoredSelection('[{"scheme_code":1,"name":"A"}]')).toEqual([{ scheme_code: 1, name: 'A' }]);
  });

  it.each([null, '', 'not json', '{}', '[1,2]', '[{"scheme_code":"x","name":"A"}]'])('ignores %j', (raw) => {
    expect(parseStoredSelection(raw)).toEqual([]);
  });

  it('ignores a saved selection with a code that is not a valid scheme code', () => {
    expect(parseStoredSelection('[{"scheme_code":0,"name":"A"}]')).toEqual([]);
    expect(parseStoredSelection('[{"scheme_code":-4,"name":"A"}]')).toEqual([]);
    expect(parseStoredSelection('[{"scheme_code":2147483648,"name":"A"}]')).toEqual([]);
  });

  it('keeps at most the limit and skips duplicates', () => {
    const raw = JSON.stringify([1, 1, 2, 3, 4].map((n) => ({ scheme_code: n, name: `F${n}` })));
    expect(parseStoredSelection(raw).map((s) => s.scheme_code)).toEqual([1, 2, 3]);
  });
});

describe('bestFor', () => {
  it('picks the highest return', () => {
    expect(bestFor(row('ret_3y'), [fund(1, { ret_3y: 10 }), fund(2, { ret_3y: 14 })])).toBe(2);
  });

  it('picks the lowest expense ratio and the lowest volatility', () => {
    expect(bestFor(row('expense_ratio'), [fund(1, { expense_ratio: 0.9 }), fund(2, { expense_ratio: 0.2 })])).toBe(2);
    expect(bestFor(row('std_dev_3y'), [fund(1, { std_dev_3y: 12 }), fund(2, { std_dev_3y: 18 })])).toBe(1);
  });

  it('counts the shallowest fall as best (drawdowns are negative)', () => {
    expect(bestFor(row('max_drawdown_3y'), [fund(1, { max_drawdown_3y: -30 }), fund(2, { max_drawdown_3y: -12 })])).toBe(2);
  });

  it('never lets a tie win', () => {
    expect(bestFor(row('ret_3y'), [fund(1, { ret_3y: 10 }), fund(2, { ret_3y: 10 })])).toBeNull();
    expect(bestFor(row('ret_3y'), [fund(1, { ret_3y: 10 }), fund(2, { ret_3y: 10 }), fund(3, { ret_3y: 4 })])).toBeNull();
  });

  it('never lets a missing figure win, and needs two real figures to name a winner', () => {
    expect(bestFor(row('ret_3y'), [fund(1, { ret_3y: 10 }), fund(2)])).toBeNull();
    expect(bestFor(row('ret_3y'), [fund(1), fund(2)])).toBeNull();
    expect(bestFor(row('ret_3y'), [fund(1, { ret_3y: 10 }), fund(2), fund(3, { ret_3y: 12 })])).toBe(3);
  });

  it('reads a figure that is exactly zero as a real figure', () => {
    expect(bestFor(row('ret_1y'), [fund(1, { ret_1y: 0 }), fund(2, { ret_1y: -3 })])).toBe(1);
  });
});

describe('row groups', () => {
  it('has three groups in reading order', () => {
    expect(COMPARE_GROUPS.map((g) => g.id)).toEqual(['returns', 'risk', 'cost']);
    expect(COMPARE_GROUPS.map((g) => g.title)).toEqual(['Returns & SIP', 'Risk-adjusted efficiency', 'Cost & portfolio fit']);
  });

  it('puts every row in exactly one group, returns first, then risk, then cost', () => {
    const byGroup = (id: string) => COMPARE_ROWS.filter((r) => r.group === id).map((r) => r.key);
    expect(byGroup('returns')).toEqual(['ret_1y', 'ret_3y', 'ret_5y', 'sip_xirr_3y', 'sip_xirr_5y']);
    expect(byGroup('risk')).toEqual(['sharpe_3y', 'sortino_3y', 'std_dev_3y', 'max_drawdown_3y']);
    expect(byGroup('cost')).toEqual(['expense_ratio']);
    expect(COMPARE_ROWS.every((r) => COMPARE_GROUPS.some((g) => g.id === r.group))).toBe(true);
  });

  it('keeps the rows of a group next to each other', () => {
    const order = COMPARE_ROWS.map((r) => r.group);
    expect(order).toEqual([...order].sort((a, b) => COMPARE_GROUPS.findIndex((g) => g.id === a) - COMPARE_GROUPS.findIndex((g) => g.id === b)));
  });

  it('names the risk and cost measures that decide the trade-off, apart from raw returns', () => {
    expect([...RISK_COST_KEYS]).toEqual(['sharpe_3y', 'sortino_3y', 'std_dev_3y', 'max_drawdown_3y', 'expense_ratio']);
  });
});
