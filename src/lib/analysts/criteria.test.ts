import { describe, expect, it } from 'vitest';
import type { StockSignals } from '@/lib/stock/signals';
import { applyCriterionAction, breachEntry, chooseCriteria, defaultCriteria, describeCriterion, evaluateCriteria, validateProposed } from './criteria';
import type { ThesisCriterion } from './types';

const signals = (over: Partial<{ roce: number | null; roe: number | null; de: number | null; financial: boolean; promoter: number | null; delta: number | null; salesYoy: number | null; profitYoy: number | null; headlines: number; negPct: number | null }> = {}): StockSignals => {
  const o = { roce: 14, roe: 12, de: 0.02, financial: false, promoter: 56.7, delta: 0, salesYoy: 5, profitYoy: 10, headlines: 10, negPct: 10, ...over };
  return {
    valuation: { pe: 20, pb: 2, peerMedianPe: 25, peVsPeersPct: -20 },
    quality: { roce: o.roce, roe: o.roe, debtToEquity: o.de, debtPeriod: null, freeCashFlow: null, isFinancial: o.financial },
    growth: { salesCagr3y: null, profitCagr3y: null, qtrSalesYoyPct: o.salesYoy, qtrProfitYoyPct: o.profitYoy },
    ownership: { promoter: o.promoter === null ? null : { pct: o.promoter, delta1q: null, delta4q: o.delta }, fii: null, dii: null, latestQuarter: null },
    sentiment: { total: o.headlines, positivePct: 50, negativePct: o.negPct },
    technical: { fromHighPct: null, vs200dmPct: null },
    coverage: { financialYears: 5, headlines: o.headlines, quarters: 8 },
  } as unknown as StockSignals;
};

const crit = (over: Partial<ThesisCriterion> = {}): ThesisCriterion => ({ id: 'roce', metric: 'roce', op: 'below', threshold: 10, baseline: 14, why: '', source: 'default', enabled: true, breached: false, ...over });

describe('defaultCriteria', () => {
  it('proposes at most four observable criteria with a margin of safety from today\'s figures', () => {
    const c = defaultCriteria(signals());
    expect(c.length).toBeLessThanOrEqual(4);
    expect(c.map((x) => describeCriterion(x))).toEqual(['ROCE below 9.8%', 'Debt to equity above 0.5x', 'Promoter holding change over four quarters below -3 pts', 'Latest quarter profit growth (YoY) below -25%']);
    expect(c.every((x) => x.enabled && !x.breached && x.baseline !== null && x.source === 'default')).toBe(true);
  });
  it('never proposes a criterion that is already breached, or a metric it cannot read', () => {
    const c = defaultCriteria(signals({ profitYoy: -87.7, salesYoy: -20, roce: null, de: null }));
    expect(c.map((x) => x.metric)).toEqual(['roe', 'promoterChange4q', 'negativeNewsPct']);
  });
  it('uses ROE as the capital-efficiency measure when ROCE is not available (banks, insurers)', () => {
    expect(defaultCriteria(signals({ roce: null, roe: 10, de: null, financial: true })).map((x) => describeCriterion(x))).toContain('ROE below 7%');
    expect(defaultCriteria(signals()).map((x) => x.metric)).not.toContain('roe');
  });
  it('skips debt for a financial company and news share with too few headlines', () => {
    const metrics = defaultCriteria(signals({ financial: true, headlines: 2 })).map((x) => x.metric);
    expect(metrics).not.toContain('debtToEquity');
    expect(metrics).not.toContain('negativeNewsPct');
  });
});

describe('validateProposed', () => {
  it('keeps valid proposals with their reason and fixes the direction from the metric', () => {
    const c = validateProposed([{ metric: 'roce', threshold: 10, why: 'Capital efficiency is the core of the thesis.' }, { metric: 'debtToEquity', threshold: '0.6' }], signals());
    expect(c.map((x) => [x.metric, x.op, x.threshold, x.source])).toEqual([['roce', 'below', 10, 'analyst'], ['debtToEquity', 'above', 0.6, 'analyst']]);
    expect(c[0].why).toMatch(/core of the thesis/);
  });
  it('drops unknown metrics, implausible or non-numeric thresholds, duplicates, junk and already-breached ones', () => {
    const c = validateProposed(['x', null, { metric: 'sharePrice', threshold: 5 }, { metric: 'roce', threshold: 900 }, { metric: 'roce', threshold: 'abc' }, { metric: 'roce', threshold: 20 }, { metric: 'roe', threshold: 8 }, { metric: 'roe', threshold: 7 }], signals());
    expect(c.map((x) => x.metric)).toEqual(['roe']);
    expect(c[0].threshold).toBe(8);
    expect(validateProposed('nope', signals())).toEqual([]);
  });
});

