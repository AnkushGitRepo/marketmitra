import { describe, expect, it } from 'vitest';
import { COMPARE_ROWS } from './compare';
import type { FundFit } from './compareFit';
import { compareSummary } from './compareSummary';
import type { FundSummary } from './types';

const fund = (scheme_code: number, base_name: string, patch: Partial<FundSummary> = {}): FundSummary =>
  ({
    scheme_code, name: base_name, base_name, fund_house: 'X Mutual Fund', category: 'Equity', sub_category: 'Thematic Fund', plan: 'direct',
    option: 'growth', nav: 10, nav_date: '2026-11-17', ret_1m: null, ret_3m: null, ret_6m: null, ret_1y: null, ret_3y: null, ret_5y: null,
    ret_10y: null, std_dev_3y: null, sharpe_3y: null, sortino_3y: null, max_drawdown_3y: null, sip_xirr_3y: null, sip_xirr_5y: null,
    expense_ratio: null, aum_cr: null, ...patch,
  }) as FundSummary;

const alpha = fund(1, 'Alpha Defence Fund', { ret_3y: 31.28, ret_1y: 18.86, sharpe_3y: 1.15, sortino_3y: 1.6, std_dev_3y: 20, max_drawdown_3y: -34.54, expense_ratio: 0.89 });
const beta = fund(2, 'Beta Healthcare Fund', { ret_3y: 23.75, ret_1y: 28.14, sharpe_3y: 1.3, sortino_3y: 1.86, std_dev_3y: 14.2, max_drawdown_3y: -15.9, expense_ratio: 0.59 });
const gamma = fund(3, 'Gamma Infra Fund', { ret_3y: 18.92, ret_1y: 11.69, sharpe_3y: 0.84, sortino_3y: 1.1, std_dev_3y: 17, max_drawdown_3y: -25.8, expense_ratio: 1.06 });

const text = (funds: FundSummary[], fits: FundFit[] | null = null, key: 'tradeoff' | 'fit' = 'tradeoff'): string =>
  compareSummary(funds, fits).find((i) => i.key === key)?.text ?? '';

describe('compareSummary: the risk and cost trade-off', () => {
  it('names the fund that leads the risk and cost measures, with its figures, and the fund with the highest return', () => {
    const t = text([alpha, beta, gamma]);
    expect(t).toContain('Beta Healthcare Fund leads all 5 risk and cost measures');
    expect(t).toContain('Sharpe 1.30');
    expect(t).toContain('worst 3-year fall -15.90%');
    expect(t).toContain('expense ratio 0.59%');
    expect(t).toContain('Alpha Defence Fund has the highest 3-year return (+31.28%)');
    expect(t).toContain('worst 3-year fall of -34.54%');
  });

  it('quotes figures exactly as the table shows them', () => {
    const t = text([alpha, beta, gamma]);
    const row = (key: string) => COMPARE_ROWS.find((r) => r.key === key)!;
    expect(t).toContain(row('max_drawdown_3y').render(beta).text);
    expect(t).toContain(row('ret_3y').render(alpha).text);
    expect(t).toContain(row('expense_ratio').render(beta).text);
  });

  it('shows at most three of the leader\'s figures, the most telling first', () => {
    expect(text([alpha, beta, gamma])).not.toContain('Sortino 1.86');
  });

  it('says "X of the N" when the leader does not win them all', () => {
    const mixed = fund(2, 'Beta Healthcare Fund', { ...beta, expense_ratio: 1.5 });
    expect(text([alpha, mixed, gamma])).toContain('Beta Healthcare Fund leads 4 of the 5 risk and cost measures');
  });

  it('counts against all five measures, so a lead on a few with gaps or ties is not "all"', () => {
    // Three measures can be compared (expense and volatility are tied or missing).
    const a = fund(1, 'Alpha', { sharpe_3y: 1.3, sortino_3y: 1.9, max_drawdown_3y: -10, std_dev_3y: 12, expense_ratio: 1 });
    const b = fund(2, 'Beta', { sharpe_3y: 1.0, sortino_3y: 1.2, max_drawdown_3y: -30, std_dev_3y: 12, expense_ratio: 1 });
    expect(text([a, b])).toContain('Alpha leads 3 of the 5 risk and cost measures');
  });

  it('names a leader only when at least three measures can be compared', () => {
    const a = fund(1, 'Alpha', { sharpe_3y: 1.3, sortino_3y: 1.9, ret_3y: 10 });
    const b = fund(2, 'Beta', { sharpe_3y: 1.0, sortino_3y: 1.2, ret_3y: 12 });
    const t = text([a, b]);
    expect(t).not.toContain('leads');
    expect(t).not.toContain('split');
    expect(t).toContain('Beta has the highest 3-year return');
  });

  it('says so when the leader also has the highest return', () => {
    const t = text([fund(1, 'Alpha', { ...beta, ret_3y: 40 }), gamma]);
    expect(t).toContain('also has the highest 3-year return (+40.00%)');
  });

  it('says the measures are split when no fund leads, instead of picking one', () => {
    // Two measures each and one tie (expense ratio), so no fund leads.
    const a = fund(1, 'Alpha', { sharpe_3y: 1.3, sortino_3y: 1.9, std_dev_3y: 20, max_drawdown_3y: -30, expense_ratio: 1 });
    const b = fund(2, 'Beta', { sharpe_3y: 1.0, sortino_3y: 1.2, std_dev_3y: 12, max_drawdown_3y: -10, expense_ratio: 1 });
    const t = text([a, b]);
    expect(t).toContain('split');
    expect(t).toContain('Alpha wins 2');
    expect(t).toContain('Beta wins 2');
  });

  it('falls back to the 1-year return when no fund has a clear 3-year winner', () => {
    const a = fund(1, 'Alpha', { ret_1y: 12, ret_3y: 10 });
    const b = fund(2, 'Beta', { ret_1y: 9, ret_3y: 10 });
    expect(text([a, b])).toContain('Alpha has the highest 1-year return (+12.00%)');
  });

  it('is empty when nothing can be said: fewer than two funds with figures', () => {
    expect(compareSummary([alpha], null)).toEqual([]);
    expect(compareSummary([fund(1, 'A'), fund(2, 'B')], null)).toEqual([]);
  });

  it('is plain description: never advice, never a recommendation', () => {
    for (const funds of [[alpha, beta, gamma], [alpha, beta], [beta, gamma]]) {
      for (const item of compareSummary(funds, null)) {
        expect(item.text).not.toMatch(/\b(buy|sell|avoid|should|recommend|better choice|best choice|safer|winner)\b/i);
      }
    }
  });

  it('does not change the funds it is given', () => {
    const funds = [alpha, beta, gamma];
    const before = JSON.stringify(funds);
    compareSummary(funds, null);
    expect(JSON.stringify(funds)).toBe(before);
  });
});

