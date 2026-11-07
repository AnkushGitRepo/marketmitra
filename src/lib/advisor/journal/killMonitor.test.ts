import { describe, expect, it } from 'vitest';
import { healthy, year } from '../screen/fixtures';
import { evaluateKill, killKey, seriesFor, type KillRule } from './killMonitor';

const rule = (over: Partial<KillRule> = {}): KillRule => ({
  metric: 'roce_pct', operator: '<', threshold: 12, consecutivePeriods: 2, periodUnit: 'year', ...over,
});
const weak = (n: number) => [0, 1, 2, 3, 4, 5].map((b) => year(b, b < n ? { profitBeforeTax: 40 } : {}));

describe('evaluateKill', () => {
  it('fires when the breach lasts the required number of periods', () => {
    const r = evaluateKill(rule(), healthy({ annual: weak(2) }));
    expect(r.status).toBe('fired');
    expect(r.observed).toHaveLength(2);
  });
  it('does not fire for a single bad year when two are required', () => {
    expect(evaluateKill(rule(), healthy({ annual: weak(1) })).status).toBe('ok');
  });
  it('does not fire for a healthy company', () => {
    expect(evaluateKill(rule(), healthy()).status).toBe('ok');
  });
  it('is unknown — never fired — when data is missing', () => {
    const d = healthy({ annual: [year(0, { interest: null }), ...[1, 2, 3, 4, 5].map((b) => year(b))] });
    expect(evaluateKill(rule(), d).status).toBe('unknown');
  });
  it('is unknown when the unit does not match the metric', () => {
    expect(evaluateKill(rule({ periodUnit: 'quarter' }), healthy()).status).toBe('unknown');
  });
  it('handles debt/equity above a ceiling', () => {
    const d = healthy({ annual: [year(0, { borrowings: 900 }), ...[1, 2, 3, 4, 5].map((b) => year(b))] });
    expect(evaluateKill(rule({ metric: 'debt_to_equity', operator: '>', threshold: 0.8, consecutivePeriods: 1 }), d).status).toBe('fired');
  });
  it('pledge: fires above the ceiling, unknown when no source supplies it', () => {
    const r = rule({ metric: 'promoter_pledge_pct', operator: '>', threshold: 10, consecutivePeriods: 1, periodUnit: 'quarter' });
    expect(evaluateKill(r, healthy({ promoterPledgePct: 15 })).status).toBe('fired');
    expect(evaluateKill(r, healthy({ promoterPledgePct: 3 })).status).toBe('ok');
    expect(evaluateKill(r, healthy({ promoterPledgePct: null })).status).toBe('unknown');
  });
  it('promoter holding below a floor over quarters', () => {
    const d = healthy({ promoter: [40, 41, 42].map((pct, i) => ({ quarterEnd: `q${i}`, pct })) });
    expect(evaluateKill(rule({ metric: 'promoter_holding_pct', consecutivePeriods: 2, threshold: 45, periodUnit: 'quarter' }), d).status).toBe('fired');
  });
  it('revenue growth is computed year on year', () => {
    const d = healthy({ annual: [year(0, { sales: 900 }), year(1, { sales: 1000 }), year(2, { sales: 1100 }), year(3), year(4), year(5)] });
    const s = seriesFor('revenue_growth_pct', d);
    expect(s.values[0]).toBeCloseTo(-10);
    expect(evaluateKill(rule({ metric: 'revenue_growth_pct', threshold: 0, consecutivePeriods: 1 }), d).status).toBe('fired');
  });
  it('free cash flow negative two years running', () => {
    const d = healthy({ annual: [year(0, { freeCashFlow: -1 }), year(1, { freeCashFlow: -2 }), ...[2, 3, 4, 5].map((b) => year(b))] });
    expect(evaluateKill(rule({ metric: 'free_cash_flow_cr', threshold: 0 }), d).status).toBe('fired');
  });
});

describe('killKey', () => {
  it('is stable and distinguishes criteria', () => {
    expect(killKey(rule())).toBe(killKey(rule()));
    expect(killKey(rule())).not.toBe(killKey(rule({ threshold: 10 })));
  });
});