describe('chooseCriteria', () => {
  it('uses the analyst\'s proposals when there are two or more', () => {
    const p = validateProposed([{ metric: 'roce', threshold: 10 }, { metric: 'roe', threshold: 8 }], signals());
    expect(chooseCriteria(p, signals()).map((c) => c.source)).toEqual(['analyst', 'analyst']);
  });
  it('tops up with defaults for other metrics when the analyst gave too few, up to four', () => {
    const p = validateProposed([{ metric: 'roce', threshold: 10 }], signals());
    const c = chooseCriteria(p, signals());
    expect(c[0].source).toBe('analyst');
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c.length).toBeLessThanOrEqual(4);
    expect(new Set(c.map((x) => x.metric)).size).toBe(c.length);
  });
});

describe('evaluateCriteria', () => {
  it('reports a breach once, then stays quiet while it persists', () => {
    const first = evaluateCriteria([crit()], signals({ roce: 8 }));
    expect(first.breaches.map((b) => [b.criterion.metric, b.value])).toEqual([['roce', 8]]);
    expect(first.criteria[0].breached).toBe(true);
    const second = evaluateCriteria(first.criteria, signals({ roce: 7 }));
    expect(second.breaches).toEqual([]);
  });
  it('re-arms when the metric recovers, so a later breach is reported again', () => {
    const breached = evaluateCriteria([crit()], signals({ roce: 8 })).criteria;
    const recovered = evaluateCriteria(breached, signals({ roce: 12 }));
    expect(recovered.criteria[0].breached).toBe(false);
    expect(evaluateCriteria(recovered.criteria, signals({ roce: 8 })).breaches).toHaveLength(1);
  });
  it('skips disabled criteria and metrics it cannot read, and never mutates its input', () => {
    const input = [crit({ enabled: false }), crit({ id: 'roe', metric: 'roe', threshold: 5 })];
    const frozen = JSON.stringify(input);
    const r = evaluateCriteria(input, signals({ roce: 1, roe: null }));
    expect(r.breaches).toEqual([]);
    expect(JSON.stringify(input)).toBe(frozen);
  });
  it('uses the right direction for "above" metrics', () => {
    const c = crit({ id: 'debtToEquity', metric: 'debtToEquity', op: 'above', threshold: 0.5, baseline: 0.02 });
    expect(evaluateCriteria([c], signals({ de: 0.4 })).breaches).toEqual([]);
    expect(evaluateCriteria([c], signals({ de: 0.9 })).breaches).toHaveLength(1);
  });
});

describe('breachEntry', () => {
  it('writes a high-alert thesis entry saying what changed and by how much, and never a sell call', () => {
    const [b] = evaluateCriteria([crit()], signals({ roce: 8 })).breaches;
    const e = breachEntry(b, 'ACC', new Date('2026-11-12T10:00:00Z'));
    expect(e).toMatchObject({ symbol: 'ACC', kind: 'thesis', alert: 'high', impact: 'negative', title: 'Thesis check: ROCE below 10%' });
    expect(e.body).toContain('ROCE is 8% against a limit of 10%, from 14% when the thesis was written (a change of -6 pts)');
    expect(e.body).toMatch(/not a recommendation/);
    expect(e.body).not.toMatch(/\b(sell|buy|exit)\b/i);
  });
  it('omits the history when there was no baseline', () => {
    const [b] = evaluateCriteria([crit({ baseline: null })], signals({ roce: 8 })).breaches;
    expect(breachEntry(b, 'ACC', new Date()).body).not.toContain('when the thesis was written');
  });
});

describe('applyCriterionAction', () => {
  const list = [crit(), crit({ id: 'roe', metric: 'roe' })];
  it('switches a criterion off and on, or removes it, without touching the input', () => {
    const frozen = JSON.stringify(list);
    expect(applyCriterionAction(list, 'roce', 'disable')?.map((c) => [c.id, c.enabled])).toEqual([['roce', false], ['roe', true]]);
    expect(applyCriterionAction(list, 'roe', 'remove')?.map((c) => c.id)).toEqual(['roce']);
    expect(applyCriterionAction(applyCriterionAction(list, 'roce', 'disable') ?? [], 'roce', 'enable')?.[0].enabled).toBe(true);
    expect(JSON.stringify(list)).toBe(frozen);
  });
  it('is null for a criterion that does not exist', () => {
    expect(applyCriterionAction(list, 'debtToEquity', 'remove')).toBeNull();
  });
});