describe('compareSummary: portfolio fit', () => {
  const fits: FundFit[] = [
    { code: 1, kind: 'sector', sectors: ['Industrials'], pct: 0 },
    { code: 2, kind: 'sector', sectors: ['Healthcare'], pct: 26.7 },
    { code: 3, kind: 'sector', sectors: ['Industrials', 'Utilities'], pct: 0 },
  ];

  it('states the weight in each fund\'s sector as a fact, largest first', () => {
    const t = text([alpha, beta, gamma], fits, 'fit');
    expect(t).toContain('Your portfolio weight in the sectors each fund invests in');
    expect(t.indexOf('Beta Healthcare Fund 26.7% (Healthcare)')).toBeGreaterThan(-1);
    expect(t.indexOf('Beta Healthcare Fund')).toBeLessThan(t.indexOf('Alpha Defence Fund'));
    expect(t).toContain('Alpha Defence Fund none (Industrials)');
    expect(t).toContain('Gamma Infra Fund none (Industrials and Utilities)');
  });

  it('says nothing about a fund type with no sector view, rather than inventing one', () => {
    const t = text([alpha, beta], [{ code: 1, kind: 'other', sectors: [], pct: null }, { code: 2, kind: 'sector', sectors: ['Healthcare'], pct: 12 }], 'fit');
    expect(t).toContain('Beta Healthcare Fund 12.0% (Healthcare)');
    expect(t).not.toContain('Alpha Defence Fund');
  });

  it('is left out when every fund is of a type with no sector view', () => {
    expect(compareSummary([alpha, beta], [{ code: 1, kind: 'other', sectors: [], pct: null }, { code: 2, kind: 'other', sectors: [], pct: null }]).some((i) => i.key === 'fit')).toBe(false);
  });

  it('describes a fund with no single sector by what it is', () => {
    const t = text([alpha, beta], [{ code: 1, kind: 'overseas', sectors: [], pct: null }, { code: 2, kind: 'broad', sectors: [], pct: null }], 'fit');
    expect(t).toContain('Alpha Defence Fund invests overseas');
    expect(t).toContain('Beta Healthcare Fund holds across sectors');
  });

  it('flags a heavy existing weight with the same watch level as the portfolio risk card', () => {
    const items = compareSummary([alpha, beta], [{ code: 1, kind: 'sector', sectors: ['A'], pct: 5 }, { code: 2, kind: 'sector', sectors: ['B'], pct: 30 }]);
    expect(items.find((i) => i.key === 'fit')?.tone).toBe('warning');
    expect(compareSummary([alpha, beta], [{ code: 1, kind: 'sector', sectors: ['A'], pct: 5 }, { code: 2, kind: 'sector', sectors: ['B'], pct: 29.9 }]).find((i) => i.key === 'fit')?.tone).toBe('neutral');
  });

  it('is left out when the portfolio gives no fit, and never says stock-level', () => {
    expect(compareSummary([alpha, beta], null).some((i) => i.key === 'fit')).toBe(false);
    expect(text([alpha, beta, gamma], fits, 'fit')).not.toMatch(/stock-level|overlap|not available|unavailable/i);
  });
});
